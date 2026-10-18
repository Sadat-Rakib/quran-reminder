'use strict';

const data = require('./data');

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[38;2;45;106;79m',
  greenBright: '\x1b[38;2;82;183;136m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const BOX = {
  tl: '╭',
  tr: '╮',
  bl: '╰',
  br: '╯',
  h: '─',
  v: '│',
};

const MIN_PANEL_WIDTH = 40;
const DEFAULT_WIDTH = 64;

function isWide(codePoint) {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function isZeroWidth(codePoint) {
  return (
    codePoint === 0x200b ||
    codePoint === 0x200c ||
    codePoint === 0x200d ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x0610 && codePoint <= 0x061a) ||
    (codePoint >= 0x064b && codePoint <= 0x065f) ||
    codePoint === 0x0670 ||
    (codePoint >= 0x06d6 && codePoint <= 0x06ed) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  );
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '');
}

function displayWidth(text) {
  let width = 0;
  for (const char of stripAnsi(text)) {
    const codePoint = char.codePointAt(0);
    if (isZeroWidth(codePoint)) continue;
    width += isWide(codePoint) ? 2 : 1;
  }
  return width;
}

/** Hard-split a single over-long word into width-sized chunks. */
function splitLongWord(word, width) {
  const parts = [];
  let current = '';
  let currentWidth = 0;
  for (const char of word) {
    const codePoint = char.codePointAt(0);
    const charWidth = isZeroWidth(codePoint) ? 0 : isWide(codePoint) ? 2 : 1;
    if (currentWidth + charWidth > width && current) {
      parts.push(current);
      current = '';
      currentWidth = 0;
    }
    current += char;
    currentWidth += charWidth;
  }
  if (current) parts.push(current);
  return parts;
}

