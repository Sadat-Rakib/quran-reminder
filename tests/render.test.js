'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const render = require('../src/core/render');
const data = require('../src/core/data');

const AYAH = data.byRef('2:153');
const OPTIONS = {
  translation: 'yusufali',
  showArabic: false,
  showTransliteration: true,
  showTranslation: true,
  showLink: true,
  width: 64,
  columns: 80,
  color: false,
};

function visibleLines(text) {
  return text.split('\n').filter((line) => line.trim());
}

test('displayWidth ignores ANSI, diacritics and counts wide characters', () => {
  assert.equal(render.displayWidth('abc'), 3);
  assert.equal(render.displayWidth('\x1b[31mabc\x1b[0m'), 3);
  assert.equal(render.displayWidth('بِسْمِ'), render.displayWidth('بسم'));
  assert.equal(render.displayWidth('日本'), 4);
});

test('wrapText never exceeds the requested width', () => {
  const text =
    'This is a long translation that should wrap cleanly across several lines without ever exceeding the width limit.';
  for (const width of [20, 30, 44, 60]) {
    for (const line of render.wrapText(text, width)) {
      assert.ok(render.displayWidth(line) <= width, `"${line}" exceeds ${width}`);
    }
  }
});

test('wrapText hard-splits words longer than the width', () => {
  const url = 'https://quran.com/2/153/very/long/path/that/keeps/going';
  const lines = render.wrapText(url, 12);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(render.displayWidth(line) <= 12);
  assert.equal(lines.join(''), url);
});

test('panel is rectangular and contains the verse reference', () => {
  const panel = render.renderPanel(AYAH, OPTIONS);
  const lines = visibleLines(panel);
  const widths = new Set(lines.map((line) => render.displayWidth(line)));
  assert.equal(widths.size, 1, `ragged panel: ${[...widths].join(', ')}`);
  assert.equal([...widths][0], 64);
  assert.ok(panel.includes('Al-Baqarah 2:153'));
  assert.ok(panel.includes('https://quran.com/2/153'));
  assert.ok(panel.includes('patient'));
});

test('panel width follows the requested width', () => {
  const panel = render.renderPanel(AYAH, { ...OPTIONS, width: 50 });
  const widths = new Set(visibleLines(panel).map((line) => render.displayWidth(line)));
  assert.equal([...widths][0], 50);
});

test('narrow terminals fall back to plain text', () => {
  const panel = render.renderPanel(AYAH, { ...OPTIONS, columns: 30 });
  assert.ok(!panel.includes('╭'));
  assert.ok(panel.includes('Al-Baqarah 2:153'));
});

test('color is opt-in', () => {
  const plain = render.renderPanel(AYAH, OPTIONS);
  const colored = render.renderPanel(AYAH, { ...OPTIONS, color: true });
  assert.ok(!plain.includes('\x1b['));
  assert.ok(colored.includes('\x1b['));
  assert.equal(render.displayWidth(colored.split('\n')[1]), render.displayWidth(plain.split('\n')[1]));
});

test('Arabic can be included and is right-aligned', () => {
  const panel = render.renderPanel(AYAH, { ...OPTIONS, showArabic: true });
  assert.ok(panel.includes('يَـٰٓأَيُّهَا'));
  assert.ok(panel.includes('\u200F'));
});

test('plain, markdown, oneline and json formats', () => {
  const plain = render.renderPlain(AYAH, OPTIONS);
  assert.ok(plain.includes('— Al-Baqarah 2:153'));
  assert.ok(plain.includes('https://quran.com/2/153'));

  const markdown = render.renderMarkdown(AYAH, OPTIONS);
  assert.ok(markdown.startsWith('> '));
  assert.ok(markdown.includes('[quran.com](https://quran.com/2/153)'));
  assert.ok(markdown.includes('**Al-Baqarah 2:153**'));

  const oneline = render.renderOneline(AYAH, OPTIONS);
  assert.equal(oneline.split('\n').length, 1);
  assert.ok(oneline.includes('Al-Baqarah 2:153'));

  const json = JSON.parse(render.renderJson(AYAH, OPTIONS));
  assert.equal(json.ref, '2:153');
  assert.equal(json.translationSource, 'yusufali');
  assert.equal(json.translation, AYAH.translations.yusufali);
});

test('context output is compact and self-contained', () => {
  const context = render.renderContext(AYAH, OPTIONS);
  assert.ok(context.startsWith('Quran reminder — Al-Baqarah 2:153'));
  assert.ok(context.includes('https://quran.com/2/153'));
  assert.ok(context.split('\n').length <= 4);
});

test('pickthall translation can be selected', () => {
  const markdown = render.renderMarkdown(AYAH, { ...OPTIONS, translation: 'pickthall' });
  assert.ok(markdown.includes(AYAH.translations.pickthall));
});
