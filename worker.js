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
    // Owner notification (if configured)
    try {
      const owner = settings.ownerEmail || process.env.OWNER_EMAIL || '';
      if (owner) {
        const { matched } = matchSection(job.form || {}, settings);
        const matchedName = matched && matched.name ? matched.name : '—';
        const when = new Date().toLocaleString();
        const details = {
          jobId: job.id,
          receivedAt: job.receivedAt ? new Date(job.receivedAt).toLocaleString() : 'unknown',
          sentAt: when,
          matchedRule: matchedName,
          fromEmail: settings.fromEmail || process.env.RESEND_FROM,
          toEmail: mail.toEmail,
          subject: mail.subject,
        };
        const formPretty = JSON.stringify(job.form || {}, null, 2);
        const textBody = `AI Responder just handled a message.\n\nDetails:\n${Object.entries(details).map(([k,v])=>`${k}: ${v}`).join('\n')}\n\n--- Original Form Submission ---\n${formPretty}\n\n--- Response (text) ---\n${mail.text}`;
        const htmlBody = `<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.5">
  <h2 style="margin:0 0 8px 0">AI Responder: Message Handled</h2>
  <table style="border-collapse:collapse;font-size:14px">
    ${Object.entries(details).map(([k,v])=>`<tr><td style='padding:4px 8px;color:#555'>${k}</td><td style='padding:4px 8px'><strong>${String(v)}</strong></td></tr>`).join('')}
  </table>
  <h3 style="margin:16px 0 6px">Original Form Submission</h3>
  <pre style="white-space:pre-wrap;background:#f6f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:12px;color:#111">${escapeHtml(formPretty)}</pre>
  <h3 style="margin:16px 0 6px">Response (HTML Preview)</h3>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px">${mail.html}</div>
  <h3 style="margin:16px 0 6px">Response (Text)</h3>
  <pre style="white-space:pre-wrap;background:#f6f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:12px;color:#111">${escapeHtml(mail.text)}</pre>
  <div style="margin-top:12px;color:#666;font-size:12px">This is an automated notification sent to ${escapeHtml(owner)}.</div>
</div>`;
        await sendEmail({
          to: owner,
          subject: `AI Responder sent a reply to ${mail.toEmail}`,
          text: textBody,
          html: htmlBody,
          from: settings.fromEmail || process.env.RESEND_FROM,
        });
      }
    } catch (e) {
      await logEvent('worker.owner_notify.error', { id: job.id, error: String(e && e.message || e) });
    }
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
