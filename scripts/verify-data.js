'use strict';

/**
 * Re-checks the committed dataset against the upstream APIs.
 *
 *   npm run verify:data          # sample 12 random ayahs
 *   npm run verify:data -- --all # every ayah (slow, rate-limited)
 *
 * This is a network test, so it is not part of `npm test`. It is here so a
 * contributor can prove that data/ayahs.json still matches the sources.
 */

const data = require('../data/ayahs.json');

const QURAN_API = 'https://api.quran.com/api/v4';
const ALQURAN_API = 'https://api.alquran.cloud/v1';

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const SAMPLE_SIZE = 12;

function clean(value) {
  return String(value || '')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function getJson(url, attempt = 0) {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'quran-reminder-verifier' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    return getJson(url, attempt + 1);
  }
}

async function main() {
  const ayahs = data.ayahs;
  const sample = ALL
    ? ayahs
    : ayahs
        .slice()
        .sort(() => Math.random() - 0.5)
        .slice(0, SAMPLE_SIZE);

  console.log(`Verifying ${sample.length} of ${ayahs.length} ayahs against upstream sources...`);

  const chapters = (await getJson(`${QURAN_API}/chapters?language=en`)).chapters;
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const transliteration = (await getJson(`${ALQURAN_API}/quran/en.transliteration`)).data.surahs;
  const translitMap = new Map();
  for (const surah of transliteration) {
    for (const ayah of surah.ayahs) {
      translitMap.set(`${surah.number}:${ayah.numberInSurah}`, clean(ayah.text));
    }
  }

  const bySurah = new Map();
  for (const ayah of sample) {
    if (!bySurah.has(ayah.surah)) bySurah.set(ayah.surah, []);
    bySurah.get(ayah.surah).push(ayah);
  }

  const problems = [];

  for (const [surahNumber, group] of bySurah) {
    const verses = (await getJson(`${QURAN_API}/quran/verses/uthmani?chapter_number=${surahNumber}`))
      .verses;
    const verseMap = new Map(verses.map((verse) => [verse.verse_key, clean(verse.text_uthmani)]));

    const translations = {};
    for (const [key, id] of [
      ['yusufali', 22],
      ['pickthall', 19],
    ]) {
      const payload = await getJson(
        `${QURAN_API}/quran/translations/${id}?chapter_number=${surahNumber}`
      );
      const map = new Map();
      payload.translations.forEach((item, index) => {
        const verseKey = item.verse_key || `${surahNumber}:${index + 1}`;
        map.set(verseKey, clean(item.text));
      });
      translations[key] = map;
    }

    for (const ayah of group) {
      const chapter = chapterById.get(ayah.surah);
      if (!chapter) {
        problems.push(`${ayah.ref}: surah missing upstream`);
        continue;
      }
      if (ayah.ayah > chapter.verses_count) {
        problems.push(`${ayah.ref}: ayah beyond surah length ${chapter.verses_count}`);
      }
      if (verseMap.get(ayah.ref) !== clean(ayah.arabic)) {
        problems.push(`${ayah.ref}: Arabic text differs`);
      }
      for (const key of ['yusufali', 'pickthall']) {
        if (translations[key].get(ayah.ref) !== clean(ayah.translations[key])) {
          problems.push(`${ayah.ref}: ${key} translation differs`);
        }
      }
      if (translitMap.get(ayah.ref) !== clean(ayah.transliteration)) {
        problems.push(`${ayah.ref}: transliteration differs`);
      }
      if (ayah.surahName !== chapter.name_simple) {
        problems.push(`${ayah.ref}: surah name "${ayah.surahName}" != "${chapter.name_simple}"`);
      }
    }
    process.stdout.write(`  checked surah ${surahNumber}\r`);
  }

  process.stdout.write('\n');
  if (problems.length) {
    console.error(`\n${problems.length} problem(s) found:`);
    for (const problem of problems) console.error('  - ' + problem);
    process.exit(1);
  }
  console.log(`All ${sample.length} ayahs match their sources.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
