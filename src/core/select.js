'use strict';

const data = require('./data');

/**
 * Time-of-day theme, preserved from the original project:
 *   04:00–08:59  ilm       (Fajr / early morning / intention)
 *   09:00–16:59  tawakkul  (Dhuhr / Asr / effort)
 *   17:00–03:59  shukr     (Maghrib / Isha / gratitude and reflection)
 */
function themeForTime(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 9) return 'ilm';
  if (hour >= 9 && hour < 17) return 'tawakkul';
  return 'shukr';
}

function resolveTheme(config = {}, date = new Date()) {
  const configured = config.theme || 'auto';
  if (configured === 'auto') return themeForTime(date);
  if (configured === 'random') {
    const pool = data.themes();
    return pool[Math.floor(Math.random() * pool.length)] || themeForTime(date);
  }
  return configured;
}

function shuffle(items, rng) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Pick one ayah for a theme.
 *
 * @param {object} options
 * @param {string} options.theme
 * @param {string[]} [options.avoidRefs] refs to avoid if possible
 * @param {() => number} [options.rng]
 * @returns {object|null}
 */
function selectAyah({ theme, avoidRefs = [], rng = Math.random } = {}) {
  let pool = data.byTheme(theme);
  if (!pool.length) pool = data.all();
  if (!pool.length) return null;

  const avoid = new Set(avoidRefs);
  const fresh = pool.filter((ayah) => !avoid.has(ayah.ref));
  const candidates = fresh.length ? fresh : pool;

  const index = Math.floor(rng() * candidates.length);
  return candidates[Math.min(index, candidates.length - 1)];
}

module.exports = { themeForTime, resolveTheme, selectAyah, shuffle };
