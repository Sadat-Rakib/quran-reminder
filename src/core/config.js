'use strict';

const fsutil = require('./fsutil');
const paths = require('./paths');

const THEMES = ['ilm', 'tawakkul', 'shukr', 'ihsan', 'sabr'];
const THEME_ALIASES = {
  auto: 'auto',
  random: 'random',
  knowledge: 'ilm',
  learning: 'ilm',
  reliance: 'tawakkul',
  trust: 'tawakkul',
  gratitude: 'shukr',
  thankfulness: 'shukr',
  excellence: 'ihsan',
  character: 'ihsan',
  patience: 'sabr',
  perseverance: 'sabr',
};
const TRANSLATIONS = ['yusufali', 'pickthall'];
const FREQUENCIES = ['session', 'daily', 'hourly', 'always'];
const FORMATS = ['panel', 'plain', 'markdown', 'json', 'oneline'];

const DEFAULTS = Object.freeze({
  version: 1,
  enabled: true,
  theme: 'auto',
  translation: 'yusufali',
  frequency: 'session',
  injectContext: true,
  showArabic: false,
  showTransliteration: true,
  showTranslation: true,
  showLink: true,
  color: 'auto', // auto | always | never
  width: 64,
  avoidDays: 3,
  timezone: null,
});

const VALIDATORS = {
  enabled: (value) => typeof value === 'boolean',
  theme: (value) =>
    value === 'auto' ||
    value === 'random' ||
    THEMES.includes(value) ||
    THEMES.includes(THEME_ALIASES[value]),
  translation: (value) => TRANSLATIONS.includes(value),
  frequency: (value) => FREQUENCIES.includes(value),
  injectContext: (value) => typeof value === 'boolean',
  showArabic: (value) => typeof value === 'boolean',
  showTransliteration: (value) => typeof value === 'boolean',
  showTranslation: (value) => typeof value === 'boolean',
  showLink: (value) => typeof value === 'boolean',
  color: (value) => ['auto', 'always', 'never'].includes(value),
  width: (value) => Number.isInteger(value) && value >= 40 && value <= 120,
  avoidDays: (value) => Number.isInteger(value) && value >= 0 && value <= 365,
  timezone: (value) => value === null || typeof value === 'string',
};

function coerce(key, raw) {
  if (raw === undefined) return { ok: false, error: `Unknown setting: ${key}` };
  if (key === 'width' || key === 'avoidDays') {
    const number = Number(raw);
    if (!Number.isInteger(number)) return { ok: false, error: `${key} must be a whole number` };
    raw = number;
  }
  if (key === 'enabled' || key === 'injectContext' || key.startsWith('show')) {
    if (typeof raw === 'string') {
      if (/^(true|yes|on|1)$/i.test(raw)) raw = true;
      else if (/^(false|no|off|0)$/i.test(raw)) raw = false;
    }
  }
  if (key === 'theme' && typeof raw === 'string') {
    const lower = raw.toLowerCase();
    raw = THEME_ALIASES[lower] || lower;
  }
  if (key === 'translation' && typeof raw === 'string') raw = raw.toLowerCase();
  if (key === 'frequency' && typeof raw === 'string') raw = raw.toLowerCase();
  if (key === 'timezone' && raw === '') raw = null;
  if (key === 'timezone' && raw === 'local') raw = null;

  const validate = VALIDATORS[key];
  if (!validate) return { ok: false, error: `Unknown setting: ${key}` };
  if (!validate(raw)) return { ok: false, error: `Invalid value for ${key}: ${raw}` };
  return { ok: true, value: raw };
}

function load(options = {}) {
  const file = options.file || paths.configFile();
  const result = fsutil.readJson(file);
  const config = { ...DEFAULTS };

  if (result.ok && result.data && typeof result.data === 'object') {
    for (const [key, value] of Object.entries(result.data)) {
      if (key === 'version') continue;
      if (!VALIDATORS[key]) continue;
      if (VALIDATORS[key](value)) config[key] = value;
    }
  }

  // Environment overrides are intentionally narrow and documented.
  if (/^(1|true|yes|on)$/i.test(process.env.QURAN_REMINDER_DISABLE || '')) config.enabled = false;
  if (process.env.QURAN_REMINDER_THEME) {
    const coerced = coerce('theme', process.env.QURAN_REMINDER_THEME);
    if (coerced.ok) config.theme = coerced.value;
  }
  if (process.env.QURAN_REMINDER_TRANSLATION) {
    const coerced = coerce('translation', process.env.QURAN_REMINDER_TRANSLATION);
    if (coerced.ok) config.translation = coerced.value;
  }
  if (process.env.NO_COLOR) config.color = 'never';

  return config;
}

function save(config, options = {}) {
  const file = options.file || paths.configFile();
  const clean = { version: DEFAULTS.version };
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'version') continue;
    if (config[key] !== undefined && VALIDATORS[key](config[key])) clean[key] = config[key];
  }
  fsutil.writeJson(file, clean);
  return clean;
}

function set(key, value, options = {}) {
  const coerced = coerce(key, value);
  if (!coerced.ok) return coerced;
  const config = load(options);
  config[key] = coerced.value;
  save(config, options);
  return { ok: true, key, value: coerced.value };
}

function reset(options = {}) {
  const file = options.file || paths.configFile();
  try {
    if (fsutil.exists(file)) require('fs').unlinkSync(file);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = {
  THEMES,
  TRANSLATIONS,
  FREQUENCIES,
  FORMATS,
  DEFAULTS,
  coerce,
  load,
  save,
  set,
  reset,
};
