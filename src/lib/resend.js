// Resend email helper (no external packages)
// Env: RESEND_API_KEY, RESEND_FROM (optional default)

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DEFAULT_FROM = process.env.RESEND_FROM;

if (!RESEND_API_KEY) {
  console.warn('[resend] Missing RESEND_API_KEY');
}

async function sendEmail({ to, subject, html, text, from }) {
  const payload = {
    from: from || DEFAULT_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend send failed ${res.status}: ${JSON.stringify(body)}`);
  }
  return body; // { id: '...' }
}

module.exports = { sendEmail };
