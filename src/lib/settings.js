// Settings helper backed by Upstash JSON with sane defaults
const { getJson, setJson } = require('./upstash');

const SETTINGS_KEY = process.env.SETTINGS_KEY || 'air:settings';

const DEFAULTS = {
  enableAutoResponder: true,
  subject: 'Thank you for reaching out',
  signature: '',
  tone: 'friendly, concise, professional',
  maxSentences: 2,
  fromEmail: process.env.RESEND_FROM || '',
};

async function getSettings() {
  const s = (await getJson(SETTINGS_KEY)) || {};
  return { ...DEFAULTS, ...s };
}

async function saveSettings(s) {
  const merged = { ...DEFAULTS, ...s };
  await setJson(SETTINGS_KEY, merged);
  return merged;
}

module.exports = { getSettings, saveSettings, SETTINGS_KEY, DEFAULTS };
