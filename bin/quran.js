#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const pkg = require('../package.json');
const configModule = require('../src/core/config');
const data = require('../src/core/data');
const paths = require('../src/core/paths');
const stateModule = require('../src/core/state');
const select = require('../src/core/select');
const render = require('../src/core/render');
const fsutil = require('../src/core/fsutil');
const installer = require('../src/core/installer');
const registry = require('../src/adapters');

// ---------------------------------------------------------------------------
// Terminal helpers
// ---------------------------------------------------------------------------

function colorEnabled() {
  if (process.env.NO_COLOR) return false;
  const config = configModule.load();
  if (config.color === 'never') return false;
  if (config.color === 'always') return true;
  return Boolean(process.stdout.isTTY);
}

const COLOR = colorEnabled();
const paint = {
  green: (s) => (COLOR ? `\x1b[38;2;82;183;136m${s}\x1b[0m` : s),
  dim: (s) => (COLOR ? `\x1b[2m${s}\x1b[22m` : s),
  bold: (s) => (COLOR ? `\x1b[1m${s}\x1b[22m` : s),
  yellow: (s) => (COLOR ? `\x1b[33m${s}\x1b[39m` : s),
  red: (s) => (COLOR ? `\x1b[31m${s}\x1b[39m` : s),
};

const SYMBOL = {
  ok: '✓',
  skip: '·',
  warn: '!',
  fail: '✗',
  bullet: '•',
};

function line(text = '') {
  process.stdout.write(text + '\n');
}

function heading(text) {
  line('');
  line(paint.bold(text));
  line(paint.dim('─'.repeat(Math.min(text.length + 2, 60))));
}

