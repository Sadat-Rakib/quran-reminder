'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const registry = require('../src/adapters');
const installer = require('../src/core/installer');
const configModule = require('../src/core/config');
const { makeEnv, readJson, write, countOccurrences, ROOT } = require('./helpers');

function setup() {
  const sandbox = makeEnv();
  process.env.QURAN_REMINDER_HOME = sandbox.home;
  process.env.QURAN_REMINDER_USER_HOME = sandbox.userHome;
  process.env.QURAN_REMINDER_PROJECT = sandbox.project;

  const ctx = installer.buildContext({
    home: sandbox.userHome,
    projectDir: sandbox.project,
    scope: 'user',
    appRoot: ROOT,
    config: configModule.load(),
  });

  return { ...sandbox, ctx };
}

function install(id, ctx, scope) {
  const adapter = registry.get(id);
  return { adapter, result: adapter.install({ ...ctx, scope: scope || ctx.scope }) };
}

test('Claude Code install preserves existing settings and hooks', () => {
  const { ctx, userHome } = setup();
  const file = path.join(userHome, '.claude', 'settings.json');
  write(
    file,
    JSON.stringify(
      {
        permissions: { allow: ['Bash(npm test)'] },
        env: { FOO: 'bar' },
        hooks: {
          SessionStart: [{ hooks: [{ type: 'command', command: 'echo existing' }] }],
          Stop: [{ hooks: [{ type: 'command', command: 'echo stop' }] }],
        },
      },
      null,
      2
    )
  );

  const { result, adapter } = install('claude-code', ctx);
  assert.equal(result.ok, true, result.errors.join(', '));

  const data = readJson(file);
  assert.deepEqual(data.permissions, { allow: ['Bash(npm test)'] });
  assert.deepEqual(data.env, { FOO: 'bar' });
  assert.equal(data.hooks.Stop[0].hooks[0].command, 'echo stop');
  assert.equal(data.hooks.SessionStart.length, 2);
  assert.equal(data.hooks.SessionStart[0].hooks[0].command, 'echo existing');
  assert.match(data.hooks.SessionStart[1].hooks[0].command, /hook --host claude-code/);

  assert.equal(adapter.verify(ctx).installed, true);

  // Installing twice must not duplicate the hook.
  install('claude-code', ctx);
  const after = fs.readFileSync(file, 'utf8');
  assert.equal(countOccurrences(after, 'hook --host claude-code'), 1);

  const removed = adapter.uninstall(ctx);
  assert.equal(removed.ok, true);
  const cleaned = readJson(file);
  assert.equal(cleaned.hooks.SessionStart.length, 1);
  assert.equal(cleaned.hooks.SessionStart[0].hooks[0].command, 'echo existing');
  assert.equal(cleaned.hooks.Stop[0].hooks[0].command, 'echo stop');
  assert.deepEqual(cleaned.permissions, { allow: ['Bash(npm test)'] });
  assert.equal(adapter.verify(ctx).installed, false);
});

