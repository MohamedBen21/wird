import type { ChapterMeta } from './types';
import { normalizeArabic, normalizeLatin, toAsciiDigits, hasArabic } from './text';

export interface Reference {
  surah: number;
  from?: number;
  to?: number;
}

/**
 * Parses "2:255", "2 255", "2:255-257", "36" or Arabic-Indic digits (٢:٢٥٥).
 * Returns null if the text is not a reference, or points outside the Quran.
 */
export function parseReference(input: string, chapters: ChapterMeta[]): Reference | null {
  const q = toAsciiDigits(input).trim();
  const m = /^(\d{1,3})(?:\s*[:.\s]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?$/.exec(q);
  if (!m) return null;
  const surah = Number(m[1]);
  const meta = chapters[surah - 1];
  if (!meta) return null;
  if (m[2] === undefined) return { surah };
  const from = Number(m[2]);
  const to = m[3] === undefined ? undefined : Number(m[3]);
  if (from < 1 || from > meta.count) return null;
  if (to !== undefined && (to < from || to > meta.count)) return null;
  return { surah, from, to };
}

/** Finds surahs whose name (Arabic, transliterated, English or French) contains the query. */
export function findChapters(query: string, chapters: ChapterMeta[]): ChapterMeta[] {
  const raw = query.trim();
  if (!raw) return chapters;
  if (hasArabic(raw)) {
    const q = normalizeArabic(raw);
    return chapters.filter((c) => normalizeArabic(c.ar).includes(q));
  }
  const q = normalizeLatin(raw).replace(/\s+/g, '');
  if (!q) return chapters;
  const flat = (s: string) => normalizeLatin(s).replace(/\s+/g, '');
  return chapters.filter((c) => [c.tr, c.en, c.fr].some((name) => flat(name).includes(q)));
}
