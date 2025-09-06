// Simple logger backed by Upstash List (LPUSH newest first)
// Key: air:logs (override with LOG_KEY)

const { lpush, lrange, ltrim } = require('./upstash');

const LOG_KEY = process.env.LOG_KEY || 'air:logs';
const MAX_LOGS = Number(process.env.LOG_MAX || 2000);

async function logEvent(type, data = {}) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      type,
      data,
    };
    await lpush(LOG_KEY, JSON.stringify(entry));
    // Keep list bounded
    await ltrim(LOG_KEY, 0, MAX_LOGS - 1);
  } catch (e) {
    // As a last resort, print to console
    console.error('[logger] failed to write log', e);
  }
}

async function fetchLogs(limit = 200) {
  const n = Math.min(Number(limit) || 200, MAX_LOGS);
  // lrange 0..n-1 gets most recent first (because we LPUSH)
  const out = await lrange(LOG_KEY, 0, n - 1);
  const arr = out && out.result ? out.result : [];
  return arr.map((s) => {
    try { return JSON.parse(s); } catch { return { ts: '', type: 'parse_error', data: { raw: s } }; }
  });
}

module.exports = { logEvent, fetchLogs, LOG_KEY };
