import type {
  ChapterMeta,
  ChapterView,
  CollectionMeta,
  HadithRecord,
  Lang,
  ReminderItem,
  SearchHit,
  SearchResult,
  Texts,
  VerseView,
} from './types';
import { hasArabic, searchKey, wordCount } from './text';

/** Loads a JSON data file by path (e.g. "/data/quran-en.json"). Injected so the core stays browser-free. */
export type JsonLoader = (path: string) => Promise<unknown>;

const QURAN_FILES: Record<Lang, string> = {
  ar: '/data/quran-ar.json',
  en: '/data/quran-en.json',
  fr: '/data/quran-fr.json',
};

/** Shortest Arabic verse (in words) that is used for random reminders. Avoids fragments like "الم". */
export const MIN_REMINDER_WORDS = 6;

interface SearchIndex {
  /** Normalized text per verse, flattened across surahs. */
  norm: string[];
  /** Cumulative verse count before each surah (index = surah - 1). */
  offsets: number[];
}

export class ContentRepository {
  private cache = new Map<string, Promise<unknown>>();
  private indexes = new Map<Lang, Promise<SearchIndex>>();
  private pools = new Map<string, string[]>();

  constructor(private readonly load: JsonLoader) {}

  private get<T>(path: string): Promise<T> {
    let p = this.cache.get(path);
    if (!p) {
      p = this.load(path).catch((err) => {
        this.cache.delete(path); // allow a retry after a failure
        throw err;
      });
      this.cache.set(path, p);
    }
    return p as Promise<T>;
  }

  chapters(): Promise<ChapterMeta[]> {
    return this.get<ChapterMeta[]>('/data/quran-meta.json');
  }

  collections(): Promise<CollectionMeta[]> {
    return this.get<CollectionMeta[]>('/data/hadith-collections.json');
  }

  private quran(lang: Lang): Promise<string[][]> {
    return this.get<string[][]>(QURAN_FILES[lang]);
  }

  private hadith(): Promise<HadithRecord[]> {
    return this.get<HadithRecord[]>('/data/hadith.json');
  }

  private async texts<T>(langs: Lang[], pick: (lang: Lang, data: string[][]) => T | undefined): Promise<Partial<Record<Lang, T>>> {
    const entries = await Promise.all(
      langs.map(async (l) => [l, pick(l, await this.quran(l))] as const),
    );
    const out: Partial<Record<Lang, T>> = {};
    for (const [l, v] of entries) if (v !== undefined) out[l] = v;
    return out;
  }

  async getChapter(surah: number, langs: Lang[]): Promise<ChapterView | null> {
    const chapters = await this.chapters();
    const meta = chapters[surah - 1];
    if (!meta) return null;
    const byLang = await this.texts(langs, (_l, d) => d[surah - 1]);
    const verses: VerseView[] = [];
    for (let i = 0; i < meta.count; i++) {
      const texts: Texts = {};
      for (const l of langs) {
        const t = byLang[l]?.[i];
        if (t !== undefined) texts[l] = t;
      }
      verses.push({ surah, ayah: i + 1, texts });
    }
    return { meta, verses };
  }

  async getVerse(surah: number, ayah: number, langs: Lang[]): Promise<VerseView | null> {
    const chapters = await this.chapters();
    const meta = chapters[surah - 1];
    if (!meta || ayah < 1 || ayah > meta.count) return null;
    const byLang = await this.texts(langs, (_l, d) => d[surah - 1]?.[ayah - 1]);
    return { surah, ayah, texts: byLang };
  }

  /** IDs ("q:s:a") of verses that make good standalone reminders. */
  async quranPool(): Promise<string[]> {
    const cached = this.pools.get('quran');
    if (cached) return cached;
    const ar = await this.quran('ar');
    const ids: string[] = [];
    ar.forEach((verses, s) =>
      verses.forEach((text, a) => {
        if (wordCount(text) >= MIN_REMINDER_WORDS) ids.push(`q:${s + 1}:${a + 1}`);
      }),
    );
    this.pools.set('quran', ids);
    return ids;
  }

  /** IDs ("h:collection:n") of bundled hadith in the given collections. */
  async hadithPool(collections: string[]): Promise<string[]> {
    const key = `hadith:${[...collections].sort().join(',')}`;
    const cached = this.pools.get(key);
    if (cached) return cached;
    const all = await this.hadith();
    const allowed = new Set(collections);
    const ids = all.filter((h) => allowed.has(h.c)).map((h) => `h:${h.c}:${h.n}`);
    this.pools.set(key, ids);
    return ids;
  }

