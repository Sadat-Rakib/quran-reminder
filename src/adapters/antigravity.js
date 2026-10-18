'use strict';

const fsutil = require('../core/fsutil');
const { hookCommand, scopeFile, result, note, fail } = require('./util');

const id = 'antigravity';
const HOOK_NAME = 'quran-reminder';

module.exports = {
  id,
  name: 'Google Antigravity',
  kind: 'hook',
  defaultScope: 'project',
  scopes: ['user', 'project'],
  docs: 'https://antigravity.google/docs/hooks',
  capability: 'Automatic SessionStart hook (injects the verse as session context).',

  file(ctx) {
    return scopeFile(ctx, ['.gemini', 'config', 'hooks.json'], ['.agents', 'hooks.json']);
  },

  detect(ctx) {
    return (
      fsutil.exists(scopeFile(ctx, ['.gemini', 'config'], ['.agents'])) ||
      fsutil.exists(scopeFile(ctx, ['.gemini', 'antigravity'], ['.agents'])) ||
      fsutil.exists(scopeFile(ctx, ['.gemini', 'antigravity-ide'], ['.agents']))
    );
  },

  install(ctx) {
    const res = result();
    const file = this.file(ctx);
    const update = fsutil.updateJson(file, (data) => {
      data[HOOK_NAME] = {
        SessionStart: [{ type: 'command', command: hookCommand(ctx, id), timeout: 20 }],
      };
      return data;
    });
    if (!update.ok) {
      fail(res, update.error);
      return res;
    }
    if (update.changed) {
      res.changed.push(file);
      if (update.backup) res.notes.push(`Backup written to ${update.backup}`);
    } else {
      res.unchanged.push(file);
    }
    note(res, 'Antigravity hooks inject context into the conversation; the panel text is delivered as a system message.');
    return res;
  },

  uninstall(ctx) {
    const res = result();
    const file = this.file(ctx);
    if (!fsutil.exists(file)) {
      res.unchanged.push(file);
      return res;
    }
    const update = fsutil.updateJson(file, (data) => {
      delete data[HOOK_NAME];
      return data;
    });
    if (!update.ok) fail(res, update.error);
    else if (update.changed) {
      res.changed.push(file);
      const left = fsutil.readJson(file);
      if (left.ok && left.data && Object.keys(left.data).length === 0) {
        try {
          require('fs').unlinkSync(file);
        } catch (_) {
          /* leave it */
        }
      }
    } else res.unchanged.push(file);
    return res;
  },

  verify(ctx) {
    const file = this.file(ctx);
    const parsed = fsutil.readJson(file);
    if (!parsed.ok) return { installed: false, ok: false, detail: parsed.error || 'unreadable' };
    const entry = parsed.data && parsed.data[HOOK_NAME];
    if (!entry || !Array.isArray(entry.SessionStart) || !entry.SessionStart.length) {
      return { installed: false, ok: false, detail: 'SessionStart hook not found' };
    }
    return { installed: true, ok: true, detail: entry.SessionStart[0].command };
  },
};
