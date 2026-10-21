import { describe, expect, it } from 'vitest';
import { hasArabic, normalizeArabic, normalizeLatin, toAsciiDigits } from '../src/core/text';
import { findChapters, parseReference } from '../src/core/reference';
import { makeRepo } from './helpers';

describe('text normalization', () => {
  it('strips Arabic diacritics and unifies letter forms', () => {
    expect(normalizeArabic('ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ')).toBe('الحمد لله رب العلمين');
    expect(normalizeArabic('إِيَّاكَ')).toBe(normalizeArabic('ايّاك'));
    expect(normalizeArabic('رحمة')).toBe('رحمه');
  });

  it('normalizes Latin text', () => {
    expect(normalizeLatin("Louange à Allah, Seigneur de l'univers")).toBe('louange a allah seigneur de lunivers');
  });

  it('detects Arabic and converts digits', () => {
    expect(hasArabic('رحمة')).toBe(true);
    expect(hasArabic('mercy')).toBe(false);
    expect(toAsciiDigits('٢:٢٥٥')).toBe('2:255');
  });
});

describe('references and surah names', () => {
  it('parses references', async () => {
    const chapters = await makeRepo().chapters();
    expect(parseReference('2:255', chapters)).toEqual({ surah: 2, from: 255, to: undefined });
    expect(parseReference('2 255-257', chapters)).toEqual({ surah: 2, from: 255, to: 257 });
    expect(parseReference('٣٦', chapters)).toEqual({ surah: 36 });
    expect(parseReference('2:287', chapters)).toBeNull(); // Al-Baqarah has 286 verses
    expect(parseReference('115', chapters)).toBeNull();
    expect(parseReference('mercy', chapters)).toBeNull();
  });

  it('finds surahs by name in any language', async () => {
    const chapters = await makeRepo().chapters();
    expect(findChapters('baqarah', chapters).map((c) => c.n)).toContain(2);
    expect(findChapters('البقرة', chapters).map((c) => c.n)).toEqual([2]);
    expect(findChapters('opener', chapters).map((c) => c.n)).toEqual([1]);
  });
});
