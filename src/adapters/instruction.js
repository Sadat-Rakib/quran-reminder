'use strict';

const data = require('../core/data');
const render = require('../core/render');
const select = require('../core/select');

/**
 * Pick a verse for a static instruction file. These files are refreshed with
 * `quran refresh`, so we simply take the current theme's pool.
 */
function pickAyah(config, rng = Math.random) {
  const theme = select.resolveTheme(config);
  return select.selectAyah({ theme, rng }) || data.all()[0] || null;
}

function verseBlock(config, options = {}) {
  const ayah = options.ayah || pickAyah(config);
  if (!ayah) return '> No bundled Quran data found. Run `npm run build:data`.';
  return render.renderMarkdown(ayah, {
    translation: config.translation,
    showArabic: options.showArabic !== false,
    showTransliteration: config.showTransliteration !== false,
    showTranslation: config.showTranslation !== false,
    showLink: config.showLink !== false,
  });
}

function instructionBody(config, options = {}) {
  const title = options.title || 'Quran reminder';
  const intro =
    options.intro ||
    'A verse for reflection before the work begins. This file is managed by `quran-reminder`; run `quran refresh` to rotate the verse.';
  return [`# ${title}`, '', intro, '', verseBlock(config, options)].join('\n');
}

module.exports = { pickAyah, verseBlock, instructionBody };
