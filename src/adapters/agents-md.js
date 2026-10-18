'use strict';

const fsutil = require('../core/fsutil');
const { result, note, projectPath, MARKER_START, MARKER_END } = require('./util');
const { instructionBody } = require('./instruction');

const id = 'agents-md';

module.exports = {
  id,
  name: 'Any agent that reads AGENTS.md',
  kind: 'instructions',
  defaultScope: 'project',
  scopes: ['project'],
  docs: 'https://agents.md/',
  capability:
    'Portable instruction block for Codex, Cursor, Copilot, Gemini CLI, OpenCode, Zed, Amp and others.',

  file(ctx) {
    return projectPath(ctx, 'AGENTS.md');
  },

  detect() {
    return true;
  },

  install(ctx) {
    const res = result();
    const file = this.file(ctx);
    const body = instructionBody(ctx.config, {
      title: 'Quran reminder',
      intro:
        'A Quranic ayah for reflection. Managed by `quran-reminder`; run `quran refresh` to rotate the verse.',
    });
    const update = fsutil.upsertMarkedBlock(file, body, {
      start: MARKER_START,
      end: MARKER_END,
    });
    if (update.changed) res.changed.push(file);
    else res.unchanged.push(file);
    if (update.backup) res.notes.push(`Backup written to ${update.backup}`);
    note(res, 'The block is delimited by HTML comments; the rest of AGENTS.md is never modified.');
    return res;
  },

  uninstall(ctx) {
    const res = result();
    const file = this.file(ctx);
    const update = fsutil.removeMarkedBlock(file, {
      start: MARKER_START,
      end: MARKER_END,
    });
    if (update.changed) res.changed.push(file);
    else res.unchanged.push(file);
    return res;
  },

  verify(ctx) {
    const file = this.file(ctx);
    const content = fsutil.readText(file) || '';
    const installed = content.includes(MARKER_START) && content.includes('quran.com/');
    return installed
      ? { installed: true, ok: true, detail: `managed block in ${file}` }
      : { installed: false, ok: false, detail: 'managed block not found' };
  },
};
