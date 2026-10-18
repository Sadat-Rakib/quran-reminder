'use strict';

const fsutil = require('../core/fsutil');
const { hookCommand, scopeFile, result, note, fail, isOurs } = require('./util');

const id = 'windsurf';

module.exports = {
  id,
  name: 'Windsurf / Devin Desktop',
  kind: 'hook',
  defaultScope: 'user',
  scopes: ['user', 'project'],
  docs: 'https://docs.windsurf.com/windsurf/cascade/hooks',
  capability: 'pre_user_prompt hook — shows the verse on the first prompt of a session.',

  file(ctx) {
    return scopeFile(
      ctx,
      ['.codeium', 'windsurf', 'hooks.json'],
      ['.windsurf', 'hooks.json']
    );
  },

  detect(ctx) {
    return (
      fsutil.exists(scopeFile(ctx, ['.codeium', 'windsurf'], ['.windsurf'])) ||
      fsutil.exists(scopeFile(ctx, ['.codeium'], ['.windsurf']))
    );
  },

  install(ctx) {
    const res = result();
    const file = this.file(ctx);
    const command = hookCommand(ctx, id);

    const update = fsutil.updateJson(file, (data) => {
      if (!data.hooks || typeof data.hooks !== 'object' || Array.isArray(data.hooks)) {
        data.hooks = {};
      }
      const existing = (Array.isArray(data.hooks.pre_user_prompt)
        ? data.hooks.pre_user_prompt
        : []
      ).filter((entry) => !isOurs(entry && entry.command));

      data.hooks.pre_user_prompt = [
        ...existing,
        { command, powershell: `& ${command}`, show_output: true },
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
    note(res, 'Windsurf has no session-start event; pre_user_prompt runs on each prompt and the reminder is de-duplicated per session.');
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
      if (!data.hooks || !Array.isArray(data.hooks.pre_user_prompt)) return data;
      const cleaned = data.hooks.pre_user_prompt.filter(
        (entry) => !isOurs(entry && entry.command)
      );
      if (cleaned.length) data.hooks.pre_user_prompt = cleaned;
      else delete data.hooks.pre_user_prompt;
      if (Object.keys(data.hooks).length === 0) delete data.hooks;
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
    const entries =
      parsed.data && parsed.data.hooks && parsed.data.hooks.pre_user_prompt
        ? parsed.data.hooks.pre_user_prompt
        : [];
    const ours = entries.find((entry) => isOurs(entry && entry.command));
    return ours
      ? { installed: true, ok: true, detail: `pre_user_prompt -> ${ours.command}` }
      : { installed: false, ok: false, detail: 'pre_user_prompt hook not found' };
  },
};