function parseFlags(argv) {
  const flags = { _: [] };
  const takesValue = new Set([
    '--theme',
    '--translation',
    '--format',
    '--width',
    '--scope',
    '--host',
    '--ref',
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      flags._.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const [name, inline] = arg.split('=');
      if (inline !== undefined) {
        flags[name.slice(2)] = inline;
      } else if (takesValue.has(name)) {
        flags[name.slice(2)] = argv[++i];
      } else {
        flags[name.slice(2)] = true;
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      flags[arg.slice(1)] = true;
      continue;
    }
    flags._.push(arg);
  }
  return flags;
}

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

function pickAyahForDisplay(config, flags) {
  if (flags.ref) {
    const ayah = data.byRef(String(flags.ref));
    if (!ayah) {
      line(paint.red(`No bundled ayah with reference "${flags.ref}".`));
      line(paint.dim('Run `quran themes` to see the available themes, or omit --ref.'));
      process.exitCode = 1;
      return null;
    }
    return ayah;
  }

  const theme =
    flags.theme && flags.theme !== 'auto'
      ? configModule.coerce('theme', flags.theme).value || config.theme
      : config.theme;

  const effective = { ...config, theme };
  const resolvedTheme = select.resolveTheme(effective);
  const state = stateModule.readState();
  const avoid = stateModule.avoidRefs(state, null, new Date(), config.avoidDays);
  return select.selectAyah({ theme: resolvedTheme, avoidRefs: avoid });
}

function commandShow(flags) {
  const config = configModule.load();
  if (flags.theme) {
    const coerced = configModule.coerce('theme', flags.theme);
    if (!coerced.ok) {
      line(paint.red(coerced.error));
      process.exitCode = 1;
      return;
    }
    config.theme = coerced.value;
  }
  if (flags.translation) {
    const coerced = configModule.coerce('translation', flags.translation);
    if (!coerced.ok) {
      line(paint.red(coerced.error));
      process.exitCode = 1;
      return;
    }
    config.translation = coerced.value;
  }

  const ayah = pickAyahForDisplay(config, flags);
  if (!ayah) {
    if (!process.exitCode) {
      line(paint.red('No Quran data available. Reinstall the package or run `npm run build:data`.'));
      process.exitCode = 1;
    }
    return;
  }

  const format = flags.format || (flags.json ? 'json' : 'panel');
  if (!configModule.FORMATS.includes(format)) {
    line(paint.red(`Unknown format "${format}". Use: ${configModule.FORMATS.join(', ')}`));
    process.exitCode = 1;
    return;
  }

  const width = flags.width ? Number(flags.width) : config.width;
  const output = render.render(ayah, {
    format,
    translation: config.translation,
    showArabic: flags.arabic ? true : flags['no-arabic'] ? false : config.showArabic,
    showTransliteration: flags['no-transliteration'] ? false : config.showTransliteration,
    showTranslation: flags['no-translation'] ? false : config.showTranslation,
    showLink: flags['no-link'] ? false : config.showLink,
    width: Number.isFinite(width) ? width : config.width,
    columns: process.stdout.columns || 80,
    color: format === 'panel' && COLOR && !flags['no-color'],
  });

  line(output);
}

// ---------------------------------------------------------------------------
// install / uninstall
// ---------------------------------------------------------------------------

function scopeFromFlags(flags, fallback) {
  if (flags.project) return 'project';
  if (flags.user) return 'user';
  if (flags.scope) {
    const scope = String(flags.scope).toLowerCase();
    if (scope !== 'user' && scope !== 'project') return null;
    return scope;
  }
  return fallback;
}

function detectAdapter(adapter, ctx) {
  for (const scope of adapter.scopes) {
    try {
      if (adapter.detect({ ...ctx, scope })) return true;
    } catch (_) {
      /* try the next scope */
    }
  }
  return false;
}

function printAdapterResult(adapter, result) {
  const prefix = result.ok ? paint.green(SYMBOL.ok) : paint.red(SYMBOL.fail);
  line(`${prefix} ${paint.bold(adapter.name)}`);
  for (const file of result.changed) line(`  ${paint.green('+')} ${file}`);
  for (const file of result.unchanged) line(`  ${paint.dim(SYMBOL.skip + ' ' + file + ' (already installed)')}`);
  for (const note of result.notes) line(`  ${paint.dim(SYMBOL.bullet + ' ' + note)}`);
  for (const manual of result.manual) line(`  ${paint.yellow(SYMBOL.warn + ' ' + manual)}`);
  for (const error of result.errors) line(`  ${paint.red(SYMBOL.fail + ' ' + error)}`);
}

/** Pure parser for the interactive menu answer — unit-tested in tests/cli.test.js. */
function resolveSelection(answer, adapters, detectedIds = []) {
  const trimmed = String(answer || '').trim();
  if (!trimmed) return detectedIds.slice();
  if (/^all$/i.test(trimmed)) return adapters.map((adapter) => adapter.id);
  return trimmed
    .split(/[,\s]+/)
    .map((token) => Number(token))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= adapters.length)
    .map((n) => adapters[n - 1].id);
}

