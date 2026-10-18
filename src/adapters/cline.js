'use strict';

const fs = require('fs');
const path = require('path');
const fsutil = require('../core/fsutil');
const { result, note, manual, fail, projectPath, userPath } = require('./util');
const data = require('../core/data');
const render = require('../core/render');

const id = 'cline';

function ruleBody(config) {
  const ayah = data.all()[0];
  if (!ayah) return '# Quran reminder\n\nNo bundled data found.';
  const verse = render.renderMarkdown(ayah, {
    translation: config.translation,
    showArabic: true,
    showTransliteration: true,
  });
  return [
    '# Quran reminder',
    '',
    'A Quranic ayah for reflection before the work begins. This file is managed by',
    '`quran-reminder`; run `quran refresh` to rotate the verse.',
    '',
    verse,
  ].join('\n');
}

module.exports = {
  id,
  name: 'Cline',
  kind: 'hook',
  defaultScope: 'project',
  scopes: ['user', 'project'],
  docs: 'https://github.com/cline/cline/blob/main/.clinerules/hooks/README.md',
  capability:
    'TaskStart hook on macOS/Linux; rules file on Windows (Cline hooks are not supported on Windows).',

  rulesFile(ctx) {
    return ctx.scope === 'project'
      ? projectPath(ctx, '.clinerules', 'quran-reminder.md')
      : userPath(ctx, 'Documents', 'Cline', 'Rules', 'quran-reminder.md');
  },

  hookFile(ctx) {
    return ctx.scope === 'project'
      ? projectPath(ctx, '.clinerules', 'hooks', 'TaskStart')
      : userPath(ctx, 'Documents', 'Cline', 'Hooks', 'TaskStart');
  },

  detect(ctx) {
    return (
      fsutil.exists(projectPath(ctx, '.clinerules')) ||
      fsutil.exists(userPath(ctx, 'Documents', 'Cline'))
    );
  },

  install(ctx) {
    const res = result();
    const config = ctx.config;

    if (process.platform === 'win32') {
      const file = this.rulesFile(ctx);
      const existing = fsutil.readText(file);
      const ours = existing !== null && existing.includes('quran-reminder');
      if (existing === null || (ctx.refresh && ours)) {
        fsutil.writeText(file, ruleBody(config) + '\n');
        res.changed.push(file);
      } else {
        res.unchanged.push(file);
      }
      manual(
        res,
        'Cline hooks are not supported on Windows. The rules file was installed instead; the verse is visible to the model, not printed in the UI.'
      );
      return res;
    }

    const file = this.hookFile(ctx);
    if (fsutil.exists(file)) {
      manual(
        res,
        `A Cline hook already exists at ${file}. It was left untouched. Add this line to it: exec "${ctx.nodePath}" "${path.join(ctx.appRoot, 'bin', 'quran.js')}" hook --host cline`
      );
      return res;
    }

    const script = [
      '#!/bin/sh',
      '# Installed by quran-reminder. Remove with: quran uninstall cline',
      `exec "${ctx.nodePath}" "${path.join(ctx.appRoot, 'bin', 'quran.js')}" hook --host cline`,
      '',
    ].join('\n');

    try {
      fsutil.writeText(file, script);
      fs.chmodSync(file, 0o755);
      res.changed.push(file);
    } catch (error) {
      fail(res, `Could not write ${file}: ${error.message}`);
      return res;
    }
    note(res, 'Enable "Hooks" in Cline settings (Feature Settings) so TaskStart runs.');
    return res;
  },

  uninstall(ctx) {
    const res = result();
    const hook = this.hookFile(ctx);
    const rules = this.rulesFile(ctx);
    if (fsutil.exists(hook)) {
      try {
        fs.unlinkSync(hook);
        res.changed.push(hook);
      } catch (error) {
        fail(res, error.message);
      }
    }
    if (fsutil.exists(rules)) {
      try {
        fs.unlinkSync(rules);
        res.changed.push(rules);
      } catch (error) {
        fail(res, error.message);
      }
    }
    if (!res.changed.length) res.unchanged.push(hook);
    return res;
  },

  verify(ctx) {
    const hook = this.hookFile(ctx);
    const rules = this.rulesFile(ctx);
    if (fsutil.exists(hook)) {
      const content = fsutil.readText(hook) || '';
      return content.includes('quran-reminder')
        ? { installed: true, ok: true, detail: `TaskStart hook at ${hook}` }
        : { installed: false, ok: false, detail: `${hook} exists but is not ours` };
    }
    if (fsutil.exists(rules)) {
      return { installed: true, ok: true, detail: `rules file at ${rules} (context only)` };
    }
    return { installed: false, ok: false, detail: 'no Cline hook or rules file found' };
  },
};
