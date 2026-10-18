'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const fsutil = require('./fsutil');
const registry = require('../adapters');
const pkg = require('../../package.json');

const COPY_ENTRIES = [
  'bin',
  'src',
  'data',
  'package.json',
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
];

/**
 * Copy the package into ~/.quran-reminder/app so hooks keep working even if
 * the package was run through npx (whose cache can be pruned).
 */
function ensureSelfInstalled(options = {}) {
  const home = options.home || paths.homeDir();
  const appRoot = path.join(home, 'app');
  const markerFile = path.join(appRoot, '.installed.json');
  const force = Boolean(options.force);

  if (path.resolve(appRoot) === path.resolve(paths.pkgRoot)) {
    return { appRoot, installed: false, version: pkg.version, reason: 'running-from-app' };
  }

  const marker = fsutil.readJson(markerFile);
  const upToDate =
    !force &&
    marker.ok &&
    marker.data &&
    marker.data.version === pkg.version &&
    fsutil.exists(path.join(appRoot, 'bin', 'quran.js')) &&
    fsutil.exists(path.join(appRoot, 'data', 'ayahs.json'));

  if (upToDate) {
    return { appRoot, installed: false, version: pkg.version, reason: 'up-to-date' };
  }

  fs.mkdirSync(appRoot, { recursive: true });
  for (const entry of COPY_ENTRIES) {
    const source = path.join(paths.pkgRoot, entry);
    if (!fsutil.exists(source)) continue;
    fs.cpSync(source, path.join(appRoot, entry), { recursive: true, force: true });
  }
  fsutil.writeJson(markerFile, {
    version: pkg.version,
    installedAt: new Date().toISOString(),
    source: paths.pkgRoot,
  });
  return { appRoot, installed: true, version: pkg.version, reason: 'copied' };
}

function buildContext(options = {}) {
  const userHome = options.home || paths.userHome();
  const self = options.appRoot
    ? { appRoot: options.appRoot }
    : ensureSelfInstalled({ home: paths.homeDir(), force: options.force });

  return {
    home: userHome,
    projectDir: path.resolve(options.projectDir || paths.projectDir()),
    scope: options.scope || 'user',
    appRoot: self.appRoot,
    dataHome: paths.homeDir(),
    nodePath: process.execPath,
    config: options.config || require('./config').load(),
    dryRun: Boolean(options.dryRun),
    refresh: Boolean(options.refresh),
  };
}

function readRegistry(home = paths.homeDir()) {
  const result = fsutil.readJson(path.join(home, 'installs.json'));
  if (!result.ok || !result.data || !Array.isArray(result.data.installs)) {
    return { installs: [] };
  }
  return result.data;
}

function writeRegistry(data, home = paths.homeDir()) {
  try {
    fsutil.writeJson(path.join(home, 'installs.json'), data);
    return true;
  } catch (_) {
    return false;
  }
}

function rememberInstall(adapterId, scope, home = paths.homeDir()) {
  const data = readRegistry(home);
  data.installs = data.installs.filter(
    (entry) => !(entry.id === adapterId && entry.scope === scope)
  );
  data.installs.push({ id: adapterId, scope, at: new Date().toISOString() });
  writeRegistry(data, home);
}

function forgetInstall(adapterId, scope, home = paths.homeDir()) {
  const data = readRegistry(home);
  data.installs = data.installs.filter(
    (entry) => !(entry.id === adapterId && entry.scope === scope)
  );
  writeRegistry(data, home);
}

function installOne(adapter, ctx) {
  try {
    const result = adapter.install(ctx);
    if (result.ok) rememberInstall(adapter.id, ctx.scope, ctx.dataHome || ctx.home);
    return result;
  } catch (error) {
    return {
      ok: false,
      changed: [],
      unchanged: [],
      notes: [],
      manual: [],
      errors: [`${adapter.name}: ${error.message}`],
    };
  }
}

function uninstallOne(adapter, ctx) {
  try {
    const result = adapter.uninstall(ctx);
    if (result.ok) forgetInstall(adapter.id, ctx.scope, ctx.dataHome || ctx.home);
    return result;
  } catch (error) {
    return {
      ok: false,
      changed: [],
      unchanged: [],
      notes: [],
      manual: [],
      errors: [`${adapter.name}: ${error.message}`],
    };
  }
}

function verifyAll(ctx) {
  return registry.list().map((adapter) => {
    const scopes = Array.isArray(adapter.scopes) && adapter.scopes.length ? adapter.scopes : ['user'];
    let fallback = null;
    for (const scope of scopes) {
      let verification;
      try {
        verification = adapter.verify({ ...ctx, scope });
      } catch (error) {
        verification = { installed: false, ok: false, detail: error.message };
      }
      if (verification.installed) return { adapter, scope, ...verification };
      if (!fallback) fallback = verification;
    }
    return { adapter, scope: scopes[0], ...(fallback || { installed: false, ok: false, detail: 'not installed' }) };
  });
}

module.exports = {
  ensureSelfInstalled,
  buildContext,
  installOne,
  uninstallOne,
  verifyAll,
  readRegistry,
  writeRegistry,
  rememberInstall,
  forgetInstall,
};