async function chooseTools(adapters, ctx, verb) {
  const readline = require('readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  line('');
  line(paint.bold(`${verb} Quran reminders`));
  line(paint.dim('Detected tools are marked with ✓. Choose numbers, or type "all".'));
  line('');

  adapters.forEach((adapter, index) => {
    const detected = detectAdapter(adapter, ctx);
    const mark = detected ? paint.green('✓') : ' ';
    line(`  ${String(index + 1).padStart(2)}. ${mark} ${adapter.name} ${paint.dim(`(${adapter.kind})`)}`);
  });

  line('');
  const detectedIds = adapters
    .filter((adapter) => detectAdapter(adapter, ctx))
    .map((adapter) => adapter.id);

  const hint = detectedIds.length ? ` [${detectedIds.length} detected]` : '';
  const answer = await rl.question(`Install for${hint} — numbers, "all", or Enter for detected: `);
  rl.close();

  return resolveSelection(answer, adapters, detectedIds);
}

async function commandInstall(flags) {
  const config = configModule.load();
  const requested = flags.all ? ['all'] : flags._.slice(1);

  const self = installer.ensureSelfInstalled({ force: Boolean(flags.force) });
  if (self.installed) {
    line(paint.dim(`Installed runtime copy in ${self.appRoot}`));
  }

  let ctx = installer.buildContext({
    scope: 'user',
    config,
    appRoot: self.appRoot,
  });

  let ids = requested;
  if (!ids.length) {
    if (!process.stdin.isTTY) {
      line(paint.red('No tools specified.'));
      line('Usage: quran install <tool...> [--all] [--scope user|project]');
      line(paint.dim(`Available: ${registry.ids().join(', ')}`));
      process.exitCode = 1;
      return;
    }
    ids = await chooseTools(registry.list(), ctx, 'Install');
  }

  const { resolved, unknown } = registry.expand(ids);
  if (unknown.length) {
    line(paint.red(`Unknown tool(s): ${unknown.join(', ')}`));
    line(paint.dim(`Available: ${registry.ids().join(', ')}`));
    process.exitCode = 1;
  }
  if (!resolved.length) {
    line(paint.yellow('Nothing selected.'));
    return;
  }

  heading('Installing');
  let failures = 0;

  for (const id of resolved) {
    const adapter = registry.get(id);
    const scope = scopeFromFlags(flags, adapter.defaultScope);
    if (!scope) {
      line(paint.red(`Invalid --scope for ${adapter.name}. Use user or project.`));
      failures++;
      continue;
    }
    if (!adapter.scopes.includes(scope)) {
      line(
        paint.yellow(
          `${SYMBOL.warn} ${adapter.name} only supports ${adapter.scopes.join('/')} scope; using ${adapter.scopes[0]}.`
        )
      );
    }
    const effectiveScope = adapter.scopes.includes(scope) ? scope : adapter.scopes[0];
    ctx = { ...ctx, scope: effectiveScope };

    const result = installer.installOne(adapter, ctx);
    printAdapterResult(adapter, result);
    if (!result.ok) failures++;
  }

  heading('Next steps');
  line(`  ${SYMBOL.bullet} Open a new session in the tool(s) above.`);
  line(`  ${SYMBOL.bullet} Verify any time: ${paint.green('quran doctor')}`);
  line(`  ${SYMBOL.bullet} Preview the panel: ${paint.green('quran show')}`);
  line('');
  if (failures) {
    line(paint.yellow(`${failures} integration(s) need attention — see the notes above.`));
    process.exitCode = 1;
  } else {
    line(paint.green('Done.'));
  }
}

async function commandUninstall(flags) {
  const requested = flags.all ? ['all'] : flags._.slice(1);
  let ids = requested;

  if (!ids.length) {
    const installed = installer
      .verifyAll(installer.buildContext({ config: configModule.load() }))
      .filter((entry) => entry.installed);

    if (!installed.length) {
      line(paint.dim('Nothing is installed.'));
      return;
    }
    if (!process.stdin.isTTY) {
      line(paint.red('Specify which tool(s) to uninstall.'));
      line(paint.dim(`Installed: ${installed.map((entry) => entry.adapter.id).join(', ')}`));
      process.exitCode = 1;
      return;
    }
    const readline = require('readline/promises');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    line('');
    line(paint.bold('Remove Quran reminders'));
    installed.forEach((entry, index) => {
      line(`  ${String(index + 1).padStart(2)}. ${entry.adapter.name}`);
    });
    line('');
    const answer = (await rl.question('Remove which numbers? (or "all"): ')).trim();
    rl.close();
    ids = /^all$/i.test(answer)
      ? installed.map((entry) => entry.adapter.id)
      : answer
          .split(/[,\s]+/)
          .map((token) => Number(token))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= installed.length)
          .map((n) => installed[n - 1].adapter.id);
  }

  const { resolved, unknown } = registry.expand(ids);
  if (unknown.length) {
    line(paint.red(`Unknown tool(s): ${unknown.join(', ')}`));
    process.exitCode = 1;
  }

  heading('Uninstalling');
  for (const id of resolved) {
    const adapter = registry.get(id);
    const scope = scopeFromFlags(flags, adapter.defaultScope) || adapter.scopes[0];
    const ctx = installer.buildContext({ scope, config: configModule.load() });
    const result = installer.uninstallOne(adapter, ctx);
    printAdapterResult(adapter, result);
  }

  if (flags.purge) {
    const target = paths.homeDir();
    heading('Purging settings');
    try {
      fs.rmSync(target, { recursive: true, force: true });
      line(`  ${paint.green('-')} ${target}`);
    } catch (error) {
      line(`  ${paint.red(SYMBOL.fail)} ${error.message}`);
      process.exitCode = 1;
    }
  } else {
    line('');
    line(paint.dim(`Settings kept in ${paths.homeDir()} — remove them with: quran uninstall --purge`));
  }
}

