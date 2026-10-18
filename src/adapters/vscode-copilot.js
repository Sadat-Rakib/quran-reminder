'use strict';

const fs = require('fs');
const fsutil = require('../core/fsutil');
const { result, note, projectPath, userPath } = require('./util');
const { instructionBody } = require('./instruction');

const id = 'vscode-copilot';

module.exports = {
  id,
  name: 'VS Code / GitHub Copilot',
  kind: 'instructions',
  defaultScope: 'project',
  scopes: ['user', 'project'],
  docs: 'https://code.visualstudio.com/docs/copilot/customization/custom-instructions',
  capability: 'Instruction file — Copilot reads the verse in every chat (no terminal output).',

  file(ctx) {
    return ctx.scope === 'project'
      ? projectPath(ctx, '.github', 'instructions', 'quran-reminder.instructions.md')
      : userPath(ctx, '.copilot', 'instructions', 'quran-reminder.instructions.md');
  },

  detect(ctx) {
    return (
      fsutil.exists(projectPath(ctx, '.github')) ||
      fsutil.exists(projectPath(ctx, '.vscode')) ||
      fsutil.exists(userPath(ctx, '.copilot'))
    );
  },

  install(ctx) {
    const res = result();
    const file = this.file(ctx);
    const body = instructionBody(ctx.config, {
      title: 'Quran reminder',
      intro:
        'A Quranic ayah for reflection. Installed by `quran-reminder`; run `quran refresh` to rotate it.',
    });
    const content = [
      '---',
      "name: 'Quran reminder'",
      "description: 'A Quranic ayah for reflection at the start of a coding session.'",
      "applyTo: '**'",
      '---',
      '',
      body,
      '',
    ].join('\n');

    if (fsutil.exists(file)) {
      const existing = fsutil.readText(file) || '';
      if (ctx.refresh && existing.includes('quran-reminder')) {
        fsutil.writeText(file, content);
        res.changed.push(file);
      } else {
        res.unchanged.push(file);
        note(res, `${file} already exists and was left untouched.`);
      }
      return res;
    }
    fsutil.writeText(file, content);
    res.changed.push(file);
    note(res, 'Copilot loads .github/instructions automatically in VS Code 1.102+.');
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
      ? { installed: true, ok: true, detail: `instructions file at ${file}` }
      : { installed: false, ok: false, detail: 'instructions file not found' };
  },
};
