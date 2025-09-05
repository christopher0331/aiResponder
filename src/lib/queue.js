// FIFO queue built on Upstash List
// Key: air:jobs

const { rpush, lpop, llen } = require('./upstash');

const QUEUE_KEY = process.env.QUEUE_KEY || 'air:jobs';

async function enqueueJob(job) {
  const payload = JSON.stringify(job);
  const out = await rpush(QUEUE_KEY, payload);
  return out?.result;
}

async function dequeueJob() {
  const out = await lpop(QUEUE_KEY);
  if (!out || out.result == null) return null;
  try {
    return JSON.parse(out.result);
  } catch {
    return null;
  }
}

async function queueLength() {
  const out = await llen(QUEUE_KEY);
  return Number(out?.result || 0);
}

module.exports = { enqueueJob, dequeueJob, queueLength, QUEUE_KEY };
