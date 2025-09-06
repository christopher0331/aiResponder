// Minimal FIFO worker: LPOP from Upstash and send via Resend
// Run: node worker.js
// Or trigger via POST /api/worker/run (server.js)

const { dequeueJob, queueLength, enqueueJob } = require('./src/lib/queue');
const { getSettings } = require('./src/lib/settings');
const { sendEmail } = require('./src/lib/resend');
const { buildEmail } = require('./src/lib/template');
const { logEvent } = require('./src/lib/logger');
const { matchSection } = require('./src/lib/ai');
const { addSentEmail } = require('./src/lib/outbox');

async function processOne() {
  await logEvent('worker.dequeue.attempt', {});
  const job = await dequeueJob();
  if (!job) return { processed: 0 };

  const settings = await getSettings();
  if (!settings.enableAutoResponder) {
    await logEvent('worker.skip.disabled', { id: job.id });
    return { processed: 0, skipped: true, reason: 'disabled' };
  }

  // Delay handling: section override > default
  try {
    const { matched } = matchSection(job.form || {}, settings);
    const delaySec = Number((matched && matched.delaySeconds != null ? matched.delaySeconds : settings.defaultDelaySeconds) || 0);
    const notBefore = (job.receivedAt || 0) + delaySec * 1000;
    const now = Date.now();
    if (delaySec > 0 && now < notBefore) {
      const remaining = Math.ceil((notBefore - now) / 1000);
      await logEvent('worker.delay.defer', { id: job.id, remainingSeconds: remaining, delaySec });
      // Re-enqueue to the tail to check later
      await enqueueJob(job);
      return { processed: 0, skipped: true, reason: 'delay', remaining };
    }
  } catch (e) {
    await logEvent('worker.delay.error', { id: job.id, error: String(e && e.message || e) });
  }

  const mail = await buildEmail({ settings, job });
  if (!mail.toEmail) {
    await logEvent('worker.skip.no_to', { id: job.id });
    return { processed: 0, skipped: true, reason: 'no toEmail' };
  }

  try {
    const sendRes = await sendEmail({
      to: mail.toEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      from: settings.fromEmail || process.env.RESEND_FROM,
    });
    await logEvent('worker.send.success', { id: job.id });
    try {
      await addSentEmail({
        id: sendRes && sendRes.id,
        to: mail.toEmail,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        section: (matchSection(job.form || {}, settings).matched || {}).name || null,
        meta: { jobId: job.id },
      });
    } catch {}
    await logEvent('worker.send.success', { id: job.id, to: mail.toEmail, subject: mail.subject });
    return { processed: 1, to: mail.toEmail };
  } catch (e) {
    await logEvent('worker.send.error', { id: job.id, error: String(e && e.message || e) });
    return { processed: 0, error: true };
  }
}

async function runOnce(maxBatch = 25) {
  let processed = 0;
  for (let i = 0; i < maxBatch; i++) {
    const res = await processOne();
    if (!res || res.processed !== 1) break;
    processed += 1;
  }
  const remaining = await queueLength();
  await logEvent('worker.run.summary', { processed, remaining });
  return { processed, remaining };
}

// If run directly from CLI, execute once
if (require.main === module) {
  runOnce().then((r) => {
    console.log(`[worker] processed=${r.processed} remaining=${r.remaining}`);
  }).catch((e) => {
    console.error('[worker] error', e);
    process.exitCode = 1;
  });
}

module.exports = { runOnce };
