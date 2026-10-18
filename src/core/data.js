'use strict';

const fs = require('fs');
const paths = require('./paths');

let cache = null;
let cacheError = null;

function load() {
  if (cache) return cache;
  if (cacheError) return null;
  try {
    const raw = fs.readFileSync(paths.dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.ayahs) || parsed.ayahs.length === 0) {
      throw new Error('ayahs.json has no ayahs');
    }
    cache = parsed;
    return cache;
  } catch (error) {
    cacheError = error;
    return null;
  }
}

function all() {
  const data = load();
  return data ? data.ayahs : [];
}

function meta() {
  const data = load();
  return data ? data.meta : null;
}

function byTheme(theme) {
  return all().filter((ayah) => Array.isArray(ayah.themes) && ayah.themes.includes(theme));
}

function byRef(ref) {
  return all().find((ayah) => ayah.ref === ref) || null;
}

function themes() {
  const data = load();
  return data && data.meta && Array.isArray(data.meta.themes)
    ? data.meta.themes.slice()
    : ['ilm', 'tawakkul', 'shukr', 'ihsan', 'sabr'];
}

function translationFor(ayah, translation) {
  if (!ayah || !ayah.translations) return '';
  return ayah.translations[translation] || ayah.translations.yusufali || '';
}

module.exports = { load, all, meta, byTheme, byRef, themes, translationFor };
