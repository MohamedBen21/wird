import { describe, expect, it } from 'vitest';
import { normalizeArabic } from '../src/core/text';
import { makeRepo } from './helpers';

describe('ContentRepository', () => {
  const repo = makeRepo();

  it('has the complete Quran', async () => {
    const chapters = await repo.chapters();
    expect(chapters).toHaveLength(114);
    expect(chapters.reduce((n, c) => n + c.count, 0)).toBe(6236);
  });

  it('returns Ayat al-Kursi in all three languages', async () => {
    const v = await repo.getVerse(2, 255, ['ar', 'en', 'fr']);
    expect(normalizeArabic(v!.texts.ar!)).toContain('الله لا اله الا هو');
    expect(v?.texts.en).toMatch(/Allah/);
    expect(v?.texts.fr).toMatch(/Allah/);
    expect(await repo.getVerse(2, 287, ['ar'])).toBeNull();
  });

  it('only returns requested languages', async () => {
    const v = await repo.getVerse(1, 2, ['ar']);
    expect(Object.keys(v!.texts)).toEqual(['ar']);
  });

  it('builds a chapter view', async () => {
    const c = await repo.getChapter(112, ['ar', 'en']);
    expect(c?.verses).toHaveLength(4);
    expect(c?.verses[0].texts.en).toBeTruthy();
  });

  it('builds pools and resolves items', async () => {
    const quran = await repo.quranPool();
    expect(quran.length).toBeGreaterThan(3000);
    const hadith = await repo.hadithPool(['nawawi']);
    expect(hadith).toHaveLength(42);
    const q = await repo.getItem(quran[0], ['ar', 'en']);
    expect(q?.kind).toBe('quran');
    expect(q?.title.en).toMatch(/^Surah /);
    const h = await repo.getItem(hadith[0], ['ar', 'en', 'fr']);
    expect(h?.kind).toBe('hadith');
    expect(h?.texts.fr).toBeTruthy();
    expect(h?.title.ar).toContain('رقم');
    expect(await repo.getItem('x:1', ['ar'])).toBeNull();
    expect(await repo.getItem('h:nawawi:9999', ['ar'])).toBeNull();
  });

  it('searches Arabic ignoring diacritics', async () => {
    const r = await repo.search('الحمد لله رب العالمين', ['ar', 'en']);
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.some((h) => h.surah === 1 && h.ayah === 2)).toBe(true);
    // Standard spelling finds Uthmani text (superscript alef, silent waw):
    expect((await repo.search('السماوات', ['ar'])).hits.length).toBeGreaterThan(10);
    expect((await repo.search('الصلاة', ['ar'])).hits.length).toBeGreaterThan(10);
    const r2 = await repo.search('الحمد لله رب', ['ar']);
    expect(r2.hits.some((h) => h.surah === 1 && h.ayah === 2)).toBe(true);
  });

  it('searches translations in English and French', async () => {
    const en = await repo.search('patient', ['ar', 'en']);
    expect(en.hits.length).toBeGreaterThan(5);
    expect(en.hits[0].texts.en).toBeTruthy();
    const fr = await repo.search('miséricordieux', ['ar', 'fr']);
    expect(fr.hits.length).toBeGreaterThan(5);
    expect((await repo.search('x', ['en'])).hits).toEqual([]);
    expect((await repo.search('qqzzxxkk', ['en'])).hits).toEqual([]);
  });
});
