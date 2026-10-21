import { describe, expect, it } from 'vitest';
import { pickNext, seededRandom, shuffledIndexes, type SchedulerState } from '../src/core/scheduler';
import { isQuietNow } from '../src/core/quiet-hours';
import { DEFAULT_SETTINGS, cleanHost, isHostBlocked, sanitizeSettings } from '../src/core/settings';

const pool = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}:${i}`);

describe('scheduler', () => {
  it('never repeats until the pool is exhausted', () => {
    const quranPool = pool('q', 50);
    let state: SchedulerState = {};
    const seen = new Set<string>();
    const rng = seededRandom(42);
    for (let i = 0; i < 50; i++) {
      const r = pickNext({ mode: 'quran', quranPool, hadithPool: [], state, rng })!;
      expect(seen.has(r.id)).toBe(false);
      seen.add(r.id);
      state = r.state;
    }
    expect(seen.size).toBe(50);
    // The 51st pick starts a new round.
    const again = pickNext({ mode: 'quran', quranPool, hadithPool: [], state, rng })!;
    expect(again.state.quran!.pos).toBe(1);
  });

  it('alternates between Quran and hadith in "both" mode', () => {
    let state: SchedulerState = {};
    const kinds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = pickNext({ mode: 'both', quranPool: pool('q', 10), hadithPool: pool('h', 10), state })!;
      kinds.push(r.kind);
      state = r.state;
    }
    expect(kinds).toEqual(['quran', 'hadith', 'quran', 'hadith', 'quran', 'hadith']);
  });

  it('falls back when a pool is empty and returns null when both are', () => {
    expect(pickNext({ mode: 'hadith', quranPool: pool('q', 3), hadithPool: [], state: {} })!.kind).toBe('quran');
    expect(pickNext({ mode: 'both', quranPool: [], hadithPool: [], state: {} })).toBeNull();
  });

  it('resets the cursor when the pool changes', () => {
    const a = pickNext({ mode: 'quran', quranPool: pool('q', 10), hadithPool: [], state: {} })!;
    const b = pickNext({ mode: 'quran', quranPool: pool('q', 12), hadithPool: [], state: a.state })!;
    expect(b.state.quran!.pos).toBe(1);
  });

  it('produces a valid permutation', () => {
    const p = shuffledIndexes(100, 7);
    expect([...p].sort((x, y) => x - y)).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });
});

describe('quiet hours', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 18, h, m);
  it('handles a window that wraps midnight', () => {
    const q = { enabled: true, start: '23:00', end: '05:00' };
    expect(isQuietNow(at(23, 30), q)).toBe(true);
    expect(isQuietNow(at(2), q)).toBe(true);
    expect(isQuietNow(at(5), q)).toBe(false);
    expect(isQuietNow(at(12), q)).toBe(false);
  });
  it('handles a same-day window and disabled state', () => {
    expect(isQuietNow(at(13), { enabled: true, start: '12:00', end: '14:00' })).toBe(true);
    expect(isQuietNow(at(13), { enabled: false, start: '12:00', end: '14:00' })).toBe(false);
    expect(isQuietNow(at(13), { enabled: true, start: 'bad', end: '14:00' })).toBe(false);
  });
});

describe('settings', () => {
  it('fills defaults and clamps invalid values', () => {
    const s = sanitizeSettings({ intervalMinutes: -5, languages: ['xx'], content: 'nope', fontSize: 500 });
    expect(s.intervalMinutes).toBe(1);
    expect(s.languages).toEqual(DEFAULT_SETTINGS.languages);
    expect(s.content).toBe('both');
    expect(s.fontSize).toBe(48);
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
  it('cleans and matches hosts', () => {
    expect(cleanHost('https://www.Example.com/path')).toBe('www.example.com');
    expect(cleanHost('   ')).toBe('');
    expect(isHostBlocked('mail.example.com', ['example.com'])).toBe(true);
    expect(isHostBlocked('notexample.com', ['example.com'])).toBe(false);
  });
  it('dedupes languages', () => {
    expect(sanitizeSettings({ languages: ['en', 'en', 'fr'] }).languages).toEqual(['en', 'fr']);
  });
});
