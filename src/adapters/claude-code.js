'use strict';

const fsutil = require('../core/fsutil');
const { hookCommand, scopeFile, result, note, fail } = require('./util');
const { installGrouped, uninstallGrouped, verifyGrouped } = require('./hook-json');

const id = 'claude-code';

module.exports = {
  id,
  name: 'Claude Code',
  kind: 'hook',
  defaultScope: 'user',
  scopes: ['user', 'project'],
  docs: 'https://code.claude.com/docs/en/hooks',
  capability: 'Automatic session-start hook. Also ships a plugin manifest.',

  file(ctx) {
    return scopeFile(ctx, ['.claude', 'settings.json'], ['.claude', 'settings.json']);
  },

  detect(ctx) {
    return (
      fsutil.exists(scopeFile(ctx, ['.claude'], ['.claude'])) ||
      fsutil.exists(ctx.projectDir + '/.claude')
    );
  },

  install(ctx) {
    const file = this.file(ctx);
    const res = installGrouped(file, {
      event: 'SessionStart',
      matcher: 'startup|resume|clear',
      command: hookCommand(ctx, id),
      extra: { timeout: 20, statusMessage: 'Loading Quran reminder' },
    });
    if (res.ok) {
      note(res, 'Claude Code will also ask you to approve project hooks the first time they run.');
      note(res, 'Plugin alternative: claude --plugin-dir <repo>/plugin (see README).');
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
