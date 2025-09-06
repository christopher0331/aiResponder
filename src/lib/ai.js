// AI generation using OpenAI Chat Completions via fetch
// Env: NEXT_CHATGPT_API_KEY (token), AI_MODEL (optional)
// No external packages.

const { logEvent } = require('./logger');

const OPENAI_KEY = process.env.NEXT_CHATGPT_API_KEY || '';
// Use a valid default; can be overridden by AI_MODEL
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

function toText(val) {
  if (val == null) return '';
  return String(val);
}

function clampSentences(txt, maxSentences) {
  if (!maxSentences || maxSentences <= 0) return txt;
  const parts = txt.split(/(?<=[.!?])\s+/);
  return parts.slice(0, maxSentences).join(' ');
}

async function generateReply({ form, settings }) {
  // Fallback early if no key
  if (!OPENAI_KEY) {
    return { bodyText: null, usedAI: false, reason: 'missing_key' };
  }

  const system = [
    'You are a front desk email replier for a small business.',
    'Your goal is to reply to incoming website form submissions quickly and helpfully.',
    `Tone: ${settings.tone || 'friendly, concise, professional'}.`,
    `Limit yourself to ${settings.maxSentences || 2} sentences.`,
    'Avoid em dashes. Keep it sounding human.',
    settings.systemInstructions ? `Business-specific guidance: ${settings.systemInstructions}` : '',
  ].filter(Boolean).join('\n');

  const user = [
    'Compose a brief reply email to the following sender based on their message. Respond as the business.',
    `Name: ${toText(form.name)}`,
    `Email: ${toText(form.email)}`,
    `Subject: ${toText(form.subject)}`,
    `Message: ${toText(form.message)}`,
    form.formName ? `Form: ${toText(form.formName)}` : '',
    form.pageUrl ? `Page: ${toText(form.pageUrl)}` : '',
    '',
    'Return ONLY the email body text (no greeting like "Subject:" line, no markdown fences).',
  ].filter(Boolean).join('\n');

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.6,
  };

  // Newer "o" family models (e.g., gpt-4o, gpt-4o-mini) require max_completion_tokens
  const newTokenParam = /(^gpt-4o|^o\d|^gpt-4\.1|^gpt-4o-mini)/i.test(MODEL);
  const max = Number(process.env.AI_MAX_TOKENS || 200);
  if (newTokenParam) {
    payload.max_completion_tokens = max;
  } else {
    payload.max_tokens = max;
  }

  try {
    await logEvent('ai.generate.request', { model: MODEL });
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${JSON.stringify(json)}`);
    }
    const bodyText = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
    const trimmed = clampSentences(bodyText.trim(), settings.maxSentences || 2);
    await logEvent('ai.generate.result', { usedAI: true });
    return { bodyText: trimmed, usedAI: true };
  } catch (e) {
    await logEvent('ai.generate.error', { error: String(e && e.message || e) });
    return { bodyText: null, usedAI: false, reason: 'error' };
  }
}

module.exports = { generateReply };
