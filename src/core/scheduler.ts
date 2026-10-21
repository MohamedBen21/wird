import type { ContentKind } from './types';

/**
 * Picks the next item to show without repeating anything until the whole pool has been shown
 * ("shuffle bag"). State is tiny (a seed and a position), so it is cheap to persist on every tick:
 * the permutation is re-derived from the seed.
 */
export interface Cursor {
  seed: number;
  pos: number;
  /** Fingerprint of the pool. A different pool resets the cursor. */
  sig: string;
}

export interface SchedulerState {
  quran?: Cursor;
  hadith?: Cursor;
  lastKind?: ContentKind;
}

export type ContentMode = 'both' | 'quran' | 'hadith';

export interface PickInput {
  mode: ContentMode;
  quranPool: string[];
  hadithPool: string[];
  state: SchedulerState;
  /** Random source in [0, 1). Injectable for tests. */
  rng?: () => number;
}

export interface PickResult {
  id: string;
  kind: ContentKind;
  state: SchedulerState;
}

/** Small deterministic PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledIndexes(length: number, seed: number): number[] {
  const idx = Array.from({ length }, (_, i) => i);
  const rand = seededRandom(seed);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function signature(pool: string[]): string {
  return `${pool.length}:${pool[0] ?? ''}:${pool[pool.length - 1] ?? ''}`;
}

function takeFromPool(
  pool: string[],
  cursor: Cursor | undefined,
  rng: () => number,
): { id: string; cursor: Cursor } {
  const sig = signature(pool);
  let cur = cursor;
  if (!cur || cur.sig !== sig || cur.pos >= pool.length) {
    cur = { seed: Math.floor(rng() * 0x7fffffff), pos: 0, sig };
  }
  const perm = shuffledIndexes(pool.length, cur.seed);
  const id = pool[perm[cur.pos]];
  return { id, cursor: { ...cur, pos: cur.pos + 1 } };
}

export function pickNext(input: PickInput): PickResult | null {
  const rng = input.rng ?? Math.random;
  const { quranPool, hadithPool, state, mode } = input;

  let kind: ContentKind;
  if (mode === 'quran') kind = 'quran';
  else if (mode === 'hadith') kind = 'hadith';
  else kind = state.lastKind === 'quran' ? 'hadith' : 'quran';

  // If the wanted pool is empty (e.g. no hadith collection selected), fall back to the other one.
  if (kind === 'quran' && quranPool.length === 0) kind = 'hadith';
  else if (kind === 'hadith' && hadithPool.length === 0) kind = 'quran';

  const pool = kind === 'quran' ? quranPool : hadithPool;
  if (pool.length === 0) return null;

  const { id, cursor } = takeFromPool(pool, state[kind], rng);
  return { id, kind, state: { ...state, [kind]: cursor, lastKind: kind } };
}
