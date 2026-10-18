'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { makeEnv, runCli, readJson } = require('./helpers');

test('quran show --format json returns a complete ayah', () => {
  const { env } = makeEnv();
  const result = runCli(['show', '--format', 'json'], { env });
  assert.equal(result.status, 0, result.stderr);
  const ayah = JSON.parse(result.stdout);
  assert.match(ayah.ref, /^\d+:\d+$/);
  assert.ok(ayah.arabic);
  assert.ok(ayah.translation);
  assert.ok(ayah.url.startsWith('https://quran.com/'));
  assert.ok(ayah.themes.length > 0);
});

test('quran show --ref returns exactly that verse', () => {
  const { env } = makeEnv();
  const result = runCli(['show', '--ref', '2:153', '--format', 'json'], { env });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).ref, '2:153');
});

test('quran show rejects an unknown reference', () => {
  const { env } = makeEnv();
  const result = runCli(['show', '--ref', '999:1'], { env });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /No bundled ayah/);
});

test('theme selection is honoured end to end', () => {
  const { env } = makeEnv();
  const result = runCli(['show', '--theme', 'sabr', '--format', 'json'], { env });
  const ayah = JSON.parse(result.stdout);
  assert.ok(ayah.themes.includes('sabr'));
});

test('saved config affects later runs', () => {
  const { env } = makeEnv();
  assert.equal(runCli(['config', 'set', 'theme', 'ihsan'], { env }).status, 0);
  const ayah = JSON.parse(runCli(['show', '--format', 'json'], { env }).stdout);
  assert.ok(ayah.themes.includes('ihsan'));

  const listed = runCli(['config', 'list'], { env });
  assert.match(listed.stdout, /ihsan/);

  assert.equal(runCli(['config', 'set', 'theme', 'nonsense'], { env }).status, 1);
  assert.equal(runCli(['config', 'reset'], { env }).status, 0);
});

test('quran list reports supported tools', () => {
  const { env } = makeEnv();
  const result = runCli(['list'], { env });
  assert.equal(result.status, 0);
  for (const name of ['Claude Code', 'Cursor', 'Aider', 'OpenCode', 'AGENTS.md']) {
    assert.match(result.stdout, new RegExp(name.replace('.', '\\.')));
  }
});

test('install, doctor and uninstall work end to end', () => {
  const { env, userHome, project } = makeEnv();

  const install = runCli(['install', 'claude-code', 'cursor', '--scope', 'project'], { env });
  assert.equal(install.status, 0, install.stdout + install.stderr);

  const settings = path.join(project, '.claude', 'settings.json');
  const cursor = path.join(project, '.cursor', 'hooks.json');
  assert.ok(fs.existsSync(settings));
  assert.ok(fs.existsSync(cursor));
  assert.match(fs.readFileSync(settings, 'utf8'), /hook --host claude-code/);
  assert.match(fs.readFileSync(cursor, 'utf8'), /hook --host cursor/);

  const doctor = runCli(['doctor'], { env });
  assert.equal(doctor.status, 0, doctor.stdout);
  assert.match(doctor.stdout, /Claude Code/);
  assert.match(doctor.stdout, /hook produces a valid payload/);

  const remove = runCli(['uninstall', 'claude-code', 'cursor', '--scope', 'project'], { env });
  assert.equal(remove.status, 0, remove.stdout);
  assert.ok(!fs.existsSync(settings));
  assert.ok(!fs.existsSync(cursor));
});

test('install rejects unknown tools without touching anything', () => {
  const { env, userHome } = makeEnv();
  const result = runCli(['install', 'not-a-real-tool'], { env });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Unknown tool/);
  assert.ok(!fs.existsSync(path.join(userHome, '.claude')));
});

test('uninstall of a tool that is not installed is harmless', () => {
  const { env } = makeEnv();
  const result = runCli(['uninstall', 'aider'], { env });
  assert.equal(result.status, 0);
});

test('unknown commands fail with help text', () => {
  const { env } = makeEnv();
  const result = runCli(['frobnicate'], { env });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Unknown command/);
});

test('--version and --help work', () => {
  const { env } = makeEnv();
  assert.match(runCli(['--version'], { env }).stdout.trim(), /^\d+\.\d+\.\d+$/);
  const help = runCli(['--help'], { env });
  assert.match(help.stdout, /quran install/);
  assert.match(help.stdout, /quran doctor/);
});

test('quran run prints a verse and forwards the child command', () => {
  const { env } = makeEnv();
  const result = runCli(['run', 'node', '-e', 'console.log("child ok")'], { env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /quran\.com\/\d+\/\d+/);
  assert.match(result.stdout, /child ok/);
});

test('refresh rotates a static instruction file', () => {
  const { env, project } = makeEnv();
  assert.equal(runCli(['install', 'roo-code'], { env }).status, 0);
  const file = path.join(project, '.roo', 'rules', 'quran-reminder.md');
  const before = fs.readFileSync(file, 'utf8');
  assert.match(before, /quran\.com\/\d+\/\d+/);

  let after = before;
  for (let attempt = 0; attempt < 4 && after === before; attempt++) {
    assert.equal(runCli(['refresh'], { env }).status, 0);
    after = fs.readFileSync(file, 'utf8');
  }
  assert.notEqual(after, before, 'refresh should pick a new verse');
  assert.match(after, /quran\.com\/\d+\/\d+/);
});

test('install writes a runtime copy that hooks can execute', () => {
  const { env, home, userHome } = makeEnv();
  const install = runCli(['install', 'claude-code'], { env });
  assert.equal(install.status, 0);

  const appCli = path.join(home, 'app', 'bin', 'quran.js');
  assert.ok(fs.existsSync(appCli), 'runtime copy should exist');
  assert.ok(fs.existsSync(path.join(home, 'app', 'data', 'ayahs.json')));

  const settings = readJson(path.join(userHome, '.claude', 'settings.json'));
  const command = settings.hooks.SessionStart[0].hooks[0].command;
  assert.ok(command.includes(appCli.replace(/\\/g, '/')), 'hook should point at the stable copy');
});
