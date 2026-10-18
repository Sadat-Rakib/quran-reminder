'use strict';

const fsutil = require('../core/fsutil');
const { hookCommand, scopeFile, note } = require('./util');
const { installGrouped, uninstallGrouped, verifyGrouped } = require('./hook-json');

const id = 'codex';

module.exports = {
  id,
  name: 'OpenAI Codex CLI',
  kind: 'hook',
  defaultScope: 'user',
  scopes: ['user', 'project'],
  docs: 'https://developers.openai.com/codex/hooks',
  capability: 'Automatic SessionStart hook (must be trusted once with /hooks).',

  file(ctx) {
    return scopeFile(ctx, ['.codex', 'hooks.json'], ['.codex', 'hooks.json']);
  },

  detect(ctx) {
    return fsutil.exists(scopeFile(ctx, ['.codex'], ['.codex']));
  },

  install(ctx) {
    const res = installGrouped(this.file(ctx), {
      event: 'SessionStart',
      matcher: 'startup|resume|clear',
      command: hookCommand(ctx, id),
      extra: { timeout: 20, statusMessage: 'Loading Quran reminder' },
    });
    if (res.ok) {
      note(
        res,
        'Codex requires you to trust new hooks: run /hooks in Codex and approve "quran-reminder".'
      );
      note(res, 'Hooks are enabled by default (features.hooks = true).');
    }
    return res;
  },

  uninstall(ctx) {
    return uninstallGrouped(this.file(ctx), { event: 'SessionStart', deleteEmptyFile: true });
  },

  verify(ctx) {
    return verifyGrouped(this.file(ctx), { event: 'SessionStart' });
  },
};
