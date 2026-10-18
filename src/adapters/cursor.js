'use strict';

const fsutil = require('../core/fsutil');
const { hookCommand, scopeFile, result, note, fail, isOurs } = require('./util');

const id = 'cursor';

function ours(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (isOurs(entry.command)) return true;
  // Also clean up the grouped shape written by early versions of this adapter.
  return Array.isArray(entry.hooks) && entry.hooks.some((hook) => isOurs(hook && hook.command));
}

module.exports = {
  id,
  name: 'Cursor',
  kind: 'hook',
  defaultScope: 'user',
  scopes: ['user', 'project'],
  docs: 'https://cursor.com/docs/agent/hooks',
  capability: 'Automatic sessionStart hook (fires when a new chat is created).',

  file(ctx) {
    return scopeFile(ctx, ['.cursor', 'hooks.json'], ['.cursor', 'hooks.json']);
  },

  detect(ctx) {
    return fsutil.exists(scopeFile(ctx, ['.cursor'], ['.cursor']));
  },

  install(ctx) {
    const res = result();
    const file = this.file(ctx);
    const update = fsutil.updateJson(file, (data) => {
      if (data.version === undefined) data.version = 1;
      if (!data.hooks || typeof data.hooks !== 'object' || Array.isArray(data.hooks)) {
        data.hooks = {};
      }
      const existing = Array.isArray(data.hooks.sessionStart)
        ? data.hooks.sessionStart.filter((entry) => !ours(entry))
        : [];
      data.hooks.sessionStart = [
        ...existing,
        { command: hookCommand(ctx, id), timeout: 20 },
      ];
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
    note(res, 'Cursor reloads hooks.json automatically; start a new chat to see the verse.');
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
      if (!data.hooks || !Array.isArray(data.hooks.sessionStart)) return data;
      const cleaned = data.hooks.sessionStart.filter((entry) => !ours(entry));
      if (cleaned.length) data.hooks.sessionStart = cleaned;
      else delete data.hooks.sessionStart;
      if (Object.keys(data.hooks).length === 0) delete data.hooks;
      return data;
    });
    if (!update.ok) fail(res, update.error);
    else if (update.changed) {
      res.changed.push(file);
      // If nothing but the schema version is left, remove the file we created.
      const left = fsutil.readJson(file);
      const data = left.ok ? left.data : null;
      const empty =
        data &&
        Object.keys(data).every((key) => key === 'version') &&
        (!data.hooks || Object.keys(data.hooks).length === 0);
      if (empty) {
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
    const entries =
      parsed.data && parsed.data.hooks && parsed.data.hooks.sessionStart
        ? parsed.data.hooks.sessionStart
        : [];
    const entry = entries.find(ours);
    return entry
      ? { installed: true, ok: true, detail: `sessionStart -> ${entry.command}` }
      : { installed: false, ok: false, detail: 'sessionStart hook not found' };
  },
};