  private quranTitle(meta: ChapterMeta, ayah: number): Texts {
    return {
      ar: `سورة ${meta.ar} · ${meta.n}:${ayah}`,
      en: `Surah ${meta.tr} · ${meta.n}:${ayah}`,
      fr: `Sourate ${meta.tr} · ${meta.n}:${ayah}`,
    };
  }

  async getItem(id: string, langs: Lang[]): Promise<ReminderItem | null> {
    const parts = id.split(':');
    if (parts[0] === 'q' && parts.length === 3) {
      const surah = Number(parts[1]);
      const ayah = Number(parts[2]);
      const [verse, chapters] = await Promise.all([this.getVerse(surah, ayah, langs), this.chapters()]);
      if (!verse) return null;
      const titles = this.quranTitle(chapters[surah - 1], ayah);
      const title: Texts = {};
      for (const l of langs) title[l] = titles[l];
      return { id, kind: 'quran', texts: verse.texts, title, surah, ayah };
    }
    if (parts[0] === 'h' && parts.length === 3) {
      const [all, collections] = await Promise.all([this.hadith(), this.collections()]);
      const n = Number(parts[2]);
      const rec = all.find((h) => h.c === parts[1] && h.n === n);
      if (!rec) return null;
      const col = collections.find((c) => c.id === rec.c);
      const texts: Texts = {};
      const title: Texts = {};
      for (const l of langs) {
        texts[l] = rec[l];
        const name = col?.[l] ?? rec.c;
        title[l] = l === 'ar' ? `${name} · رقم ${rec.n}` : l === 'fr' ? `${name} · n° ${rec.n}` : `${name} · #${rec.n}`;
      }
      return { id, kind: 'hadith', texts, title };
    }
    return null;
  }

  private async index(lang: Lang): Promise<SearchIndex> {
    let p = this.indexes.get(lang);
    if (!p) {
      p = (async () => {
        const data = await this.quran(lang);
        const norm: string[] = [];
        const offsets: number[] = [];
        for (let s = 0; s < data.length; s++) {
          offsets.push(norm.length);
          for (const v of data[s]) norm.push(searchKey(lang, v));
        }
        return { norm, offsets };
      })();
      this.indexes.set(lang, p);
    }
    return p;
  }

  /**
   * Full-text search over the Quran. Arabic queries search the Arabic text (ignoring diacritics);
   * other queries search the selected translations (English and/or French, English by default).
   * Every word of the query must appear in the verse.
   */
  async search(query: string, langs: Lang[], limit = 40): Promise<SearchResult> {
    const q = query.trim();
    if (q.length < 2) return { hits: [], truncated: false };

    const searchLangs: Lang[] = hasArabic(q)
      ? ['ar']
      : (langs.filter((l) => l !== 'ar') as Lang[]).length
        ? (langs.filter((l) => l !== 'ar') as Lang[])
        : ['en'];

    const scores = new Map<number, number>(); // flat verse index -> best score

    for (const lang of searchLangs) {
      const nq = searchKey(lang, q);
      const tokens = nq.split(' ').filter(Boolean);
      if (!tokens.length) continue;
      const { norm } = await this.index(lang);
      for (let i = 0; i < norm.length; i++) {
        const text = norm[i];
        let ok = true;
        let score = 0;
        for (const t of tokens) {
          const at = text.indexOf(t);
          if (at < 0) {
            ok = false;
            break;
          }
          // Whole-word matches rank above partial ones.
          const before = at === 0 || text[at - 1] === ' ';
          const after = at + t.length === text.length || text[at + t.length] === ' ';
          score += before && after ? 3 : before ? 2 : 1;
        }
        if (!ok) continue;
        if (tokens.length > 1 && text.includes(nq)) score += 10;
        scores.set(i, Math.max(scores.get(i) ?? 0, score));
      }
    }

    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const top = ranked.slice(0, limit);
    const { offsets } = await this.index(searchLangs[0]);

    const hits: SearchHit[] = [];
    for (const [flat, score] of top) {
      let s = offsets.length - 1;
      while (s > 0 && offsets[s] > flat) s--;
      const ayah = flat - offsets[s] + 1;
      const verse = await this.getVerse(s + 1, ayah, langs.length ? langs : searchLangs);
      if (verse) hits.push({ ...verse, score });
    }
    return { hits, truncated: ranked.length > limit };
  }
}
