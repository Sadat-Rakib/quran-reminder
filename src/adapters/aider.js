'use strict';

const fs = require('fs');
const path = require('path');
const fsutil = require('../core/fsutil');
const { result, note, manual, projectPath, userPath, ensureYamlListItem, removeYamlListItem } = require('./util');
const { instructionBody } = require('./instruction');

const id = 'aider';

module.exports = {
  id,
  name: 'Aider',
  kind: 'config',
  defaultScope: 'project',
  scopes: ['user', 'project'],
  docs: 'https://aider.chat/docs/usage/conventions.html',
  capability: 'Adds the verse to Aider\'s read-only context through .aider.conf.yml.',

  markdownFile(ctx) {
    return ctx.scope === 'project'
      ? projectPath(ctx, '.aider', 'quran-reminder.md')
      : userPath(ctx, '.aider', 'quran-reminder.md');
  },

  configFile(ctx) {
    return ctx.scope === 'project'
      ? projectPath(ctx, '.aider.conf.yml')
      : userPath(ctx, '.aider.conf.yml');
  },

  readValue(ctx) {
    return ctx.scope === 'project' ? '.aider/quran-reminder.md' : this.markdownFile(ctx);
  },

  detect(ctx) {
    return (
      fsutil.exists(projectPath(ctx, '.aider.conf.yml')) ||
      fsutil.exists(projectPath(ctx, '.aider')) ||
      fsutil.exists(userPath(ctx, '.aider.conf.yml'))
    );
  },

  install(ctx) {
    const res = result();
    const mdFile = this.markdownFile(ctx);
    const configFile = this.configFile(ctx);

    const body = instructionBody(ctx.config, {
      title: 'Quran reminder',
      intro:
        'A Quranic ayah for reflection. This file is read-only context for Aider and is managed by `quran-reminder`; run `quran refresh` to rotate the verse.',
    });
    const existing = fsutil.readText(mdFile);
    const ours = existing !== null && existing.includes('quran-reminder');
    if (existing === null || (ctx.refresh && ours)) {
      fsutil.writeText(mdFile, body + '\n');
      res.changed.push(mdFile);
    } else {
      res.unchanged.push(mdFile);
    }

    const yaml = ensureYamlListItem(configFile, 'read', this.readValue(ctx));
    if (yaml.changed) res.changed.push(configFile);
    else if (yaml.unsupported) {
      manual(
        res,
        `Could not safely edit ${configFile}. Add this under the top-level "read:" key yourself: ${this.readValue(ctx)}`
      );
    } else {
      res.unchanged.push(configFile);
    }
    note(res, 'Aider reads .aider.conf.yml at startup; no restart flag needed.');
    return res;
  },

  uninstall(ctx) {
    const res = result();
    const mdFile = this.markdownFile(ctx);
    const configFile = this.configFile(ctx);

    const yaml = removeYamlListItem(configFile, 'read', this.readValue(ctx));
    if (yaml.changed) res.changed.push(configFile);
    else res.unchanged.push(configFile);

    if (fsutil.exists(mdFile)) {
      try {
        fs.unlinkSync(mdFile);
        res.changed.push(mdFile);
      } catch (error) {
        res.ok = false;
        res.errors.push(error.message);
      }
    }

    // If all that is left is an empty read list, the file was ours: remove it.
    const remaining = (fsutil.readText(configFile) || '').trim();
    if (/^read:\s*(\[\s*\])?$/.test(remaining)) {
      try {
        fs.unlinkSync(configFile);
        res.notes.push(`Removed empty ${configFile}`);
      } catch (_) {
        /* leave it */
      }
    }
    return res;
  },

  verify(ctx) {
    const mdFile = this.markdownFile(ctx);
    const configFile = this.configFile(ctx);
    const content = fsutil.readText(configFile) || '';
    if (!fsutil.exists(mdFile)) {
      return { installed: false, ok: false, detail: 'verse file not found' };
    }
    if (!content.includes(this.readValue(ctx))) {
      return { installed: false, ok: false, detail: 'read: entry missing from .aider.conf.yml' };
    }
    return { installed: true, ok: true, detail: `${path.basename(mdFile)} + read: entry` };
  },
};
