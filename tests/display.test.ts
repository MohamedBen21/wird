import { describe, expect, it } from 'vitest';
import { displayArabic, toArabicIndic } from '../src/ui/util';
import { makeRepo } from './helpers';

describe('display helpers', () => {
  it('replaces the open fathatan the bundled font cannot draw, only for display', async () => {
    const v = await makeRepo().getVerse(2, 255, ['ar']);
    const stored = v!.texts.ar!;
    expect(stored).toContain('\u065E'); // stored text is left untouched
    expect(displayArabic(stored)).not.toContain('\u065E');
    expect(displayArabic(stored)).toContain('\u064B');
  });
  it('formats verse numbers with Arabic-Indic digits', () => {
    expect(toArabicIndic(255)).toBe('٢٥٥');
  });
});
