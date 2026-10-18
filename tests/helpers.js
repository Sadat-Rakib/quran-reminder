'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'quran.js');

function tempDir(prefix = 'quran-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeEnv(overrides = {}) {
  const home = overrides.home || tempDir('quran-home-');
  const userHome = overrides.userHome || tempDir('quran-user-');
  const project = overrides.project || tempDir('quran-project-');
  return {
    home,
    userHome,
    project,
    env: {
      ...process.env,
      QURAN_REMINDER_HOME: home,
      QURAN_REMINDER_USER_HOME: userHome,
      QURAN_REMINDER_PROJECT: project,
      NO_COLOR: '1',
      ...(overrides.env || {}),
    },
  };
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    input: options.input,
    env: options.env || makeEnv().env,
    cwd: options.cwd || ROOT,
    timeout: options.timeout || 30000,
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

module.exports = { ROOT, CLI, tempDir, makeEnv, runCli, readJson, write, countOccurrences };
