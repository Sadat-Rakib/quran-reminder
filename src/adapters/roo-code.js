'use strict';

const fs = require('fs');
const fsutil = require('../core/fsutil');
const { result, note, projectPath, userPath } = require('./util');
const { instructionBody } = require('./instruction');

const id = 'roo-code';

module.exports = {
  id,
  name: 'Roo Code',
  kind: 'rules',
  defaultScope: 'project',
  scopes: ['user', 'project'],
  docs: 'https://docs.roocode.com/features/custom-instructions',
  capability: 'Rules file — the model sees the verse at the start of every task (no terminal output).',

  file(ctx) {
    return ctx.scope === 'project'
      ? projectPath(ctx, '.roo', 'rules', 'quran-reminder.md')
      : userPath(ctx, '.roo', 'rules', 'quran-reminder.md');
  },

  detect(ctx) {
    return (
      fsutil.exists(projectPath(ctx, '.roo')) ||
      fsutil.exists(projectPath(ctx, '.roorules')) ||
      fsutil.exists(userPath(ctx, '.roo'))
    );
  },

  install(ctx) {
    const res = result();
    const file = this.file(ctx);
    const body = instructionBody(ctx.config, {
      intro:
        'A Quranic ayah for reflection before the work begins. Installed by `quran-reminder`; run `quran refresh` to rotate it.',
    });
    const existing = fsutil.readText(file);
    const ours = existing !== null && existing.includes('quran-reminder');
    if (existing === null || (ctx.refresh && ours)) {
      fsutil.writeText(file, body + '\n');
      res.changed.push(file);
    } else {
      res.unchanged.push(file);
    }
    note(res, 'Roo Code loads every file in .roo/rules/ automatically; no restart needed.');
    return res;
  },

  uninstall(ctx) {
    const res = result();
    const file = this.file(ctx);
    if (!fsutil.exists(file)) {
      res.unchanged.push(file);
      return res;
    }
    try {
      fs.unlinkSync(file);
      res.changed.push(file);
    } catch (error) {
      res.ok = false;
      res.errors.push(error.message);
    }
    return res;
  },

  verify(ctx) {
    const file = this.file(ctx);
    return fsutil.exists(file)
      ? { installed: true, ok: true, detail: `rules file at ${file}` }
      : { installed: false, ok: false, detail: 'rules file not found' };
  },
};
