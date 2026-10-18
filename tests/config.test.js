'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const configModule = require('../src/core/config');
const { tempDir } = require('./helpers');

function isolate() {
  const home = tempDir('quran-config-');
  process.env.QURAN_REMINDER_HOME = home;
  delete process.env.QURAN_REMINDER_THEME;
  delete process.env.QURAN_REMINDER_TRANSLATION;
  delete process.env.QURAN_REMINDER_DISABLE;
  return { home, file: path.join(home, 'config.json') };
}

test('defaults are complete and valid', () => {
  isolate();
  const config = configModule.load();
  for (const key of Object.keys(configModule.DEFAULTS)) {
    assert.ok(key in config, `missing ${key}`);
  }
  assert.equal(config.theme, 'auto');
  assert.equal(config.translation, 'yusufali');
  assert.equal(config.frequency, 'session');
  assert.equal(config.enabled, true);
});

test('set persists a validated value', () => {
  const { file } = isolate();
  assert.equal(configModule.set('theme', 'sabr').ok, true);
  assert.equal(configModule.load().theme, 'sabr');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).theme, 'sabr');
});

test('aliases and booleans are coerced', () => {
  isolate();
  assert.equal(configModule.set('theme', 'patience').value, 'sabr');
  assert.equal(configModule.set('theme', 'GRATITUDE').value, 'shukr');
  assert.equal(configModule.set('showArabic', 'yes').value, true);
  assert.equal(configModule.set('showArabic', 'off').value, false);
  assert.equal(configModule.set('width', '72').value, 72);
});

test('invalid values are rejected without writing', () => {
  const { file } = isolate();
  configModule.set('theme', 'sabr');
  const before = fs.readFileSync(file, 'utf8');

  for (const [key, value] of [
    ['theme', 'nope'],
    ['translation', 'klingon'],
    ['frequency', 'sometimes'],
    ['width', '10'],
    ['width', 'wide'],
    ['color', 'rainbow'],
    ['unknown', 'x'],
  ]) {
    const result = configModule.set(key, value);
    assert.equal(result.ok, false, `${key}=${value} should be rejected`);
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('unknown keys in the file are ignored, valid ones kept', () => {
  const { file } = isolate();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ theme: 'ihsan', width: 999, futureSetting: true, enabled: false }),
    'utf8'
  );
  const config = configModule.load();
  assert.equal(config.theme, 'ihsan');
  assert.equal(config.width, configModule.DEFAULTS.width);
  assert.equal(config.enabled, false);
  assert.ok(!('futureSetting' in config));
});

test('environment overrides win for documented variables', () => {
  isolate();
  configModule.set('theme', 'sabr');
  process.env.QURAN_REMINDER_THEME = 'ilm';
  assert.equal(configModule.load().theme, 'ilm');
  process.env.QURAN_REMINDER_DISABLE = '1';
  assert.equal(configModule.load().enabled, false);
  delete process.env.QURAN_REMINDER_THEME;
  delete process.env.QURAN_REMINDER_DISABLE;
});

test('reset restores defaults', () => {
  const { file } = isolate();
  configModule.set('theme', 'sabr');
  assert.equal(fs.existsSync(file), true);
  assert.equal(configModule.reset().ok, true);
  assert.equal(fs.existsSync(file), false);
  assert.equal(configModule.load().theme, 'auto');
});

test('a corrupt config file does not crash loading', () => {
  const { file } = isolate();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{oops', 'utf8');
  const config = configModule.load();
  assert.equal(config.theme, 'auto');
});
