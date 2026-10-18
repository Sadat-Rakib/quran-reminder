# Contributing

Thanks for helping. This project is intentionally small and dependency-free — please keep it
that way.

## Ground rules

1. **Never destroy user configuration.** Every adapter must merge into existing files, keep
   everything it does not own, and be able to uninstall cleanly. If a file cannot be parsed,
   refuse to touch it and report the problem.
2. **Never break a session.** The hook must exit `0` and print valid output for its host, even
   when the data file is missing or stdin is garbage.
3. **No dependencies.** Node built-ins only. No build step.
4. **No telemetry.** No analytics, no pings, no network calls at runtime.
5. **Be honest about support.** If an integration is untested in the real app, say so in the
   README table and in your pull request.

## Getting started

```bash
git clone https://github.com/Sadat-Rakib/quran-reminder
cd quran-reminder
node --version        # must be >= 18.17
npm test              # no install needed
node bin/quran.js show --no-color
```

Useful commands:

```bash
node --test                          # full suite
node --test tests/adapters.test.js   # one file
node bin/quran.js doctor             # inspect a real installation
QURAN_REMINDER_DEBUG=1 node bin/quran.js hook --host claude-code < payload.json
```

To experiment without touching your real configuration:

```bash
export QURAN_REMINDER_HOME=/tmp/qr-home
export QURAN_REMINDER_USER_HOME=/tmp/qr-user
export QURAN_REMINDER_PROJECT=/tmp/qr-project
mkdir -p "$QURAN_REMINDER_PROJECT"
node bin/quran.js install --all
```

## Adding a new tool adapter

Adapters live in `src/adapters/` and are plain objects.

```js
'use strict';

const fsutil = require('../core/fsutil');
const { hookCommand, scopeFile, result, note } = require('./util');

module.exports = {
  id: 'my-tool',
  name: 'My Tool',
  kind: 'hook',                 // hook | plugin | rules | instructions | config
  defaultScope: 'user',         // user | project
  scopes: ['user', 'project'],
  docs: 'https://…',            // vendor documentation for the integration
  capability: 'One line describing what the user gets.',

  file(ctx) {
    return scopeFile(ctx, ['.my-tool', 'hooks.json'], ['.my-tool', 'hooks.json']);
  },

  detect(ctx) {
    return fsutil.exists(this.file(ctx));
  },

  install(ctx) {
    // Merge, never overwrite. Use fsutil.updateJson / upsertMarkedBlock.
  },

  uninstall(ctx) {
    // Remove only entries whose command matches hookCommand(ctx, id).
  },

  verify(ctx) {
    return { installed: true, ok: true, detail: '…' };
  },
};
```

Then:

1. Add the adapter to the array in `src/adapters/index.js` and to `ALIASES`.
2. Add a test in `tests/adapters.test.js` covering install → verify → uninstall **and**
   preservation of pre-existing configuration.
3. Add a row to the README compatibility table, with an honest status.
4. If the tool has a JSON payload, add it to `tests/hook.test.js` and a case to
   `buildOutput` in `src/hook.js`.

Reference material that is worth reading before writing an adapter:

- Claude Code hooks: <https://code.claude.com/docs/en/hooks>
- Codex hooks: <https://developers.openai.com/codex/hooks>
- Cursor hooks: <https://cursor.com/docs/agent/hooks>
- Gemini CLI hooks: <https://geminicli.com/docs/hooks/>
- Windsurf hooks: <https://docs.windsurf.com/windsurf/cascade/hooks>
- Antigravity hooks: <https://antigravity.google/docs/hooks>
- OpenCode plugins: <https://opencode.ai/docs/plugins/>
- Cline hooks: <https://github.com/cline/cline/blob/main/.clinerules/hooks/README.md>
- Aider conventions: <https://aider.chat/docs/usage/conventions.html>
- VS Code instructions: <https://code.visualstudio.com/docs/copilot/customization/custom-instructions>

## Changing the dataset

See [data/SOURCES.md](data/SOURCES.md). In short: edit `data/curated.js`, run
`npm run build:data`, then `npm run verify:data` and `npm test`. Commit both `ayahs.json` and
`manifest.json`.

## Code style

- CommonJS, `'use strict'`, two-space indentation, single quotes.
- Small pure functions in `src/core/`; adapters only do I/O and merging.
- No `console.log` in library code. The CLI owns stdout; diagnostics go to stderr.
- Every filesystem write goes through `src/core/fsutil.js`.

## Pull requests

- Keep the change focused; one adapter or one fix per PR.
- Include the output of `npm test` and, for adapter work, `node bin/quran.js doctor`.
- Say which tool versions and operating systems you actually ran. "Works on my machine" is fine
  as long as you name the machine.
- Update the README table if compatibility changed.

## Reporting a broken integration

Please include:

- `quran doctor` output
- the tool and version (`claude --version`, `codex --version`, …)
- your OS and Node version
- the relevant config file with any secrets removed
- what you expected vs. what happened

## License

By contributing you agree that your work is released under the MIT license.
