'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const data = require('../src/core/data');
const paths = require('../src/core/paths');

// Canonical number of ayahs per surah (Hafs / Uthmani numbering, 6236 total).
const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89,
  59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30,
  52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15,
  21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

const THEMES = ['ilm', 'tawakkul', 'shukr', 'ihsan', 'sabr'];

test('dataset loads and declares its metadata', () => {
  const meta = data.meta();
  assert.ok(meta, 'meta should load');
  assert.equal(meta.version, 1);
  assert.deepEqual(meta.themes, THEMES);
  assert.ok(meta.ayahCount >= 100, 'at least 100 curated ayahs');
  assert.equal(meta.ayahCount, data.all().length);
});

test('canonical ayah counts are internally consistent', () => {
  assert.equal(AYAH_COUNTS.length, 114);
  assert.equal(
    AYAH_COUNTS.reduce((sum, count) => sum + count, 0),
    6236,
    'the Quran has 6236 ayahs in the Hafs reading'
  );
});

test('every ayah is complete and well-formed', () => {
  const seen = new Set();
  for (const ayah of data.all()) {
    assert.match(ayah.ref, /^\d{1,3}:\d{1,3}$/, `bad ref ${ayah.ref}`);
    assert.equal(`${ayah.surah}:${ayah.ayah}`, ayah.ref);
    assert.ok(ayah.surah >= 1 && ayah.surah <= 114, `${ayah.ref}: surah out of range`);
    assert.ok(
      ayah.ayah >= 1 && ayah.ayah <= AYAH_COUNTS[ayah.surah - 1],
      `${ayah.ref}: ayah ${ayah.ayah} exceeds surah length ${AYAH_COUNTS[ayah.surah - 1]}`
    );
    assert.ok(!seen.has(ayah.ref), `duplicate ref ${ayah.ref}`);
    seen.add(ayah.ref);

    assert.ok(ayah.surahName && ayah.surahName.trim(), `${ayah.ref}: missing surah name`);
    assert.ok(/[\u0600-\u06FF]/.test(ayah.arabic), `${ayah.ref}: Arabic text missing`);
    assert.ok(ayah.transliteration.trim().length > 3, `${ayah.ref}: transliteration missing`);
    for (const key of ['yusufali', 'pickthall']) {
      assert.ok(ayah.translations[key], `${ayah.ref}: ${key} translation missing`);
      assert.ok(ayah.translations[key].length > 5, `${ayah.ref}: ${key} translation too short`);
      assert.ok(!/<[^>]+>/.test(ayah.translations[key]), `${ayah.ref}: HTML leaked into ${key}`);
    }
    assert.equal(ayah.url, `https://quran.com/${ayah.surah}/${ayah.ayah}`);
    assert.ok(Array.isArray(ayah.themes) && ayah.themes.length > 0, `${ayah.ref}: no theme`);
    for (const theme of ayah.themes) {
      assert.ok(THEMES.includes(theme), `${ayah.ref}: unknown theme ${theme}`);
    }
  }
});

test('no Basmala leaked into the first ayah of a surah', () => {
  const offenders = data
    .all()
    .filter((ayah) => ayah.ayah === 1 && ayah.surah !== 1 && ayah.arabic.includes('بِسْمِ ٱللَّهِ'));
  assert.deepEqual(offenders.map((ayah) => ayah.ref), []);
});

test('every theme has a healthy pool', () => {
  for (const theme of THEMES) {
    const pool = data.byTheme(theme);
    assert.ok(pool.length >= 20, `${theme} only has ${pool.length} ayahs`);
    assert.ok(pool.every((ayah) => ayah.themes.includes(theme)));
  }
});

test('translations resolve and fall back safely', () => {
  const ayah = data.all()[0];
  assert.equal(data.translationFor(ayah, 'yusufali'), ayah.translations.yusufali);
  assert.equal(data.translationFor(ayah, 'pickthall'), ayah.translations.pickthall);
  assert.equal(data.translationFor(ayah, 'unknown'), ayah.translations.yusufali);
});

test('manifest checksum matches the committed dataset', () => {
  const manifest = JSON.parse(fs.readFileSync(paths.manifestFile, 'utf8'));
  const actual = crypto.createHash('sha256').update(fs.readFileSync(paths.dataFile)).digest('hex');
  assert.equal(actual, manifest.sha256);
  assert.equal(manifest.ayahCount, data.all().length);
});

test('known verses match their well-known text', () => {
  const iqra = data.byRef('96:1');
  assert.match(iqra.arabic, /ٱقْرَأْ/);
  assert.match(iqra.translations.yusufali, /read/i);

  const sabr = data.byRef('2:153');
  assert.match(sabr.translations.yusufali, /patient/i);

  const tawakkul = data.byRef('65:3');
  assert.match(tawakkul.translations.pickthall, /trust/i);
});
