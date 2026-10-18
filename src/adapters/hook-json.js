'use strict';

const fsutil = require('../core/fsutil');
const { isOurs, result, fail } = require('./util');

/**
 * Shared helpers for hosts whose hook config is a JSON object of
 * `event -> [ { matcher?, hooks: [ { type, command } ] } ]`
 * (Claude Code, Codex, Gemini CLI) or `event -> [ { command } ]` (Cursor).
 */

function findOurGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups.filter((group) => {
    if (!group || typeof group !== 'object') return false;
    if (isOurs(group.command)) return true;
    return Array.isArray(group.hooks) && group.hooks.some((hook) => hook && isOurs(hook.command));
  });
}

function stripOurHooks(groups) {
  if (!Array.isArray(groups)) return [];
  const cleaned = [];
  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    if (isOurs(group.command)) continue;
    if (Array.isArray(group.hooks)) {
      const hooks = group.hooks.filter((hook) => !(hook && isOurs(hook.command)));
      if (hooks.length === 0) continue;
      cleaned.push({ ...group, hooks });
    } else {
      cleaned.push(group);
    }
  }
  return cleaned;
}

function installGrouped(file, options) {
  const res = result();
  const { event, matcher, command, extra = {}, version, handlerType = 'command' } = options;

  const update = fsutil.updateJson(file, (data) => {
    if (version && data.version === undefined) data.version = version;
    if (!data.hooks || typeof data.hooks !== 'object' || Array.isArray(data.hooks)) data.hooks = {};
    const existing = stripOurHooks(data.hooks[event]);
    const handler = { type: handlerType, command, ...extra };
    const group = matcher ? { matcher, hooks: [handler] } : { hooks: [handler] };
    data.hooks[event] = [...existing, group];
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
  return res;
}

function uninstallGrouped(file, options) {
  const res = result();
  const { event, deleteEmptyFile = false } = options;
  if (!fsutil.exists(file)) {
    res.unchanged.push(file);
    return res;
  }

  const update = fsutil.updateJson(file, (data) => {
    if (!data.hooks || typeof data.hooks !== 'object') return data;
    if (!Array.isArray(data.hooks[event])) return data;
    const cleaned = stripOurHooks(data.hooks[event]);
    if (cleaned.length === 0) delete data.hooks[event];
    else data.hooks[event] = cleaned;
    if (Object.keys(data.hooks).length === 0) delete data.hooks;
    return data;
  });

  if (!update.ok) {
    fail(res, update.error);
    return res;
  }
  if (!update.changed) {
    res.unchanged.push(file);
    return res;
  }

  res.changed.push(file);
  if (update.backup) res.notes.push(`Backup written to ${update.backup}`);

  const left = fsutil.readJson(file);
  if (
    deleteEmptyFile &&
    left.ok &&
    left.data &&
    Object.keys(left.data).filter((key) => key !== 'version').length === 0
  ) {
    try {
      require('fs').unlinkSync(file);
      res.notes.push(`Removed empty ${file}`);
    } catch (_) {
      /* leave it */
    }
  }
  return res;
}

function verifyGrouped(file, options) {
  const { event } = options;
  const parsed = fsutil.readJson(file);
  if (!parsed.ok) {
    return { installed: false, ok: false, detail: parsed.error || 'unreadable config' };
  }
  const groups = parsed.data && parsed.data.hooks && parsed.data.hooks[event];
  const ours = findOurGroups(groups);
  if (!ours.length) return { installed: false, ok: false, detail: `${event} hook not found` };
  const command = ours[0].command || (ours[0].hooks && ours[0].hooks[0] && ours[0].hooks[0].command);
  return { installed: true, ok: true, detail: `${event} -> ${command}` };
}

module.exports = { installGrouped, uninstallGrouped, verifyGrouped, stripOurHooks };
