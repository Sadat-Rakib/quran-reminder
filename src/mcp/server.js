'use strict';

/**
 * Minimal MCP (Model Context Protocol) stdio server — zero dependencies.
 *
 * Lets any MCP-capable client (Cline, Roo Code, Zed, Claude Desktop, ...)
 * pull a Quranic ayah on demand:
 *   { "command": "node", "args": ["<install>/bin/quran.js", "mcp"] }
 */

const readline = require('readline');
const pkg = require('../../package.json');
const configModule = require('../core/config');
const data = require('../core/data');
const select = require('../core/select');
const render = require('../core/render');

const PROTOCOL_VERSION = '2024-11-05';

const TOOLS = [
  {
    name: 'quran_ayah',
    description:
      'Return one Quranic ayah with Arabic, transliteration, English translation, surah reference and a quran.com link.',
    inputSchema: {
      type: 'object',
      properties: {
        theme: {
          type: 'string',
          enum: ['auto', 'ilm', 'tawakkul', 'shukr', 'ihsan', 'sabr', 'random'],
          description: 'Theme to draw from. "auto" follows the time of day.',
        },
        translation: {
          type: 'string',
          enum: ['yusufali', 'pickthall'],
          description: 'English translation to use.',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'plain', 'panel', 'json'],
          description: 'How to render the ayah.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'quran_themes',
    description: 'List the available Quran reminder themes and how many ayahs each contains.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

function themesResult() {
  return data
    .themes()
    .map((theme) => `- ${theme}: ${data.byTheme(theme).length} ayahs`)
    .join('\n');
}

function ayahResult(args = {}) {
  const config = configModule.load();
  const requestedTheme = args.theme || config.theme || 'auto';
  const coerced = configModule.coerce('theme', requestedTheme);
  const theme = select.resolveTheme({ ...config, theme: coerced.ok ? coerced.value : 'auto' });
  const ayah = select.selectAyah({ theme });
  if (!ayah) throw new Error('No Quran data bundled with this installation.');

  const translation = configModule.TRANSLATIONS.includes(args.translation)
    ? args.translation
    : config.translation;
  const format = ['markdown', 'plain', 'panel', 'json'].includes(args.format)
    ? args.format
    : 'markdown';

  return render.render(ayah, {
    format,
    translation,
    showArabic: true,
    showTransliteration: true,
    showTranslation: true,
    showLink: true,
    width: config.width,
    columns: 80,
    color: false,
  });
}

function handle(message) {
  if (!message || typeof message !== 'object') return null;
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  const respond = (result) => (isNotification ? null : { jsonrpc: '2.0', id, result });
  const fail = (code, text) =>
    isNotification ? null : { jsonrpc: '2.0', id, error: { code, message: text } };

  switch (method) {
    case 'initialize':
      return respond({
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'quran-reminder', version: pkg.version },
      });

    case 'notifications/initialized':
    case 'initialized':
      return null;

    case 'ping':
      return respond({});

    case 'tools/list':
      return respond({ tools: TOOLS });

    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      try {
        if (name === 'quran_ayah') {
          return respond({ content: [{ type: 'text', text: ayahResult(args) }] });
        }
        if (name === 'quran_themes') {
          return respond({ content: [{ type: 'text', text: themesResult() }] });
        }
        return fail(-32602, `Unknown tool: ${name}`);
      } catch (error) {
        return respond({
          content: [{ type: 'text', text: `quran-reminder error: ${error.message}` }],
          isError: true,
        });
      }
    }

    case 'resources/list':
      return respond({ resources: [] });

    case 'prompts/list':
      return respond({ prompts: [] });

    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const send = (payload) => {
    if (!payload) return;
    process.stdout.write(JSON.stringify(payload) + '\n');
  };

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (_) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    try {
      send(handle(message));
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: message.id === undefined ? null : message.id,
        error: { code: -32603, message: error.message },
      });
    }
  });

  rl.on('close', () => process.exit(0));
}

module.exports = { handle, main, TOOLS, ayahResult, themesResult };
