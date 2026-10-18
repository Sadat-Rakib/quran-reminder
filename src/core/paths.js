'use strict';

const os = require('os');
const path = require('path');

const pkgRoot = path.resolve(__dirname, '..', '..');

/** The real user home (where tool configs live). Overridable for tests. */
function userHome() {
  const override = process.env.QURAN_REMINDER_USER_HOME;
  if (override && override.trim()) return path.resolve(override.trim());
  return os.homedir();
}

function homeDir() {
  const override = process.env.QURAN_REMINDER_HOME;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(os.homedir(), '.quran-reminder');
}

module.exports = {
  pkgRoot,
  get dataFile() {
    return process.env.QURAN_REMINDER_DATA || path.join(pkgRoot, 'data', 'ayahs.json');
  },
  get manifestFile() {
    return path.join(path.dirname(this.dataFile), 'manifest.json');
  },
  homeDir,
  userHome,
  configFile: () => path.join(homeDir(), 'config.json'),
  stateFile: () => path.join(homeDir(), 'state.json'),
  appDir: () => path.join(homeDir(), 'app'),
  logFile: () => path.join(homeDir(), 'quran-reminder.log'),
  projectDir: () => process.env.QURAN_REMINDER_PROJECT || process.cwd(),
};
