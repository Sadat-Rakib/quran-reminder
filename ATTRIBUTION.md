# Attribution

## Inspiration

This project was inspired by [claude-code-quran](https://github.com/AhsanAyaz/claude-code-quran)
by **Ahsan Ayaz**.

The original project beautifully brings Quranic reminders into Claude Code. However, many
developers use other AI coding assistants, free tools, and IDEs.

I wanted to take that idea further and make it accessible to developers across different
coding environments.

Regardless of which coding assistant you use, I hope this project brings a meaningful
reminder into your development workflow.

## What was carried over

The following ideas come directly from the original project, with thanks:

- The five themes: `ilm`, `tawakkul`, `shukr`, `ihsan`, `sabr`
- Selecting a theme from the local time of day (04–09 `ilm`, 09–17 `tawakkul`, otherwise `shukr`)
- Showing a framed panel with transliteration, translation, surah reference and a quran.com link
- Showing the reminder once at session start and then staying out of the way
- Tracking displayed verses per session to avoid repetition

## What is new in this project

- A host-agnostic hook protocol with 12 adapters (Claude Code, Codex, Cursor, Gemini CLI,
  OpenCode, Windsurf, Antigravity, Cline, Roo Code, Aider, VS Code Copilot, AGENTS.md)
- A non-destructive installer that merges into existing configuration and can uninstall cleanly
- A verified dataset pipeline (`scripts/build-data.js`) plus an upstream verifier
- A zero-dependency MCP server
- An 82-test suite covering data, rendering, selection, adapters, CLI and MCP

No source files from the original repository were copied. The original project declares the
MIT license in its `package.json`; this project is also MIT licensed, and this attribution is
kept in the repository and in the README.

## Quran text and translations

- Arabic (Uthmani): [quran.com API](https://api.quran.com)
- Translations: A. Yusuf Ali (1934) and M. Marmaduke Pickthall (1930), both in the public domain,
  retrieved via the quran.com API
- Transliteration: [alquran.cloud](https://alquran.cloud) `en.transliteration`

The Quranic text itself is not subject to copyright. The bundled English translations were
chosen specifically because they are public domain. See [data/SOURCES.md](data/SOURCES.md).