// ---------------------------------------------------------------------------
// list / doctor / config / themes / refresh
// ---------------------------------------------------------------------------

function commandList() {
  const config = configModule.load();
  const ctx = installer.buildContext({ config });
  heading('Supported tools');

  for (const adapter of registry.list()) {
    let detected = false;
    let verification = { installed: false };
    try {
      detected = detectAdapter(adapter, ctx);
      verification = adapter.verify(ctx);
    } catch (_) {
      /* ignore */
    }
    const marks = [
      detected ? paint.green('detected') : paint.dim('not found'),
      verification.installed ? paint.green('installed') : paint.dim('not installed'),
    ].join('  ');
    line(`  ${paint.bold(adapter.name.padEnd(30))} ${marks}`);
    line(paint.dim(`    ${adapter.capability}`));
  }

  line('');
  line(paint.dim(`Manual option: quran mcp  (MCP server for any MCP-capable client)`));
}

function commandThemes() {
  const meta = data.meta();
  heading('Themes');
  const descriptions = {
    ilm: 'knowledge, learning, reflection, intention',
    tawakkul: 'reliance on Allah, effort, trust',
    shukr: 'gratitude, remembrance, blessings',
    ihsan: 'excellence, character, mercy, speech',
    sabr: 'patience, perseverance, hardship',
  };
  for (const theme of configModule.THEMES) {
    const count = data.byTheme(theme).length;
    const window =
      theme === 'ilm' ? '04:00–08:59' : theme === 'tawakkul' ? '09:00–16:59' : theme === 'shukr' ? '17:00–03:59' : '';
    line(
      `  ${paint.green(theme.padEnd(10))} ${String(count).padStart(3)} ayahs  ${paint.dim(descriptions[theme] || '')} ${paint.dim(window ? `(${window})` : '')}`
    );
  }
  line('');
  line(paint.dim(`Set one with: quran config set theme sabr`));
}

