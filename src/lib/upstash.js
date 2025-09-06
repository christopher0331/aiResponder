// Upstash Redis REST helper (Node 18+ for global fetch)
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

const BASE_URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!BASE_URL || !TOKEN) {
  console.warn('[upstash] Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
}

async function call(cmd, ...args) {
  const url = `${BASE_URL}/${cmd}/${args.map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json; // { result: ... }
}

// Simple JSON helpers using SET/GET
async function setJson(key, obj) {
  const value = JSON.stringify(obj);
  return call('set', key, value);
}
async function getJson(key) {
  const out = await call('get', key);
  if (!out || out.result == null) return null;
  try {
    return JSON.parse(out.result);
  } catch {
    return null;
  }
}

// List helpers for FIFO queue
async function rpush(key, value) { return call('rpush', key, value); }
async function lpop(key) { return call('lpop', key); }
async function llen(key) { return call('llen', key); }

// Additional list helpers for logging
async function lpush(key, value) { return call('lpush', key, value); }
async function lrange(key, start, stop) { return call('lrange', key, start, stop); }
async function ltrim(key, start, stop) { return call('ltrim', key, start, stop); }

module.exports = { call, setJson, getJson, rpush, lpop, llen, lpush, lrange, ltrim };
