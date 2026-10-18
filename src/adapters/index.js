'use strict';

const adapters = [
  require('./claude-code'),
  require('./codex'),
  require('./gemini-cli'),
  require('./cursor'),
  require('./windsurf'),
  require('./antigravity'),
  require('./opencode'),
  require('./cline'),
  require('./roo-code'),
  require('./aider'),
  require('./vscode-copilot'),
  require('./agents-md'),
];

const ALIASES = {
  claude: 'claude-code',
  'claude-code': 'claude-code',
  anthropic: 'claude-code',
  codex: 'codex',
  openai: 'codex',
  gemini: 'gemini-cli',
  'gemini-cli': 'gemini-cli',
  cursor: 'cursor',
  windsurf: 'windsurf',
  devin: 'windsurf',
  antigravity: 'antigravity',
  opencode: 'opencode',
  cline: 'cline',
  roo: 'roo-code',
  'roo-code': 'roo-code',
  roocode: 'roo-code',
  aider: 'aider',
  copilot: 'vscode-copilot',
  vscode: 'vscode-copilot',
  'vscode-copilot': 'vscode-copilot',
  agents: 'agents-md',
  'agents-md': 'agents-md',
  agentsmd: 'agents-md',
};

function normalize(id) {
  const key = String(id || '').toLowerCase();
  return ALIASES[key] || null;
}

function get(id) {
  const normalized = normalize(id);
  return adapters.find((adapter) => adapter.id === normalized) || null;
}

function list() {
  return adapters.slice();
}

function ids() {
  return adapters.map((adapter) => adapter.id);
}

/** `all` expands to every adapter that installs automatically somewhere. */
function expand(names) {
  const requested = names && names.length ? names : [];
  if (!requested.length) return { resolved: [], unknown: [] };
  if (requested.includes('all')) {
    return {
      resolved: adapters
        .filter((adapter) => adapter.id !== 'agents-md')
        .map((adapter) => adapter.id),
      unknown: [],
    };
  }
  const resolved = [];
  const unknown = [];
  for (const name of requested) {
    const adapter = get(name);
    if (!adapter) unknown.push(name);
    else if (!resolved.includes(adapter.id)) resolved.push(adapter.id);
  }
  return { resolved, unknown };
}

function detectAll(ctx) {
  return adapters
    .filter((adapter) => {
      try {
        return adapter.detect(ctx);
      } catch (_) {
        return false;
      }
    })
    .map((adapter) => adapter.id);
}

module.exports = { adapters, get, list, ids, expand, detectAll, normalize };