function commandDoctor() {
  const config = configModule.load();
  const ctx = installer.buildContext({ config });
  let failures = 0;

  heading('Environment');
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const nodeOk = nodeMajor >= 18;
  line(`  ${nodeOk ? paint.green(SYMBOL.ok) : paint.red(SYMBOL.fail)} Node ${process.versions.node} (need >= 18)`);
  if (!nodeOk) failures++;
  line(`  ${paint.green(SYMBOL.ok)} ${process.platform} ${process.arch}`);
  line(`  ${paint.dim(SYMBOL.bullet)} Settings: ${paths.configFile()}`);
  line(`  ${paint.dim(SYMBOL.bullet)} State: ${paths.stateFile()}`);

  heading('Quran data');
  const meta = data.meta();
  if (!meta) {
    line(`  ${paint.red(SYMBOL.fail)} data/ayahs.json could not be loaded`);
    failures++;
  } else {
    const checks = [
      ['ayahs bundled', meta.ayahCount >= 100, String(meta.ayahCount)],
      ['themes present', meta.themes.length === 5, meta.themes.join(', ')],
      [
        'every theme populated',
        meta.themes.every((theme) => data.byTheme(theme).length > 0),
        meta.themes.map((theme) => `${theme}:${data.byTheme(theme).length}`).join(' '),
      ],
      ['translations', configModule.TRANSLATIONS.every((key) => Boolean(meta.translations[key])), configModule.TRANSLATIONS.join(', ')],
    ];
    for (const [label, ok, detail] of checks) {
      line(`  ${ok ? paint.green(SYMBOL.ok) : paint.red(SYMBOL.fail)} ${label} ${paint.dim(`(${detail})`)}`);
      if (!ok) failures++;
    }
    const manifest = fsutil.readJson(paths.manifestFile);
    if (manifest.ok && manifest.data && manifest.data.sha256) {
      const crypto = require('crypto');
      const actual = crypto
        .createHash('sha256')
        .update(fs.readFileSync(paths.dataFile))
        .digest('hex');
      const match = actual === manifest.data.sha256;
      line(`  ${match ? paint.green(SYMBOL.ok) : paint.yellow(SYMBOL.warn)} dataset checksum ${paint.dim(match ? 'matches manifest' : 'differs from manifest (run npm run build:data)')}`);
      if (!match) failures++;
    }
  }

  heading('Settings');
  const configFile = paths.configFile();
  const parsed = fsutil.readJson(configFile);
  if (fsutil.exists(configFile) && !parsed.ok) {
    line(`  ${paint.red(SYMBOL.fail)} ${parsed.error}`);
    failures++;
  } else {
    line(`  ${paint.green(SYMBOL.ok)} config readable (${config.enabled ? 'enabled' : 'disabled'})`);
  }
  const coerced = [];
  for (const [key, value] of Object.entries(config)) {
    if (key === 'version') continue;
    if (!configModule.coerce(key, value).ok) coerced.push(key);
  }
  line(
    `  ${coerced.length ? paint.red(SYMBOL.fail) : paint.green(SYMBOL.ok)} values valid${coerced.length ? ` (bad: ${coerced.join(', ')})` : ''}`
  );
  if (coerced.length) failures++;

  heading('Integrations');
  const verifications = installer.verifyAll(ctx);
  const installed = verifications.filter((entry) => entry.installed);
  if (!installed.length) {
    line(`  ${paint.yellow(SYMBOL.warn)} Nothing installed yet. Run: quran install`);
  } else {
    for (const entry of installed) {
      line(`  ${entry.ok ? paint.green(SYMBOL.ok) : paint.red(SYMBOL.fail)} ${entry.adapter.name}`);
      const appPath = String(ctx.appRoot).replace(/\\/g, '/');
      let detail = String(entry.detail).replace(appPath, '~/.quran-reminder/app');
      detail = detail.replace(/"[^"]*node(?:\.exe)?"/i, 'node');
      if (detail.length > 96) detail = detail.slice(0, 93) + '...';
      line(paint.dim(`      ${detail}`));
      if (!entry.ok) failures++;
    }
  }

  heading('Runtime');
  line(`  ${paint.dim(SYMBOL.bullet)} Installed copy: ${ctx.appRoot}`);
  const hookTest = spawnSync(process.execPath, [path.join(ctx.appRoot, 'bin', 'quran.js'), 'hook', '--host', 'generic'], {
    input: JSON.stringify({ session_id: 'doctor-' + Date.now() }),
    encoding: 'utf8',
    timeout: 10000,
  });
  let hookOk = false;
  try {
    const payload = JSON.parse(hookTest.stdout);
    hookOk = Boolean(payload.systemMessage);
  } catch (_) {
    hookOk = false;
  }
  line(`  ${hookOk ? paint.green(SYMBOL.ok) : paint.red(SYMBOL.fail)} hook produces a valid payload`);
  if (!hookOk) failures++;

  line('');
  if (failures) {
    line(paint.yellow(`${failures} check(s) failed.`));
    process.exitCode = 1;
  } else {
    line(paint.green('Everything checks out.'));
  }
}

