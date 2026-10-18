'use strict';

/**
 * Universal session-start hook entry point.
 *
 * Every adapter points its host at:
 *   node <install>/bin/quran.js hook --host <host-id>
 *
 * The hook reads the host's JSON from stdin, prints the reminder in the shape
 * that host understands, and always exits 0. A broken hook must never break
 * someone's coding session.
 */

const configModule = require('./core/config');
const data = require('./core/data');
const stateModule = require('./core/state');
const select = require('./core/select');
const render = require('./core/render');
const paths = require('./core/paths');

const HOSTS = [
  'claude-code',
  'codex',
  'gemini-cli',
  'cursor',
  'windsurf',
  'antigravity',
  'cline',
  'opencode',
  'generic',
];

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractSessionId(input, env = process.env) {
  const safe = input && typeof input === 'object' ? input : {};
  return firstString(
    safe.session_id,
    safe.sessionId,
    safe.conversation_id,
    safe.conversationId,
    safe.taskId,
    safe.task_id,
    safe.trajectory_id,
    safe.trajectoryId,
    safe.properties && safe.properties.sessionID,
    safe.properties && safe.properties.info && safe.properties.info.id,
    safe.properties && safe.properties.session && safe.properties.session.id,
    env.QURAN_REMINDER_SESSION_ID,
    env.CLAUDE_SESSION_ID,
    env.GEMINI_SESSION_ID,
    env.CURSOR_SESSION_ID
  );
}

function normalizeHost(host) {
  const value = String(host || 'generic').toLowerCase();
  if (value === 'claude' || value === 'claude-code') return 'claude-code';
  if (value === 'gemini' || value === 'gemini-cli') return 'gemini-cli';
  if (value === 'antigravity' || value === 'antigravity-ide') return 'antigravity';
  if (HOSTS.includes(value)) return value;
  return 'generic';
}

/** The JSON (or raw text) a given host expects on stdout. */
function buildOutput({ host, panel, context, config, empty = false }) {
  const normalized = normalizeHost(host);
  const includeContext = config.injectContext !== false;

  if (empty) {
    switch (normalized) {
      case 'windsurf':
        return '';
      case 'antigravity':
        return JSON.stringify({ injectSteps: [] });
      case 'cline':
        return JSON.stringify({ cancel: false });
      default:
        return '{}';
    }
  }

  switch (normalized) {
    case 'claude-code':
    case 'codex':
    case 'gemini-cli':
      return JSON.stringify({
        systemMessage: panel,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          ...(includeContext ? { additionalContext: context } : {}),
        },
      });

    case 'cursor':
      return JSON.stringify({
        ...(includeContext ? { additional_context: context } : {}),
        user_message: panel,
      });

    case 'windsurf':
      // Windsurf renders hook stdout when `show_output` is true.
      return panel;

    case 'antigravity':
      return JSON.stringify({
        injectSteps: includeContext ? [{ systemMessage: { systemMessage: context } }] : [],
      });

    case 'cline':
      return JSON.stringify({
        cancel: false,
        ...(includeContext ? { contextModification: context } : {}),
      });

    default:
      return JSON.stringify({
        systemMessage: panel,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          ...(includeContext ? { additionalContext: context } : {}),
        },
      });
  }
}

/**
 * Core of the hook, split out so tests can call it without stdin.
 * @returns {{ output: string, ayah: object|null, reason: string }}
 */
function run({ host, input, config, now = new Date(), state, sessionId, rng, persist = true } = {}) {
  const resolvedConfig = config || configModule.load();
  const resolvedState = state || stateModule.readState();
  const resolvedSession = sessionId || extractSessionId(input);

  const decision = stateModule.shouldShow(resolvedConfig, resolvedState, {
    sessionId: resolvedSession,
    now,
  });

  if (!decision.show) {
    return { output: buildOutput({ host, empty: true, config: resolvedConfig }), ayah: null, reason: decision.reason };
  }

  const theme = select.resolveTheme(resolvedConfig, now);
  const avoid = stateModule.avoidRefs(
    resolvedState,
    resolvedSession,
    now,
    resolvedConfig.avoidDays
  );
  const ayah = select.selectAyah({ theme, avoidRefs: avoid, rng: rng || Math.random });
  if (!ayah) {
    return { output: buildOutput({ host, empty: true, config: resolvedConfig }), ayah: null, reason: 'no-data' };
  }

  stateModule.record(resolvedState, { ref: ayah.ref, sessionId: resolvedSession, now });
  if (persist) stateModule.writeState(resolvedState);

  const renderOptions = {
    translation: resolvedConfig.translation,
    showArabic: resolvedConfig.showArabic,
    showTransliteration: resolvedConfig.showTransliteration,
    showTranslation: resolvedConfig.showTranslation,
    showLink: resolvedConfig.showLink,
    width: resolvedConfig.width,
    columns: resolvedConfig.width,
    color: false,
  };

  const panel = render.renderPanel(ayah, { ...renderOptions, color: false }).trim();
  const context = render.renderContext(ayah, renderOptions);

  return {
    output: buildOutput({ host, panel, context, config: resolvedConfig }),
    ayah,
    reason: decision.reason,
    theme,
  };
}

/** Read stdin JSON without ever hanging a host. */
function readStdin({ timeoutMs = 1200 } = {}) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }
    let raw = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      process.stdin.pause();
      if (!raw.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        resolve({ raw });
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) finish();
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const hostIndex = argv.indexOf('--host');
  const host = hostIndex !== -1 ? argv[hostIndex + 1] : env.QURAN_REMINDER_HOST || 'generic';

  try {
    const config = configModule.load();
    if (!config.enabled) {
      process.stdout.write(buildOutput({ host, empty: true, config }));
      return 0;
    }

    const input = await readStdin();
    const result = run({ host, input, config });
    if (result.output) process.stdout.write(result.output);

    if (env.QURAN_REMINDER_DEBUG) {
      const debug = {
        host: normalizeHost(host),
        reason: result.reason,
        ref: result.ayah ? result.ayah.ref : null,
        theme: result.theme || null,
        configFile: paths.configFile(),
      };
      process.stderr.write(JSON.stringify(debug) + '\n');
    }
    return 0;
  } catch (error) {
    // Never break the host. Emit a valid no-op payload.
    try {
      process.stdout.write(buildOutput({ host, empty: true, config: configModule.load() }));
    } catch (_) {
      process.stdout.write('{}');
    }
    if (env.QURAN_REMINDER_DEBUG) {
      process.stderr.write(`quran-reminder hook error: ${error && error.stack}\n`);
    }
    return 0;
  }
}

module.exports = {
  HOSTS,
  normalizeHost,
  extractSessionId,
  buildOutput,
  run,
  readStdin,
  main,
};
