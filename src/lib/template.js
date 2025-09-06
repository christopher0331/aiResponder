// Email template generator with AI integration
// Uses settings + form payload to produce subject, html, text
const { generateReply } = require('./ai');

async function buildEmail({ settings, job }) {
  const form = job.form || {};
  const name = form.name || form.fullName || '';
  const toEmail = form.email || '';
  const userSubject = form.subject || '';
  const business = settings.businessName || '';

  const subject = (settings.subject || 'Thank you for reaching out') + (business ? ` — ${business}` : '');

  // Try AI
  let aiText = null;
  try {
    const ai = await generateReply({ form, settings });
    aiText = ai && ai.bodyText ? ai.bodyText : null;
  } catch {}

  let bodyText;
  if (aiText) {
    bodyText = aiText;
  } else {
    const intro = settings.systemInstructions
      ? settings.systemInstructions.split('\n')[0]
      : 'We received your message and will get back to you shortly.';
    const lines = [];
    lines.push(`Hi${name ? ' ' + name : ''},`);
    lines.push(intro);
    if (userSubject) lines.push(`Re: ${userSubject}`);
    bodyText = lines.join('\n');
  }
  if (settings.signature) bodyText += `\n\n${settings.signature}`;

  const text = bodyText;
  const html = `<div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.5; color:#eaeef2">\n<p>Hi${name ? ' ' + escapeHtml(name) : ''},</p>\n<p>${escapeHtml(bodyText)}</p>\n</div>`;

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
