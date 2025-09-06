// Outbox catalog backed by Upstash List (LPUSH newest first)
// Key: air:outbox (override with OUTBOX_KEY)

const { lpush, lrange, ltrim } = require('./upstash');

const OUTBOX_KEY = process.env.OUTBOX_KEY || 'air:outbox';
const MAX_OUTBOX = Number(process.env.OUTBOX_MAX || 5000);

// entry: { id, sentAt, to, subject, text, html, section, meta }
async function addSentEmail(entry) {
  const e = {
    id: entry.id || undefined,
    sentAt: entry.sentAt || new Date().toISOString(),
    to: entry.to,
    subject: entry.subject,
    text: entry.text,
    html: entry.html,
    section: entry.section || null,
    meta: entry.meta || {},
  };
  await lpush(OUTBOX_KEY, JSON.stringify(e));
  await ltrim(OUTBOX_KEY, 0, MAX_OUTBOX - 1);
  return e;
}

// Pagination via offset+limit. Returns { items, totalApprox }
async function fetchOutbox(offset = 0, limit = 20) {
  const start = Number(offset) || 0;
  const end = start + (Number(limit) || 20) - 1;
  const out = await lrange(OUTBOX_KEY, start, end);
  const arr = out && out.result ? out.result : [];
  const items = arr.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  // We don't have exact length without LLEN; provide an approximate via (start+items.length) if needed
  return { items, totalApprox: start + items.length };
}

module.exports = { addSentEmail, fetchOutbox, OUTBOX_KEY };
