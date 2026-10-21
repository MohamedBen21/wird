export type Lang = 'ar' | 'en' | 'fr';
export const LANGS: readonly Lang[] = ['ar', 'en', 'fr'];

export type ContentKind = 'quran' | 'hadith';

/** Text per language. Only the requested languages are present. */
export type Texts = Partial<Record<Lang, string>>;

export interface ChapterMeta {
  n: number;
  ar: string;
  /** Transliterated name, e.g. "Al-Baqarah". */
  tr: string;
  en: string;
  fr: string;
  type: 'meccan' | 'medinan';
  count: number;
}

export interface HadithRecord {
  /** Collection id, e.g. "bukhari". */
  c: string;
  /** Hadith number (hadith-api numbering). */
  n: number;
  ar: string;
  en: string;
  fr: string;
}

export interface CollectionMeta {
  id: string;
  ar: string;
  en: string;
  fr: string;
  count: number;
}

export interface VerseView {
  surah: number;
  ayah: number;
  texts: Texts;
}

export interface ChapterView {
  meta: ChapterMeta;
  verses: VerseView[];
}

/** Something that can be shown as a reminder. */
export interface ReminderItem {
  /** "q:2:255" or "h:bukhari:11". */
  id: string;
  kind: ContentKind;
  texts: Texts;
  /** Reference line per language (surah name + number, or collection + number). */
  title: Texts;
  surah?: number;
  ayah?: number;
}

export interface SearchHit extends VerseView {
  score: number;
}

export interface SearchResult {
  hits: SearchHit[];
  /** True if more matches exist than were returned. */
  truncated: boolean;
}
