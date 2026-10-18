'use strict';

const fsutil = require('../core/fsutil');
const { hookCommand, scopeFile, note } = require('./util');
const { installGrouped, uninstallGrouped, verifyGrouped } = require('./hook-json');

const id = 'gemini-cli';

module.exports = {
  id,
  name: 'Gemini CLI',
  kind: 'hook',
  defaultScope: 'user',
  scopes: ['user', 'project'],
  docs: 'https://geminicli.com/docs/hooks/',
  capability: 'Automatic SessionStart hook.',

  file(ctx) {
    return scopeFile(ctx, ['.gemini', 'settings.json'], ['.gemini', 'settings.json']);
  },

  detect(ctx) {
    return fsutil.exists(scopeFile(ctx, ['.gemini'], ['.gemini']));
  },

  install(ctx) {
    const res = installGrouped(this.file(ctx), {
      event: 'SessionStart',
      command: hookCommand(ctx, id),
      extra: { name: 'quran-reminder', timeout: 20000, description: 'Quranic ayah at session start' },
    });
    if (res.ok) {
      note(res, 'Gemini CLI fingerprints project hooks; a changed command is re-confirmed once.');
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
