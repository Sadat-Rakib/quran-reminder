'use strict';

/**
 * Builds data/ayahs.json from verified Quran APIs.
 *
 *   npm run build:data
 *
 * Sources
 *   Arabic (Uthmani)  : api.quran.com  /api/v4/quran/verses/uthmani
 *   Translations      : api.quran.com  /api/v4/quran/translations/{22 Yusuf Ali, 19 Pickthall}
 *   Transliteration   : api.alquran.cloud /v1/quran/en.transliteration
 *   Surah metadata    : api.quran.com  /api/v4/chapters
 *
 * Only the curated references in data/curated.js are fetched, so the committed
 * dataset stays small (a few hundred KB) and the plugin stays fast.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CURATED = require('../data/curated.js');
const OUT_DIR = path.join(__dirname, '..', 'data');

const QURAN_API = 'https://api.quran.com/api/v4';
const ALQURAN_API = 'https://api.alquran.cloud/v1';
const TRANSLATION_IDS = { yusufali: 22, pickthall: 19 };

const THEMES = ['ilm', 'tawakkul', 'shukr', 'ihsan', 'sabr'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url, { retries = 4, timeout = 30000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'quran-reminder-data-builder' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(400 * Math.pow(2, attempt));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError && lastError.message}`);
}

/** Strip footnotes/HTML from translation text and normalise whitespace. */
function cleanText(value) {
  return String(value || '')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRef(ref) {
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(String(ref).trim());
  if (!match) throw new Error(`Invalid ayah reference: ${ref}`);
  return { surah: Number(match[1]), ayah: Number(match[2]) };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  // 1. Flatten the curated list into unique refs with their themes.
  const byRef = new Map();
  for (const theme of THEMES) {
    const refs = CURATED[theme] || [];
    if (!refs.length) throw new Error(`Theme "${theme}" has no ayahs`);
    for (const ref of refs) {
      const { surah, ayah } = parseRef(ref);
      const key = `${surah}:${ayah}`;
      if (!byRef.has(key)) byRef.set(key, { surah, ayah, themes: [] });
      const entry = byRef.get(key);
      if (!entry.themes.includes(theme)) entry.themes.push(theme);
    }
  }
  const refs = Array.from(byRef.values()).sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  console.log(`Curated: ${refs.length} unique ayahs across ${THEMES.length} themes`);

  // 2. Surah metadata.
  const chaptersResponse = await getJson(`${QURAN_API}/chapters?language=en`);
  const chapters = new Map();
  for (const chapter of chaptersResponse.chapters) {
    chapters.set(chapter.id, chapter);
  }

  // 3. Per-surah verse + translation fetches.
  const surahNumbers = [...new Set(refs.map((r) => r.surah))];
  const verseText = new Map();
  const translationText = { yusufali: new Map(), pickthall: new Map() };

  await mapLimit(surahNumbers, 4, async (surahNumber) => {
    const [verses, ...translations] = await Promise.all([
      getJson(`${QURAN_API}/quran/verses/uthmani?chapter_number=${surahNumber}`),
      ...Object.values(TRANSLATION_IDS).map((id) =>
        getJson(`${QURAN_API}/quran/translations/${id}?chapter_number=${surahNumber}`)
      ),
    ]);
    for (const verse of verses.verses || []) {
      verseText.set(verse.verse_key, verse.text_uthmani);
    }
    Object.keys(TRANSLATION_IDS).forEach((key, index) => {
      const items = translations[index].translations || [];
      items.forEach((item, itemIndex) => {
        // The v4 translations endpoint omits verse_key; results are ordered
        // by ayah number within the chapter.
        let verseKey = item.verse_key;
        if (!verseKey) verseKey = `${surahNumber}:${itemIndex + 1}`;
        const match = /^(\d+):(\d+)$/.exec(String(verseKey));
        if (!match) return;
        translationText[key].set(`${Number(match[1])}:${Number(match[2])}`, cleanText(item.text));
      });
    });
    process.stdout.write(`  fetched surah ${surahNumber}\r`);
  });
  process.stdout.write('\n');

  // 4. Transliteration: one request for the whole Quran.
  const transliterationResponse = await getJson(`${ALQURAN_API}/quran/en.transliteration`, {
    timeout: 60000,
  });
  const transliteration = new Map();
  for (const surah of transliterationResponse.data.surahs || []) {
    for (const ayah of surah.ayahs || []) {
      transliteration.set(`${surah.number}:${ayah.numberInSurah}`, cleanText(ayah.text));
    }
  }
  console.log(`Transliteration ayahs: ${transliteration.size}`);

  // 5. Compose and validate.
  const ayahs = [];
  const problems = [];

  for (const ref of refs) {
    const key = `${ref.surah}:${ref.ayah}`;
    const chapter = chapters.get(ref.surah);
    if (!chapter) {
      problems.push(`${key}: unknown surah`);
      continue;
    }
    if (ref.ayah < 1 || ref.ayah > chapter.verses_count) {
      problems.push(`${key}: ayah out of range (surah has ${chapter.verses_count})`);
      continue;
    }

    const arabic = cleanText(verseText.get(key));
    const translit = transliteration.get(key);
    const yusufali = translationText.yusufali.get(key);
    const pickthall = translationText.pickthall.get(key);

    const missing = [];
    if (!arabic) missing.push('Arabic');
    if (!translit) missing.push('transliteration');
    if (!yusufali) missing.push('Yusuf Ali translation');
    if (!pickthall) missing.push('Pickthall translation');
    if (missing.length) {
      problems.push(`${key}: missing ${missing.join(', ')}`);
      continue;
    }

    // Guard against the Basmala leaking into the first ayah of a surah.
    if (ref.ayah === 1 && ref.surah !== 1 && arabic.includes('بِسْمِ ٱللَّهِ')) {
      problems.push(`${key}: Basmala prefix detected`);
      continue;
    }

    ayahs.push({
      ref: key,
      surah: ref.surah,
      ayah: ref.ayah,
      themes: ref.themes,
      surahName: chapter.name_simple,
      surahNameArabic: chapter.name_arabic,
      surahMeaning: chapter.translated_name && chapter.translated_name.name,
      revelation: chapter.revelation_place,
      arabic,
      transliteration: translit,
      translations: { yusufali, pickthall },
      url: `https://quran.com/${ref.surah}/${ref.ayah}`,
    });
  }

  if (problems.length) {
    console.error('\nData problems:');
    for (const problem of problems) console.error('  - ' + problem);
    process.exitCode = 1;
    if (ayahs.length === 0) return;
  }

  const themesCount = {};
  for (const theme of THEMES) {
    themesCount[theme] = ayahs.filter((a) => a.themes.includes(theme)).length;
  }

  const payload = {
    meta: {
      version: 1,
      generatedAt: new Date().toISOString(),
      ayahCount: ayahs.length,
      themes: THEMES,
      themeCounts: themesCount,
      defaultTranslation: 'yusufali',
      translations: {
        yusufali: 'A. Yusuf Ali (public domain)',
        pickthall: 'M. Marmaduke Pickthall (public domain)',
      },
      sources: [
        'Arabic (Uthmani): api.quran.com',
        'Translations: api.quran.com (A. Yusuf Ali, M. Pickthall)',
        'Transliteration: api.alquran.cloud (en.transliteration)',
      ],
    },
    ayahs,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(payload, null, 2) + '\n';
  fs.writeFileSync(path.join(OUT_DIR, 'ayahs.json'), json, 'utf8');

  const hash = crypto.createHash('sha256').update(json).digest('hex');
  const manifest = {
    version: 1,
    generatedAt: payload.meta.generatedAt,
    ayahCount: ayahs.length,
    themeCounts: themesCount,
    sha256: hash,
    bytes: Buffer.byteLength(json),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`\nWrote ${ayahs.length} ayahs (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`);
  console.log('Theme counts:', themesCount);
  console.log('sha256:', hash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
