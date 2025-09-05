// Minimal FIFO worker: LPOP from Upstash and send via Resend
// Run: node worker.js
// Or trigger via POST /api/worker/run (server.js)

const { dequeueJob, queueLength } = require('./src/lib/queue');
const { getSettings } = require('./src/lib/settings');
const { sendEmail } = require('./src/lib/resend');
const { buildEmail } = require('./src/lib/template');

async function processOne() {
  const job = await dequeueJob();
  if (!job) return { processed: 0 };

  const settings = await getSettings();
  if (!settings.enableAutoResponder) {
    return { processed: 0, skipped: true, reason: 'disabled' };
  }

  const mail = buildEmail({ settings, job });
  if (!mail.toEmail) {
    return { processed: 0, skipped: true, reason: 'no toEmail' };
  }

  await sendEmail({
    to: mail.toEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    from: settings.fromEmail || process.env.RESEND_FROM,
  });

  return { processed: 1, to: mail.toEmail };
}

async function runOnce(maxBatch = 25) {
  let processed = 0;
  for (let i = 0; i < maxBatch; i++) {
    const res = await processOne();
    if (!res || res.processed !== 1) break;
    processed += 1;
  }
  const remaining = await queueLength();
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