function commandConfig(flags) {
  const args = flags._.slice(1);
  const action = args[0] || 'list';
  const file = paths.configFile();

  if (action === 'list' || action === 'show') {
    const config = configModule.load();
    heading('Configuration');
    for (const [key, value] of Object.entries(config)) {
      if (key === 'version') continue;
      line(`  ${key.padEnd(20)} ${JSON.stringify(value)}`);
    }
    line('');
    line(paint.dim(`File: ${file}`));
    return;
  }

  if (action === 'get') {
    const key = args[1];
    if (!key) {
      line(paint.red('Usage: quran config get <key>'));
      process.exitCode = 1;
      return;
    }
    const config = configModule.load();
    if (!(key in config)) {
      line(paint.red(`Unknown setting: ${key}`));
      process.exitCode = 1;
      return;
    }
    line(JSON.stringify(config[key]));
    return;
  }

  if (action === 'set') {
    const key = args[1];
    const value = args.slice(2).join(' ');
    if (!key || value === '') {
      line(paint.red('Usage: quran config set <key> <value>'));
      process.exitCode = 1;
      return;
    }
    const result = configModule.set(key, value);
    if (!result.ok) {
      line(paint.red(result.error));
      process.exitCode = 1;
      return;
    }
    line(`${paint.green(SYMBOL.ok)} ${key} = ${JSON.stringify(result.value)}`);
    line(paint.dim(`Saved to ${file}`));
    return;
  }

  if (action === 'reset') {
    const result = configModule.reset();
    if (!result.ok) {
      line(paint.red(result.error));
      process.exitCode = 1;
      return;
    }
    line(`${paint.green(SYMBOL.ok)} Settings reset to defaults.`);
    return;
  }

  line(paint.red(`Unknown config action: ${action}`));
  line('Usage: quran config [list|get <key>|set <key> <value>|reset]');
  process.exitCode = 1;
}

function commandRefresh(flags) {
  const config = configModule.load();
  const ctx = installer.buildContext({ config, refresh: true });
  const recorded = installer.readRegistry().installs;
  const targets = recorded.length
    ? [...new Set(recorded.map((entry) => entry.id))]
    : registry.list().filter((adapter) => {
        try {
          return adapter.verify(ctx).installed;
        } catch (_) {
          return false;
        }
      }).map((adapter) => adapter.id);

  if (!targets.length) {
    line(paint.yellow('Nothing is installed. Run: quran install'));
    return;
  }

  heading('Refreshing verses');
  for (const id of targets) {
    const adapter = registry.get(id);
    if (!adapter) continue;
    if (!['rules', 'instructions', 'config'].includes(adapter.kind) && adapter.id !== 'cline') {
      continue;
    }
    const scope = (recorded.find((entry) => entry.id === id) || {}).scope || adapter.defaultScope;
    const result = installer.installOne(adapter, { ...ctx, scope });
    printAdapterResult(adapter, result);
  }
  line('');
  line(paint.dim('Static instruction files now show a new verse. Hook-based tools pick a new verse automatically.'));
}

// ---------------------------------------------------------------------------
// run / mcp / help
// ---------------------------------------------------------------------------