test('an unreadable JSON config is never overwritten', () => {
  const { ctx, userHome } = setup();
  const file = path.join(userHome, '.claude', 'settings.json');
  write(file, '{ this is not json');

  const { result, adapter } = install('claude-code', ctx);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Invalid JSON/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{ this is not json');
  assert.equal(adapter.verify(ctx).installed, false);
});

test('Cursor installs the flat sessionStart shape and preserves other hooks', () => {
  const { ctx, userHome } = setup();
  const file = path.join(userHome, '.cursor', 'hooks.json');
  write(
    file,
    JSON.stringify({ version: 1, hooks: { beforeShellExecution: [{ command: 'echo check' }] } })
  );

  const { adapter } = install('cursor', ctx);
  const data = readJson(file);
  assert.equal(data.version, 1);
  assert.equal(data.hooks.beforeShellExecution[0].command, 'echo check');
  assert.equal(data.hooks.sessionStart.length, 1);
  assert.equal(data.hooks.sessionStart[0].hooks, undefined, 'must not use the grouped shape');
  assert.match(data.hooks.sessionStart[0].command, /hook --host cursor/);
  assert.equal(adapter.verify(ctx).installed, true);

  adapter.uninstall(ctx);
  const cleaned = readJson(file);
  assert.equal(cleaned.hooks.sessionStart, undefined);
  assert.equal(cleaned.hooks.beforeShellExecution[0].command, 'echo check');
});

test('Windsurf writes a PowerShell-safe command', () => {
  const { ctx, userHome } = setup();
  const file = path.join(userHome, '.codeium', 'windsurf', 'hooks.json');
  const { adapter } = install('windsurf', ctx);
  const entry = readJson(file).hooks.pre_user_prompt[0];
  assert.equal(entry.show_output, true);
  assert.match(entry.command, /hook --host windsurf/);
  assert.match(entry.powershell, /^& /, 'PowerShell needs the call operator for quoted paths');
  assert.equal(adapter.verify(ctx).installed, true);
});

test('Gemini CLI and Codex use the grouped SessionStart shape', () => {
  const { ctx, userHome } = setup();
  for (const [id, file] of [
    ['gemini-cli', path.join(userHome, '.gemini', 'settings.json')],
    ['codex', path.join(userHome, '.codex', 'hooks.json')],
  ]) {
    const { adapter } = install(id, ctx);
    const data = readJson(file);
    const group = data.hooks.SessionStart[0];
    assert.ok(Array.isArray(group.hooks), `${id} needs a nested hooks array`);
    assert.match(group.hooks[0].command, new RegExp(`hook --host ${id}`));
    assert.equal(adapter.verify(ctx).installed, true);
    adapter.uninstall(ctx);
  }
});

test('Antigravity uses a named hook entry', () => {
  const { ctx, project } = setup();
  const file = path.join(project, '.agents', 'hooks.json');
  const { adapter } = install('antigravity', ctx, 'project');
  const data = readJson(file);
  assert.equal(data['quran-reminder'].SessionStart[0].type, 'command');
  assert.match(data['quran-reminder'].SessionStart[0].command, /hook --host antigravity/);
  assert.equal(adapter.verify({ ...ctx, scope: 'project' }).installed, true);

  adapter.uninstall({ ...ctx, scope: 'project' });
  const cleaned = fs.existsSync(file) ? readJson(file) : {};
  assert.equal(cleaned['quran-reminder'], undefined);
});

test('AGENTS.md keeps surrounding content and is idempotent', () => {
  const { ctx, project } = setup();
  const file = path.join(project, 'AGENTS.md');
  write(file, '# Project rules\n\n- Use tabs.\n- Run tests.\n');

  const { adapter } = install('agents-md', ctx, 'project');
  let content = fs.readFileSync(file, 'utf8');
  assert.ok(content.startsWith('# Project rules'));
  assert.ok(content.includes('- Use tabs.'));
  assert.equal(countOccurrences(content, '<!-- quran-reminder:start -->'), 1);
  assert.equal(countOccurrences(content, 'quran.com/'), 1);

  install('agents-md', ctx, 'project');
  content = fs.readFileSync(file, 'utf8');
  assert.equal(countOccurrences(content, '<!-- quran-reminder:start -->'), 1);

  adapter.uninstall({ ...ctx, scope: 'project' });
  const restored = fs.readFileSync(file, 'utf8');
  assert.equal(restored.trim(), '# Project rules\n\n- Use tabs.\n- Run tests.');
});

test('Aider appends to an existing read list without dropping entries', () => {
  const { ctx, project } = setup();
  const conf = path.join(project, '.aider.conf.yml');
  write(conf, 'model: gpt-4\nread: [CONVENTIONS.md]\nauto-commits: true\n');

  const { adapter } = install('aider', ctx, 'project');
  const yaml = fs.readFileSync(conf, 'utf8');
  assert.match(yaml, /CONVENTIONS\.md/);
  assert.match(yaml, /\.aider\/quran-reminder\.md/);
  assert.match(yaml, /model: gpt-4/);
  assert.match(yaml, /auto-commits: true/);
  assert.ok(fs.existsSync(path.join(project, '.aider', 'quran-reminder.md')));
  assert.equal(adapter.verify({ ...ctx, scope: 'project' }).installed, true);

  adapter.uninstall({ ...ctx, scope: 'project' });
  const cleaned = fs.readFileSync(conf, 'utf8');
  assert.ok(!cleaned.includes('quran-reminder.md'));
  assert.match(cleaned, /CONVENTIONS\.md/);
  assert.equal(fs.existsSync(path.join(project, '.aider', 'quran-reminder.md')), false);
});

test('Aider supports block-style read lists', () => {
  const { ctx, project } = setup();
  const conf = path.join(project, '.aider.conf.yml');
  write(conf, 'read:\n  - CONVENTIONS.md\n  - STYLE.md\n');

  const { adapter } = install('aider', ctx, 'project');
  const yaml = fs.readFileSync(conf, 'utf8');
  assert.match(yaml, /- CONVENTIONS\.md/);
  assert.match(yaml, /- STYLE\.md/);
  assert.match(yaml, /- \.aider\/quran-reminder\.md/);

  adapter.uninstall({ ...ctx, scope: 'project' });
  const cleaned = fs.readFileSync(conf, 'utf8');
  assert.match(cleaned, /- CONVENTIONS\.md/);
  assert.match(cleaned, /- STYLE\.md/);
  assert.ok(!cleaned.includes('quran-reminder.md'));
});

test('Roo Code, Copilot and OpenCode write new files only', () => {
  const { ctx, project } = setup();
  for (const id of ['roo-code', 'vscode-copilot', 'opencode']) {
    const { adapter, result } = install(id, ctx, 'project');
    assert.equal(result.ok, true, `${id}: ${result.errors.join(', ')}`);
    assert.equal(adapter.verify({ ...ctx, scope: 'project' }).installed, true, id);
  }

  const copilot = path.join(project, '.github', 'instructions', 'quran-reminder.instructions.md');
  const content = fs.readFileSync(copilot, 'utf8');
  assert.match(content, /^---/);
  assert.match(content, /applyTo: '\*\*'/);

  const plugin = path.join(project, '.opencode', 'plugins', 'quran-reminder.js');
  const source = fs.readFileSync(plugin, 'utf8');
  assert.match(source, /session\.created/);
  assert.match(source, /noReply: true/);
  assert.doesNotThrow(() => new Function(source.replace(/^import .*$/gm, '').replace(/export const/g, 'const')), 'plugin should parse');
});

test('Cline writes a rules file on Windows and a TaskStart hook elsewhere', () => {
  const { ctx, project } = setup();
  const { adapter } = install('cline', ctx, 'project');
  const rules = path.join(project, '.clinerules', 'quran-reminder.md');
  const hook = path.join(project, '.clinerules', 'hooks', 'TaskStart');

  if (process.platform === 'win32') {
    assert.ok(fs.existsSync(rules));
    assert.ok(!fs.existsSync(hook));
  } else {
    assert.ok(fs.existsSync(hook));
    const script = fs.readFileSync(hook, 'utf8');
    assert.match(script, /^#!\/bin\/sh/);
    assert.match(script, /hook --host cline/);
    assert.ok(fs.statSync(hook).mode & 0o100, 'hook must be executable');
  }
  assert.equal(adapter.verify({ ...ctx, scope: 'project' }).installed, true);
});

test('every adapter installs, verifies and uninstalls cleanly', () => {
  const { ctx } = setup();
  for (const adapter of registry.list()) {
    const scope = adapter.defaultScope;
    const scoped = { ...ctx, scope };
    const installed = adapter.install(scoped);
    assert.equal(installed.ok, true, `${adapter.id}: ${installed.errors.join(', ')}`);
    const verification = adapter.verify(scoped);
    assert.equal(verification.installed, true, `${adapter.id}: ${verification.detail}`);

    const removed = adapter.uninstall(scoped);
    assert.equal(removed.ok, true, `${adapter.id}: ${removed.errors.join(', ')}`);
    assert.equal(adapter.verify(scoped).installed, false, `${adapter.id} left files behind`);
  }
});

test('install registry records and clears entries', () => {
  const { ctx, home } = setup();
  installer.installOne(registry.get('claude-code'), ctx);
  let data = installer.readRegistry(home);
  assert.ok(data.installs.some((entry) => entry.id === 'claude-code'));

  installer.uninstallOne(registry.get('claude-code'), ctx);
  data = installer.readRegistry(home);
  assert.ok(!data.installs.some((entry) => entry.id === 'claude-code'));
});