/** Word-wrap to a display width, preserving word boundaries where possible. */
function wrapText(text, width) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  const words = clean.split(' ');
  const lines = [];
  let line = '';
  let lineWidth = 0;

  for (const word of words) {
    const wordWidth = displayWidth(word);
    const separator = line ? 1 : 0;
    if (lineWidth + separator + wordWidth <= width) {
      line = line ? `${line} ${word}` : word;
      lineWidth += separator + wordWidth;
      continue;
    }
    if (line) lines.push(line);
    if (wordWidth > width) {
      const chunks = splitLongWord(word, width);
      lines.push(...chunks.slice(0, -1));
      line = chunks[chunks.length - 1] || '';
      lineWidth = displayWidth(line);
    } else {
      line = word;
      lineWidth = wordWidth;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function paint(text, color, colorName) {
  if (!color) return text;
  return `${ANSI[colorName]}${text}${ANSI.reset}`;
}

function pad(text, width, align = 'left') {
  const gap = Math.max(0, width - displayWidth(text));
  if (align === 'right') return ' '.repeat(gap) + text;
  return text + ' '.repeat(gap);
}

function boxLine(content, innerWidth, color, align) {
  const padded = pad(content, innerWidth, align);
  return (
    paint(BOX.v, color, 'green') + ' ' + padded + ' ' + paint(BOX.v, color, 'green')
  );
}

function translationOf(ayah, translation) {
  return data.translationFor(ayah, translation);
}

function renderPanel(ayah, options = {}) {
  const color = Boolean(options.color);
  const translation = options.translation || 'yusufali';
  const requestedWidth = options.width || DEFAULT_WIDTH;
  const columns = options.columns || 80;

  if (columns < MIN_PANEL_WIDTH || requestedWidth < MIN_PANEL_WIDTH) {
    return renderPlain(ayah, { ...options, color: false });
  }

  const width = Math.min(requestedWidth, columns, 100);
  const innerWidth = width - 4;
  const lines = [];

  if (options.showArabic && ayah.arabic) {
    for (const line of wrapText(ayah.arabic, innerWidth)) {
      lines.push(boxLine(line + '\u200F', innerWidth, color, 'right'));
    }
    lines.push(boxLine('', innerWidth, color));
  }

  if (options.showTransliteration !== false && ayah.transliteration) {
    for (const line of wrapText(ayah.transliteration, innerWidth)) {
      lines.push(boxLine(paint(line, color, 'dim'), innerWidth, color));
    }
    lines.push(boxLine('', innerWidth, color));
  }

  if (options.showTranslation !== false) {
    for (const line of wrapText(translationOf(ayah, translation), innerWidth)) {
      lines.push(boxLine(line, innerWidth, color));
    }
    lines.push(boxLine('', innerWidth, color));
  }

  const reference = `— ${ayah.surahName} ${ayah.surah}:${ayah.ayah}`;
  lines.push(boxLine(paint(reference, color, 'greenBright'), innerWidth, color));

  if (options.showLink !== false) {
    const url = ayah.url || `https://quran.com/${ayah.surah}/${ayah.ayah}`;
    lines.push(boxLine(paint(url, color, 'dim'), innerWidth, color));
  }

  const top =
    paint(BOX.tl, color, 'green') +
    paint(BOX.h.repeat(width - 2), color, 'green') +
    paint(BOX.tr, color, 'green');
  const bottom =
    paint(BOX.bl, color, 'green') +
    paint(BOX.h.repeat(width - 2), color, 'green') +
    paint(BOX.br, color, 'green');
  const empty = boxLine('', innerWidth, color);

  return ['', top, empty, ...lines, empty, bottom, ''].join('\n');
}

function renderPlain(ayah, options = {}) {
  const translation = options.translation || 'yusufali';
  const lines = [];
  if (options.showArabic && ayah.arabic) lines.push(ayah.arabic);
  if (options.showTransliteration !== false && ayah.transliteration) {
    lines.push(ayah.transliteration);
  }
  if (options.showTranslation !== false) {
    lines.push(`"${translationOf(ayah, translation)}"`);
  }
  lines.push(`— ${ayah.surahName} ${ayah.surah}:${ayah.ayah}`);
  if (options.showLink !== false) {
    lines.push(ayah.url || `https://quran.com/${ayah.surah}/${ayah.ayah}`);
  }
  return lines.join('\n');
}

function renderMarkdown(ayah, options = {}) {
  const translation = options.translation || 'yusufali';
  const url = ayah.url || `https://quran.com/${ayah.surah}/${ayah.ayah}`;
  const parts = [];
  if (options.showArabic && ayah.arabic) parts.push(`> ${ayah.arabic}`);
  if (options.showTransliteration !== false && ayah.transliteration) {
    parts.push(`> *${ayah.transliteration}*`);
  }
  if (options.showTranslation !== false) {
    parts.push(`> ${translationOf(ayah, translation)}`);
  }
  parts.push(`> — **${ayah.surahName} ${ayah.surah}:${ayah.ayah}** · [quran.com](${url})`);
  return parts.join('\n>\n');
}

function renderOneline(ayah, options = {}) {
  const translation = options.translation || 'yusufali';
  const url = ayah.url || `https://quran.com/${ayah.surah}/${ayah.ayah}`;
  return `${translationOf(ayah, translation)} — ${ayah.surahName} ${ayah.surah}:${ayah.ayah} — ${url}`;
}

function renderJson(ayah, options = {}) {
  const translation = options.translation || 'yusufali';
  return JSON.stringify(
    {
      ref: ayah.ref,
      surah: ayah.surah,
      ayah: ayah.ayah,
      surahName: ayah.surahName,
      surahNameArabic: ayah.surahNameArabic,
      surahMeaning: ayah.surahMeaning,
      themes: ayah.themes,
      arabic: ayah.arabic,
      transliteration: ayah.transliteration,
      translation: translationOf(ayah, translation),
      translationSource: translation,
      url: ayah.url,
    },
    null,
    2
  );
}

/** Compact text used when injecting the reminder into a model's context. */
function renderContext(ayah, options = {}) {
  const translation = options.translation || 'yusufali';
  const url = ayah.url || `https://quran.com/${ayah.surah}/${ayah.ayah}`;
  return [
    `Quran reminder — ${ayah.surahName} ${ayah.surah}:${ayah.ayah}`,
    `"${translationOf(ayah, translation)}"`,
    url,
  ].join('\n');
}

function render(ayah, options = {}) {
  const format = options.format || 'panel';
  switch (format) {
    case 'plain':
      return renderPlain(ayah, options);
    case 'markdown':
    case 'md':
      return renderMarkdown(ayah, options);
    case 'oneline':
      return renderOneline(ayah, options);
    case 'json':
      return renderJson(ayah, options);
    case 'context':
      return renderContext(ayah, options);
    case 'panel':
    default:
      return renderPanel(ayah, options);
  }
}

module.exports = {
  displayWidth,
  wrapText,
  renderPanel,
  renderPlain,
  renderMarkdown,
  renderOneline,
  renderJson,
  renderContext,
  render,
  ANSI,
};