function commandRun(flags) {
  const command = flags._.slice(1);
  if (!command.length) {
    line(paint.red('Usage: quran run <command...>'));
    line(paint.dim('Example: quran run aider'));
    process.exitCode = 1;
    return;
  }

  const config = configModule.load();
  const theme = select.resolveTheme(config);
  const ayah = select.selectAyah({ theme });
  if (ayah) {
    line(
      render.renderPanel(ayah, {
        translation: config.translation,
        showArabic: config.showArabic,
        showTransliteration: config.showTransliteration,
        showTranslation: config.showTranslation,
        showLink: config.showLink,
        width: config.width,
        columns: process.stdout.columns || 80,
        color: COLOR,
      })
    );
  }

  const quoteArg = (arg) =>
    /[\s"]/.test(arg) ? `"${String(arg).replace(/"/g, '\\"')}"` : arg;
  const result = spawnSync(command.map(quoteArg).join(' '), {
    stdio: 'inherit',
    shell: true,
  });
  process.exit(result.status === null ? 1 : result.status);
}

function commandMcp() {
  require('../src/mcp/server').main();
}

function help() {
  line('');
  line(paint.bold('  quran-reminder') + paint.dim(`  v${pkg.version}`));
  line(paint.dim('  One ayah at the start of every coding session.'));
  line('');
  line(paint.bold('  USAGE'));
  line('    quran                            Show one ayah');
  line('    quran show [options]             Show one ayah with options');
  line('    quran install [tool...]          Install for one or more tools');
  line('    quran uninstall [tool...]        Remove the integration');
  line('    quran list                       Show supported tools and status');
  line('    quran doctor                     Verify data, settings and hooks');
  line('    quran config [list|get|set|reset]');
  line('    quran refresh                    Rotate verses in instruction files');
  line('    quran run <command...>           Print a verse, then run a command');
  line('    quran mcp                        Start the MCP server (stdio)');
  line('');
  line(paint.bold('  SHOW OPTIONS'));
  line('    --theme <name>        auto | ilm | tawakkul | shukr | ihsan | sabr | random');
  line('    --translation <name>  yusufali | pickthall');
  line('    --format <name>       panel | plain | markdown | json | oneline');
  line('    --arabic              Include the Arabic text');
  line('    --width <n>           Panel width (40–120)');
  line('    --no-color            Disable ANSI colors');
  line('');
  line(paint.bold('  INSTALL OPTIONS'));
  line('    --all                 Every supported tool');
  line('    --scope user|project  Where to write configuration');
  line('    --force               Re-copy the runtime and rewrite hooks');
  line('');
  line(paint.bold('  TOOLS'));
  line('    ' + registry.ids().join(', '));
  line('');
  line(paint.dim('  Docs: https://github.com/Sadat-Rakib/quran-reminder'));
  line('');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--version') || argv.includes('-v')) {
    line(pkg.version);
    return;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    help();
    return;
  }

  const command = argv[0];
  const flags = parseFlags(argv);

  try {
    switch (command) {
      case undefined:
        commandShow(flags);
        break;
      case 'show':
      case 'ayah':
        commandShow(flags);
        break;
      case 'hook':
        await require('../src/hook').main(argv.slice(1));
        break;
      case 'install':
        await commandInstall(flags);
        break;
      case 'uninstall':
      case 'remove':
        await commandUninstall(flags);
        break;
      case 'list':
      case 'ls':
        commandList();
        break;
      case 'doctor':
      case 'status':
      case 'verify':
        commandDoctor();
        break;
      case 'config':
        commandConfig(flags);
        break;
      case 'themes':
        commandThemes();
        break;
      case 'refresh':
        commandRefresh(flags);
        break;
      case 'run':
        // Everything after `run` belongs to the child process, including flags.
        commandRun({ _: ['run', ...argv.slice(1)] });
        break;
      case 'mcp':
        commandMcp();
        break;
      case 'help':
        help();
        break;
      default:
        line(paint.red(`Unknown command: ${command}`));
        help();
        process.exitCode = 1;
    }
  } catch (error) {
    line(paint.red(`Error: ${error.message}`));
    if (process.env.QURAN_REMINDER_DEBUG) line(error.stack);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, parseFlags, resolveSelection };
