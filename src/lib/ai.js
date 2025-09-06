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

  // Determine best-matching section based on keywords in subject/message
  const sections = Array.isArray(settings.sections) ? settings.sections : [];
  const hay = `${toText(form.subject)}\n${toText(form.message)}`.toLowerCase();
  let matched = null;
  let matchedScore = -1;
  for (const s of sections) {
    if (s && s.enabled === false) continue;
    const kws = (s.keywords || []).map((k) => String(k || '').toLowerCase()).filter(Boolean);
    let score = 0;
    for (const k of kws) {
      if (k && hay.includes(k)) score += 1;
    }
    // Boost by priority (higher wins)
    const pr = Number(s.priority || 0);
    score += pr * 0.01; // tiny boost
    if (score > matchedScore && score > 0) { matched = s; matchedScore = score; }
  }
  let matchedName = null;
  if (matched) {
    matchedName = matched.name || '';
    try { await logEvent('section.matched', { name: matchedName, score: matchedScore }); } catch {}
  }

  const system = [
    'You are a front desk email replier for a small business.',
    'Your goal is to reply to incoming website form submissions quickly and helpfully.',
    `Tone: ${settings.tone || 'friendly, concise, professional'}.`,
    `Limit yourself to ${settings.maxSentences || 2} sentences.`,
    'Avoid em dashes. Keep it sounding human.',
    settings.systemInstructions ? `Business-specific guidance: ${settings.systemInstructions}` : '',
    matched && matched.instructions ? `IMPORTANT domain rule to apply: ${matched.instructions}` : '',
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
    await logEvent('ai.generate.request', { model: MODEL, section: matchedName });
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
    await logEvent('ai.generate.result', { usedAI: true, section: matchedName });
    return { bodyText: trimmed, usedAI: true, matchedSection: matchedName, debug: { system, user } };
  } catch (e) {
    await logEvent('ai.generate.error', { error: String(e && e.message || e) });
    return { bodyText: null, usedAI: false, reason: 'error', matchedSection: matchedName, debug: { system, user } };
  }
}

module.exports = { generateReply };
