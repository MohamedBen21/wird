#!/usr/bin/env node
/**
 * Generates the bundled, compact data files in public/data/.
 *
 *  - Quran (Arabic Uthmani + English + French) comes from the `quran-json` npm package (CC-BY-4.0).
 *  - Hadith comes from fawazahmed0/hadith-api (public domain). Raw files are cached in .cache/hadith/
 *    and downloaded from GitHub when missing.
 *
 * Usage: npm run data
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'data');
const cacheDir = join(root, '.cache', 'hadith');
mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const HADITH_BASE = 'https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions';

// ---------------------------------------------------------------- Quran
const qDist = join(root, 'node_modules', 'quran-json', 'dist', 'chapters');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const meta = [];
const ar = [];
const en = [];
const fr = [];
let total = 0;

for (let n = 1; n <= 114; n++) {
  const a = readJson(join(qDist, `${n}.json`));
  const e = readJson(join(qDist, 'en', `${n}.json`));
  const f = readJson(join(qDist, 'fr', `${n}.json`));
  if (a.verses.length !== a.total_verses || e.verses.length !== a.total_verses || f.verses.length !== a.total_verses) {
    throw new Error(`Verse count mismatch in surah ${n}`);
  }
  a.verses.forEach((v, i) => {
    if (v.id !== i + 1 || e.verses[i].id !== v.id || f.verses[i].id !== v.id) {
      throw new Error(`Verse numbering mismatch at ${n}:${i + 1}`);
    }
    if (!v.text || !e.verses[i].translation || !f.verses[i].translation) {
      throw new Error(`Empty text at ${n}:${v.id}`);
    }
  });
  total += a.total_verses;
  meta.push({
    n,
    ar: a.name,
    tr: a.transliteration,
    en: e.translation,
    fr: f.translation,
    type: a.type,
    count: a.total_verses,
  });
  ar.push(a.verses.map((v) => v.text));
  en.push(e.verses.map((v) => v.translation));
  fr.push(f.verses.map((v) => v.translation));
}
if (total !== 6236) throw new Error(`Expected 6236 verses, got ${total}`);

const write = (name, data) => {
  const p = join(outDir, name);
  writeFileSync(p, JSON.stringify(data));
  console.log(`wrote ${name} (${(Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(0)} KB)`);
};
write('quran-meta.json', meta);
write('quran-ar.json', ar);
write('quran-en.json', en);
write('quran-fr.json', fr);

// ---------------------------------------------------------------- Hadith
async function loadEdition(name) {
  const p = join(cacheDir, `${name}.json`);
  if (!existsSync(p)) {
    console.log(`downloading ${name} ...`);
    const res = await fetch(`${HADITH_BASE}/${name}.json`);
    if (!res.ok) throw new Error(`Failed to download ${name}: ${res.status}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  return readJson(p);
}

const COLLECTIONS = [
  // [id, mode, target count]  mode: 'all' keeps everything, 'sample' picks short hadith evenly
  ['nawawi', 'all'],
  ['qudsi', 'all'],
  ['bukhari', 'sample', 600],
  ['muslim', 'sample', 600],
];

const clean = (s) => s.replace(/\s+/g, ' ').trim();

// Reminders pop up while people browse (at work, in public). Keep the sampled hadith edifying and
// general-audience: skip purity/fiqh-detail narrations and prefer spiritual / ethical themes.
const EXCLUDE = /(semen|menses|menstrua|intercourse|sexual|genital|private part|urine|urinat|feces|defecat|excrement|wet dream|janaba|impure|najas|naked|nakedness|bath|slave girl|captive|spoils|booty|adulter|fornicat|stoning|flog|lash|retaliation|blood money|idol|killed|killing|thief|cut off|dajjal|verse was revealed|was revealed|this hadith|transmitted|with this addition|similar|same chain|chain of|differ|wording|rest of the|up to the|words are|apostat|polytheist|hypocrite)/i;
const THEMES = /(Allah|Paradise|Hell|faith|believer|Muslim|mercy|merciful|charity|alms|prayer|fast|sin|forgiv|kind|neighbo|truth|honest|patien|repent|reward|good deed|deeds|intention|knowledge|parent|mother|father|brother|smile|modest|generous|humble|gratitude|grateful|remembrance|supplicat|dua|Quran|Qur'an)/i;
const hadith = [];
const counts = {};

for (const [id, mode, target] of COLLECTIONS) {
  const [a, e, f] = await Promise.all(['ara', 'eng', 'fra'].map((l) => loadEdition(`${l}-${id}`)));
  const idx = (d) => new Map(d.hadiths.map((h) => [h.hadithnumber, h]));
  const A = idx(a);
  const E = idx(e);
  const F = idx(f);

  let candidates = [];
  for (const [num, ha] of A) {
    const he = E.get(num);
    const hf = F.get(num);
    if (!he || !hf) continue;
    const t = { ar: clean(ha.text), en: clean(he.text), fr: clean(hf.text) };
    if (!t.ar || !t.en || !t.fr) continue;
    if (mode === 'sample') {
      // Short, self-contained hadith are better reminders.
      // Arabic first: skip hadith that open with a long chain of narrators (heavy to read in a popup).
      if (t.ar.length > 340 || t.en.length > 420 || t.en.length < 60 || t.fr.length > 520) continue;
      if (EXCLUDE.test(t.en) || !THEMES.test(t.en)) continue;
      // Must contain a direct saying of the Prophet in quotes to stand alone as a reminder.
      if ((id === 'bukhari' && !/["“]/.test(t.en)) || !/\(ﷺ\)/.test(t.en) || !/(said|saying|says|told)/i.test(t.en)) continue;
    }
    candidates.push({ num, ...t, grades: ha.grades ?? [] });
  }
  candidates.sort((x, y) => x.num - y.num);

  let picked = candidates;
  if (mode === 'sample' && candidates.length > target) {
    const step = candidates.length / target;
    picked = Array.from({ length: target }, (_, i) => candidates[Math.floor(i * step)]);
  }

  for (const c of picked) {
    hadith.push({ c: id, n: c.num, ar: c.ar, en: c.en, fr: c.fr });
  }
  counts[id] = picked.length;
  console.log(`${id}: ${picked.length} hadith (from ${candidates.length} eligible)`);
}
write('hadith.json', hadith);

const COLLECTION_NAMES = {
  nawawi: { ar: 'الأربعون النووية', en: 'Forty Hadith of an-Nawawi', fr: 'Les Quarante Hadiths de an-Nawawi' },
  qudsi: { ar: 'الأحاديث القدسية', en: 'Forty Hadith Qudsi', fr: 'Les Hadiths Qudsi' },
  bukhari: { ar: 'صحيح البخاري', en: 'Sahih al-Bukhari', fr: 'Sahih al-Boukhari' },
  muslim: { ar: 'صحيح مسلم', en: 'Sahih Muslim', fr: 'Sahih Mouslim' },
};
write('hadith-collections.json', Object.entries(COLLECTION_NAMES).map(([id, names]) => ({ id, ...names, count: counts[id] })));

// ---------------------------------------------------------------- Font
const fontSrc = join(root, 'node_modules', '@fontsource', 'amiri-quran', 'files', 'amiri-quran-arabic-400-normal.woff2');
if (existsSync(fontSrc)) {
  mkdirSync(join(root, 'public', 'fonts'), { recursive: true });
  copyFileSync(fontSrc, join(root, 'public', 'fonts', 'amiri-quran-arabic.woff2'));
  console.log('copied Amiri Quran font (OFL)');
}

// ---------------------------------------------------------------- Attribution
write('sources.json', {
  quran: {
    arabic: 'Uthmani text from the Noble Quran Encyclopedia (quranenc.com), via quran-json (CC-BY-4.0)',
    english: 'English translation via quran-json (CC-BY-4.0)',
    french: 'French translation via quran-json (CC-BY-4.0)',
    package: 'https://github.com/risan/quran-json',
  },
  hadith: {
    source: 'https://github.com/fawazahmed0/hadith-api (Unlicense / public domain)',
    note: 'A curated subset is bundled. Hadith numbers follow the hadith-api numbering.',
  },
  font: 'Amiri Quran (SIL Open Font License 1.1)',
});
console.log('done');
