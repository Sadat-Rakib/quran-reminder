'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const select = require('../src/core/select');
const state = require('../src/core/state');
const configModule = require('../src/core/config');
const { tempDir } = require('./helpers');

function at(hour) {
  const date = new Date(2026, 0, 15, hour, 30, 0);
  return date;
}

test('time-of-day themes keep the original boundaries', () => {
  assert.equal(select.themeForTime(at(3)), 'shukr');
  assert.equal(select.themeForTime(at(4)), 'ilm');
  assert.equal(select.themeForTime(at(8)), 'ilm');
  assert.equal(select.themeForTime(at(9)), 'tawakkul');
  assert.equal(select.themeForTime(at(16)), 'tawakkul');
  assert.equal(select.themeForTime(at(17)), 'shukr');
  assert.equal(select.themeForTime(at(23)), 'shukr');
});

test('configured theme overrides the clock', () => {
  assert.equal(select.resolveTheme({ theme: 'sabr' }, at(10)), 'sabr');
  assert.equal(select.resolveTheme({ theme: 'auto' }, at(10)), 'tawakkul');
  assert.ok(configModule.THEMES.includes(select.resolveTheme({ theme: 'random' }, at(10))));
});

test('selection stays inside the theme and honours avoidRefs', () => {
  const pool = require('../src/core/data').byTheme('sabr');
  const avoided = pool.slice(0, pool.length - 1).map((ayah) => ayah.ref);
  const ayah = select.selectAyah({ theme: 'sabr', avoidRefs: avoided, rng: () => 0.5 });
  assert.equal(ayah.ref, pool[pool.length - 1].ref);
});

test('an exhausted pool falls back instead of returning nothing', () => {
  const pool = require('../src/core/data').byTheme('ilm');
  const ayah = select.selectAyah({
    theme: 'ilm',
    avoidRefs: pool.map((entry) => entry.ref),
    rng: () => 0,
  });
  assert.ok(ayah && ayah.themes.includes('ilm'));
});

test('selection is deterministic with an injected rng', () => {
  const first = select.selectAyah({ theme: 'shukr', rng: () => 0.42 });
  const second = select.selectAyah({ theme: 'shukr', rng: () => 0.42 });
  assert.equal(first.ref, second.ref);
});

test('session frequency shows once per session id', () => {
  const config = { ...configModule.DEFAULTS, frequency: 'session' };
  const empty = state.emptyState();
  assert.equal(state.shouldShow(config, empty, { sessionId: 'abc' }).show, true);

  state.record(empty, { ref: '2:153', sessionId: 'abc', now: new Date() });
  assert.equal(state.shouldShow(config, empty, { sessionId: 'abc' }).show, false);
  assert.equal(state.shouldShow(config, empty, { sessionId: 'other' }).show, true);
});

test('daily and hourly frequencies respect the clock', () => {
  const daily = { ...configModule.DEFAULTS, frequency: 'daily' };
  const s = state.emptyState();
  const now = new Date(2026, 4, 1, 10, 0, 0);
  state.record(s, { ref: '2:153', sessionId: 'x', now });
  assert.equal(state.shouldShow(daily, s, { sessionId: 'y', now: new Date(2026, 4, 1, 18, 0, 0) }).show, false);
  assert.equal(state.shouldShow(daily, s, { sessionId: 'y', now: new Date(2026, 4, 2, 0, 5, 0) }).show, true);

  const hourly = { ...configModule.DEFAULTS, frequency: 'hourly' };
  assert.equal(state.shouldShow(hourly, s, { sessionId: 'y', now: new Date(2026, 4, 1, 10, 59, 0) }).show, false);
  assert.equal(state.shouldShow(hourly, s, { sessionId: 'y', now: new Date(2026, 4, 1, 11, 0, 0) }).show, true);
});

test('disabled config never shows', () => {
  const config = { ...configModule.DEFAULTS, enabled: false };
  assert.equal(state.shouldShow(config, state.emptyState(), { sessionId: 'a' }).show, false);
});

test('state persists, prunes and tolerates corrupt files', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const s = state.emptyState();
  const now = new Date();
  state.record(s, { ref: '2:153', sessionId: 'sess/with/slashes', now });
  assert.equal(state.writeState(s, file), true);

  const loaded = state.readState(file);
  assert.equal(loaded.lastShown.ref, '2:153');
  assert.ok(loaded.sessions.sess_with_slashes);

  const avoid = state.avoidRefs(loaded, 'sess/with/slashes', now, 3);
  assert.deepEqual(avoid, ['2:153']);

  fs.writeFileSync(file, '{not json', 'utf8');
  const corrupt = state.readState(file);
  assert.deepEqual(corrupt.recent, []);
  assert.equal(corrupt.lastShown, null);
});

test('old sessions and recent entries are pruned', () => {
  const now = new Date();
  const s = state.emptyState();
  s.recent = [
    { ref: '1:1', at: new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString() },
    { ref: '2:153', at: now.toISOString() },
  ];
  s.sessions = {
    old: { refs: ['1:1'], lastAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString() },
    fresh: { refs: ['2:153'], lastAt: now.toISOString() },
  };
  state.prune(s, now, 3);
  assert.deepEqual(s.recent.map((item) => item.ref), ['2:153']);
  assert.ok(!s.sessions.old);
  assert.ok(s.sessions.fresh);
});
