import type { Lang } from './types';

// Arabic diacritics (harakat), Quranic annotation marks, superscript alef, tatweel.
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ]/g;
const ARABIC_LETTER = /[؀-ۿݐ-ݿ]/;
const ARABIC_INDIC = /[٠-٩]/g;
const EXT_ARABIC_INDIC = /[۰-۹]/g;

export function hasArabic(s: string): boolean {
  return ARABIC_LETTER.test(s);
}

/** Converts Arabic-Indic and Persian digits to ASCII digits. */
export function toAsciiDigits(s: string): string {
  return s
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXT_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Removes vowel marks and unifies letter variants so searches match regardless of diacritics. */
export function normalizeArabic(s: string): string {
  return s
    .replace(ARABIC_MARKS, '')
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercases, strips accents and punctuation (for English / French). */
export function normalizeLatin(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’`‘]/g, '')
    .replace(/[^a-z0-9ßœæ]+/g, ' ')
    .trim();
}

export function normalizeFor(lang: Lang, s: string): string {
  return lang === 'ar' ? normalizeArabic(s) : normalizeLatin(s);
}

export function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Loose key used for search only. Uthmani spelling omits many alefs and writes some words with a
 * small superscript alef (العٰلمين, السمٰوٰت, الصلوٰة) while people type the standard spelling
 * (العالمين, السماوات, الصلاة). Dropping every alef and the silent waw before a final ha makes
 * both spellings meet.
 */
export function searchKeyArabic(s: string): string {
  return normalizeArabic(s)
    .replace(/\u0627/g, '')
    .replace(/\u0648(?=\u0647(?:\s|$))/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchKey(lang: Lang, s: string): string {
  return lang === 'ar' ? searchKeyArabic(s) : normalizeLatin(s);
}
