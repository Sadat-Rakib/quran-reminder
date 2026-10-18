'use strict';

/**
 * Small, dependency-free filesystem helpers with one hard rule:
 * never destroy a file we did not create.
 *
 * Every mutating helper is silent on failure and reports what happened so the
 * CLI can tell the user the truth instead of claiming success.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MARKER_START = '<!-- quran-reminder:start -->';
const MARKER_END = '<!-- quran-reminder:end -->';

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function exists(file) {
  try {
    fs.accessSync(file);
    return true;
  } catch (_) {
    return false;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return null;
  }
}

/**
 * Read JSON without throwing.
 * @returns {{ ok: boolean, data?: any, error?: string, missing?: boolean }}
 */
function readJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { ok: false, missing: true };
    return { ok: false, error: error.message };
  }
  if (!raw.trim()) return { ok: true, data: null };
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: `Invalid JSON in ${file}: ${error.message}` };
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Write a file atomically (temp file + rename). */
function writeText(file, content) {
  ensureDir(path.dirname(file));
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
}

function writeJson(file, data) {
  writeText(file, JSON.stringify(data, null, 2) + '\n');
}

/** Copy a file only when it does not exist. Returns true when written. */
function writeIfMissing(file, content) {
  if (exists(file)) return false;
  writeText(file, content);
  return true;
}

/** Keep a timestamped copy before we modify a user-owned file. */
function backup(file) {
  if (!exists(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = `${file}.quran-reminder-${stamp}.bak`;
  try {
    fs.copyFileSync(file, target);
    return target;
  } catch (_) {
    return null;
  }
}

/**
 * Insert or replace a marker-delimited block in a markdown file.
 * Everything outside the markers is preserved byte for byte.
 *
 * @returns {{ changed: boolean, created: boolean, backup: string|null, error?: string }}
 */
function upsertMarkedBlock(file, body, options = {}) {
  const start = options.start || MARKER_START;
  const end = options.end || MARKER_END;
  const block = `${start}\n${body.trim()}\n${end}`;
  const current = readText(file);

  if (current === null) {
    writeText(file, block + '\n');
    return { changed: true, created: true, backup: null };
  }

  const startIndex = current.indexOf(start);
  const endIndex = current.indexOf(end);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const next =
      current.slice(0, startIndex) + block + current.slice(endIndex + end.length);
    if (next === current) return { changed: false, created: false, backup: null };
    const saved = backup(file);
    writeText(file, next);
    return { changed: true, created: false, backup: saved };
  }

  const saved = backup(file);
  const separator = current.endsWith('\n') ? '\n' : '\n\n';
  writeText(file, current + separator + block + '\n');
  return { changed: true, created: false, backup: saved };
}

/** Remove our marker block, leaving the rest of the file untouched. */
function removeMarkedBlock(file, options = {}) {
  const start = options.start || MARKER_START;
  const end = options.end || MARKER_END;
  const current = readText(file);
  if (current === null) return { changed: false };

  const startIndex = current.indexOf(start);
  const endIndex = current.indexOf(end);
  if (startIndex === -1 || endIndex === -1) return { changed: false };

  const saved = backup(file);
  let before = current.slice(0, startIndex);
  let after = current.slice(endIndex + end.length);
  // Trim the blank line that was added with the block, if we added it.
  before = before.replace(/\n+$/, '\n');
  after = after.replace(/^\n+/, '\n');
  let next = (before + after).replace(/\n{3,}/g, '\n\n');

  if (!next.trim()) {
    try {
      fs.unlinkSync(file);
      return { changed: true, deleted: true, backup: saved };
    } catch (_) {
      return { changed: false, backup: saved };
    }
  }
  writeText(file, next);
  return { changed: true, backup: saved };
}

/** Merge entries into a JSON file, preserving everything we do not own. */
function updateJson(file, updater) {
  const current = readJson(file);
  if (!current.ok && !current.missing) {
    return { ok: false, error: current.error };
  }
  const data = current.missing || current.data === null ? {} : current.data;
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: `${file} does not contain a JSON object` };
  }
  const before = JSON.stringify(data);
  const next = updater(data) || data;
  if (JSON.stringify(next) === before) {
    return { ok: true, changed: false, data: next, backup: null };
  }
  const saved = backup(file);
  writeJson(file, next);
  return { ok: true, changed: true, data: next, backup: saved };
}

module.exports = {
  MARKER_START,
  MARKER_END,
  expandHome,
  exists,
  readText,
  readJson,
  ensureDir,
  writeText,
  writeJson,
  writeIfMissing,
  backup,
  upsertMarkedBlock,
  removeMarkedBlock,
  updateJson,
};
