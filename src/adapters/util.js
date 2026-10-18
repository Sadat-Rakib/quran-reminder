'use strict';

const path = require('path');
const fsutil = require('../core/fsutil');

const MARKER = 'quran-reminder';

function quote(value) {
  const text = String(value).replace(/\\/g, '/');
  return `"${text}"`;
}

/** The command every hook adapter writes. Always absolute, always quoted. */
function hookCommand(ctx, hostId) {
  return `${quote(ctx.nodePath)} ${quote(path.join(ctx.appRoot, 'bin', 'quran.js'))} hook --host ${hostId}`;
}

function isOurs(value) {
  if (typeof value !== 'string') return false;
  if (value.includes(MARKER)) return true;
  // The install path is normally ~/.quran-reminder/app/bin/quran.js, but a
  // custom QURAN_REMINDER_HOME may not include the marker. Match the command
  // signature instead of relying on the directory name.
  return value.includes('quran.js') && value.includes('hook');
}

function projectPath(ctx, ...segments) {
  return path.join(ctx.projectDir, ...segments);
}

function userPath(ctx, ...segments) {
  return path.join(ctx.home, ...segments);
}

function scopeFile(ctx, userSegments, projectSegments) {
  return ctx.scope === 'project'
    ? projectPath(ctx, ...projectSegments)
    : userPath(ctx, ...userSegments);
}

function result() {
  return { ok: true, changed: [], unchanged: [], notes: [], manual: [], errors: [] };
}

function note(res, message) {
  res.notes.push(message);
}

function manual(res, message) {
  res.manual.push(message);
}

function fail(res, message) {
  res.ok = false;
  res.errors.push(message);
}

/** Quote a YAML scalar only when it needs it (paths with `:` or spaces). */
function yamlValue(value) {
  const normalized = String(value).replace(/\\/g, '/');
  return /^[A-Za-z0-9_./-]+$/.test(normalized) ? normalized : JSON.stringify(normalized);
}

/**
 * Ensure a top-level YAML list under `key` contains `value`.
 * Supports the two shapes aider documents:
 *   read: CONVENTIONS.md
 *   read: [CONVENTIONS.md, another.md]
 *   read:
 *     - CONVENTIONS.md
 * Anything else is left untouched and reported as manual.
 */
function ensureYamlListItem(file, key, value) {
  const current = fsutil.readText(file);
  const scalar = yamlValue(value);
  if (current === null) {
    fsutil.writeText(file, `${key}:\n  - ${scalar}\n`);
    return { changed: true, created: true, backup: null };
  }
  if (current.includes(value) || current.includes(scalar)) {
    return { changed: false, created: false, backup: null };
  }

  const lines = current.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line));

  if (keyIndex === -1) {
    const saved = fsutil.backup(file);
    const suffix = current.endsWith('\n') || current === '' ? '' : '\n';
    fsutil.writeText(file, `${current}${suffix}\n${key}:\n  - ${scalar}\n`);
    return { changed: true, created: false, backup: saved };
  }

  const keyLine = lines[keyIndex];
  const inline = /^(\s*[^:]+:\s*)\[(.*)\]\s*$/.exec(keyLine);

  if (inline) {
    const saved = fsutil.backup(file);
    const existing = inline[2].trim();
    lines[keyIndex] = `${inline[1]}[${existing ? `${existing}, ${scalar}` : scalar}]`;
    fsutil.writeText(file, lines.join('\n'));
    return { changed: true, created: false, backup: saved };
  }

  if (/^[^:]+:\s*$/.test(keyLine)) {
    // Block list: insert after the last indented item that follows the key.
    let insertAt = keyIndex + 1;
    for (let i = keyIndex + 1; i < lines.length; i++) {
      if (/^\s+-\s+/.test(lines[i])) insertAt = i + 1;
      else if (lines[i].trim() === '') continue;
      else break;
    }
    const saved = fsutil.backup(file);
    lines.splice(insertAt, 0, `  - ${scalar}`);
    fsutil.writeText(file, lines.join('\n'));
    return { changed: true, created: false, backup: saved };
  }

  return { changed: false, created: false, backup: null, unsupported: true };
}

/** Remove a single YAML list item, leaving everything else intact. */
function removeYamlListItem(file, key, value) {
  const current = fsutil.readText(file);
  const scalar = yamlValue(value);
  if (current === null || (!current.includes(value) && !current.includes(scalar))) {
    return { changed: false };
  }

  const lines = current.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line));
  if (keyIndex === -1) return { changed: false };

  const saved = fsutil.backup(file);
  const keyLine = lines[keyIndex];
  const inline = /^(\s*[^:]+:\s*)\[(.*)\]\s*$/.exec(keyLine);

  if (inline) {
    const items = inline[2]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => item !== value && item !== scalar);
    lines[keyIndex] = `${inline[1]}[${items.join(', ')}]`;
  } else {
    const next = lines.filter((line, index) => {
      if (index <= keyIndex) return true;
      const bare = line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, '').trim();
      return bare !== String(value).replace(/\\/g, '/') && bare !== value;
    });
    lines.length = 0;
    lines.push(...next);
  }

  fsutil.writeText(file, lines.join('\n'));
  return { changed: true, backup: saved };
}

module.exports = {
  MARKER,
  MARKER_START: fsutil.MARKER_START,
  MARKER_END: fsutil.MARKER_END,
  quote,
  hookCommand,
  isOurs,
  projectPath,
  userPath,
  scopeFile,
  result,
  note,
  manual,
  fail,
  ensureYamlListItem,
  removeYamlListItem,
};
