// Simple HMAC-signed cookie auth (no external packages)
// Env: ADMIN_PASSWORD (plaintext for MVP), AUTH_SECRET (for signing)

const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUTH_SECRET = process.env.AUTH_SECRET || (process.env.RESEND_API_KEY ? crypto.createHash('sha256').update(process.env.RESEND_API_KEY).digest('hex') : 'dev-secret');

function sign(value) {
  const h = crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('hex');
  return `${value}.${h}`;
}

function unsign(signed) {
  if (!signed || typeof signed !== 'string') return null;
  const idx = signed.lastIndexOf('.');
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return value;
}

function setAuthCookie(res) {
  const token = sign('admin');
  const cookie = `ai_admin=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${60 * 60 * 12}`; // 12h
  res.setHeader('Set-Cookie', cookie);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', 'ai_admin=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
}

function isAuthed(req) {
  const cookie = parseCookies(req)['ai_admin'];
  const v = unsign(cookie);
  return v === 'admin';
}

function parseCookies(req) {
  const header = req.headers['cookie'] || '';
  const out = {};
  header.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i === -1) return;
    const k = p.slice(0, i).trim();
    const v = decodeURIComponent(p.slice(i + 1).trim());
    out[k] = v;
  });
  return out;
}

function checkPassword(pass) {
  if (!ADMIN_PASSWORD) return false;
  return pass === ADMIN_PASSWORD;
}

module.exports = { setAuthCookie, clearAuthCookie, isAuthed, checkPassword };
