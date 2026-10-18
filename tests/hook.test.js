'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const hook = require('../src/hook');
const configModule = require('../src/core/config');
const stateModule = require('../src/core/state');
const { makeEnv, runCli } = require('./helpers');

function freshConfig(overrides = {}) {
  return { ...configModule.DEFAULTS, ...overrides };
}

test('session ids are extracted from every documented payload shape', () => {
  const saved = {};
  const keys = ['CLAUDE_SESSION_ID', 'GEMINI_SESSION_ID', 'CURSOR_SESSION_ID', 'QURAN_REMINDER_SESSION_ID'];
  for (const key of keys) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    assert.equal(hook.extractSessionId({ session_id: 'a' }), 'a');
    assert.equal(hook.extractSessionId({ sessionId: 'b' }), 'b');
    assert.equal(hook.extractSessionId({ conversation_id: 'c' }), 'c');
    assert.equal(hook.extractSessionId({ conversationId: 'd' }), 'd');
    assert.equal(hook.extractSessionId({ taskId: 'e' }), 'e');
    assert.equal(hook.extractSessionId({ trajectory_id: 'f' }), 'f');
    assert.equal(hook.extractSessionId({ properties: { sessionID: 'g' } }), 'g');
    assert.equal(hook.extractSessionId({ properties: { info: { id: 'h' } } }), 'h');
    assert.equal(hook.extractSessionId(null), null);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('Claude Code output carries both a panel and model context', () => {
  const payload = JSON.parse(
    hook.buildOutput({
      host: 'claude-code',
      panel: 'PANEL',
      context: 'CONTEXT',
      config: freshConfig(),
    })
  );
  assert.equal(payload.systemMessage, 'PANEL');
  assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(payload.hookSpecificOutput.additionalContext, 'CONTEXT');
});

test('context injection can be disabled', () => {
  const payload = JSON.parse(
    hook.buildOutput({
      host: 'claude-code',
      panel: 'PANEL',
      context: 'CONTEXT',
      config: freshConfig({ injectContext: false }),
    })
  );
  assert.equal(payload.hookSpecificOutput.additionalContext, undefined);
});

test('each host receives its documented output shape', () => {
  const cursor = JSON.parse(
    hook.buildOutput({ host: 'cursor', panel: 'P', context: 'C', config: freshConfig() })
  );
  assert.equal(cursor.additional_context, 'C');
  assert.equal(cursor.user_message, 'P');

  const windsurf = hook.buildOutput({
    host: 'windsurf',
    panel: 'P',
    context: 'C',
    config: freshConfig(),
  });
  assert.equal(windsurf, 'P');

  const antigravity = JSON.parse(
    hook.buildOutput({ host: 'antigravity', panel: 'P', context: 'C', config: freshConfig() })
  );
  assert.equal(antigravity.injectSteps[0].systemMessage.systemMessage, 'C');

  const cline = JSON.parse(
    hook.buildOutput({ host: 'cline', panel: 'P', context: 'C', config: freshConfig() })
  );
  assert.equal(cline.cancel, false);
  assert.equal(cline.contextModification, 'C');
});

test('empty output is still valid for every host', () => {
  for (const host of hook.HOSTS) {
    const output = hook.buildOutput({ host, empty: true, config: freshConfig() });
    if (host === 'windsurf') {
      assert.equal(output, '');
    } else {
      assert.doesNotThrow(() => JSON.parse(output), `${host} produced invalid JSON`);
    }
  }
});

test('a new session shows a verse; the same session does not repeat it', () => {
  const config = freshConfig();
  const state = stateModule.emptyState();

  const first = hook.run({
    host: 'claude-code',
    input: { session_id: 'session-a' },
    config,
    state,
    now: new Date(),
    persist: false,
  });
  assert.ok(first.ayah);
  assert.equal(first.reason, 'new-session');

  const second = hook.run({
    host: 'claude-code',
    input: { session_id: 'session-a' },
    config,
    state,
    now: new Date(),
    persist: false,
  });
  assert.equal(second.ayah, null);
  assert.equal(second.reason, 'already-shown-this-session');
  assert.equal(second.output, '{}');
});

test('a different session shows a different reminder', () => {
  const config = freshConfig();
  const state = stateModule.emptyState();
  const first = hook.run({ host: 'cursor', input: { session_id: 'one' }, config, state, persist: false });
  const second = hook.run({ host: 'cursor', input: { session_id: 'two' }, config, state, persist: false });
  assert.ok(first.ayah && second.ayah);
  assert.notEqual(first.ayah.ref, second.ayah.ref);
});

test('disabled config produces a silent no-op', () => {
  const result = hook.run({
    host: 'claude-code',
    input: { session_id: 'x' },
    config: freshConfig({ enabled: false }),
    state: stateModule.emptyState(),
  });
  assert.equal(result.ayah, null);
  assert.equal(result.reason, 'disabled');
});

test('the hook CLI emits parseable JSON for every host', () => {
  const { env } = makeEnv();
  for (const host of ['claude-code', 'codex', 'gemini-cli', 'cursor', 'antigravity', 'cline', 'generic']) {
    const result = runCli(['hook', '--host', host], {
      env,
      input: JSON.stringify({ session_id: `cli-${host}`, hook_event_name: 'SessionStart' }),
    });
    assert.equal(result.status, 0, `${host}: ${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.ok(payload, `${host} returned nothing`);
  }
});

test('the hook CLI survives garbage, empty and oversized input', () => {
  const { env } = makeEnv();
  for (const input of ['', 'not json at all', '[]', '{"session_id": 42}']) {
    const result = runCli(['hook', '--host', 'claude-code'], { env, input });
    assert.equal(result.status, 0);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  }

  const huge = JSON.stringify({ session_id: 'big', padding: 'x'.repeat(200000) });
  const result = runCli(['hook', '--host', 'claude-code'], { env, input: huge });
  assert.equal(result.status, 0);
  assert.doesNotThrow(() => JSON.parse(result.stdout));
});

test('the hook exits 0 even when the data file is unavailable', () => {
  const { env } = makeEnv();
  const result = runCli(['hook', '--host', 'claude-code'], {
    env: { ...env, QURAN_REMINDER_DATA: '/nonexistent' },
    input: '{"session_id":"broken"}',
  });
  assert.equal(result.status, 0);
});
