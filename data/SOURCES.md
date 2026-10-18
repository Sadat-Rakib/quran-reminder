# Data sources

`data/ayahs.json` is generated, committed, and shipped inside the package. The runtime never
makes a network request.

## Where the text comes from

| Field | Source | Notes |
| ----- | ------ | ----- |
| `arabic` | [quran.com API v4](https://api.quran.com) — `/quran/verses/uthmani` | Uthmani script, Hafs numbering |
| `translations.yusufali` | quran.com translation id `22` | A. Yusuf Ali, 1934 — public domain |
| `translations.pickthall` | quran.com translation id `19` | M. Marmaduke Pickthall, 1930 — public domain |
| `transliteration` | [alquran.cloud](https://alquran.cloud) — `en.transliteration` | Reading aid, not a translation |
| Surah names, revelation place | quran.com — `/chapters` | English + Arabic names |

Only the references listed in `data/curated.js` are fetched, which is why the dataset is
~170 KB instead of several megabytes.

## Why these translations

Both are in the public domain, which keeps the whole repository redistributable under MIT.
Modern translations such as Saheeh International and The Clear Quran are copyrighted and are
deliberately **not** bundled. If you prefer one of them, you can point the plugin at your own
dataset with `QURAN_REMINDER_DATA=/path/to/ayahs.json`.

## Rebuilding

```bash
npm run build:data
```

This rewrites `data/ayahs.json` and `data/manifest.json` (counts + SHA-256). The build fails if
any curated reference is out of range, missing a translation, or contains a Basmala prefix that
does not belong to it.

## Verifying

```bash
npm run verify:data          # sample 12 ayahs
npm run verify:data -- --all # every ayah
```

The verifier re-fetches Arabic, both translations, transliteration and surah names, and fails on
any difference. It needs network access, so it is not part of `npm test`.

## Editing the verse pool

1. Edit `data/curated.js` — add or remove `surah:ayah` references under a theme.
2. Run `npm run build:data`.
3. Run `npm run verify:data` and `npm test`.
4. Run `quran install --force` so `~/.quran-reminder/app` picks up the new data.

Please keep each verse genuinely relevant to its theme, and prefer complete, self-contained
verses over fragments that change meaning when taken out of context.
