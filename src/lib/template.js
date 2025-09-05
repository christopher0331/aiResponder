// Minimal email template generator (no AI yet)
// Uses settings + form payload to produce subject, html, text

function buildEmail({ settings, job }) {
  const form = job.form || {};
  const name = form.name || form.fullName || '';
  const toEmail = form.email || '';
  const userSubject = form.subject || '';
  const business = settings.businessName || '';

  const subject = (settings.subject || 'Thank you for reaching out') + (business ? ` — ${business}` : '');

  const intro = settings.systemInstructions
    ? settings.systemInstructions.split('\n')[0]
    : 'We received your message and will get back to you shortly.';

  // Keep body short per maxSentences. For MVP, just 1-2 short lines.
  const lines = [];
  lines.push(`Hi${name ? ' ' + name : ''},`);
  lines.push(intro);
  if (userSubject) lines.push(`Re: ${userSubject}`);
  if (settings.signature) lines.push('', settings.signature);

  const text = lines.join('\n');
  const html = `<div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.5; color:#111">\n<p>Hi${name ? ' ' + escapeHtml(name) : ''},</p>\n<p>${escapeHtml(intro)}</p>\n${userSubject ? `<p><strong>Re:</strong> ${escapeHtml(userSubject)}</p>` : ''}\n${settings.signature ? `<p style="margin-top:16px;">${escapeHtml(settings.signature)}</p>` : ''}\n</div>`;

  return { toEmail, subject, html, text };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { buildEmail };
