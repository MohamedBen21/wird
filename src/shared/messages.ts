import { browser } from '#imports';
import type { ChapterMeta, ChapterView, ReminderItem, SearchResult } from '../core/types';

/** Requests sent TO the background (which owns the data and the scheduler). */
export interface BackgroundRequests {
  'repo:chapters': { req: undefined; res: ChapterMeta[] };
  'repo:chapter': { req: { surah: number }; res: { view: ChapterView; basmala: string | null } | null };
  'repo:search': { req: { query: string; limit?: number }; res: SearchResult };
  /** Picks the next reminder and returns it (the caller decides where to show it). */
  'reminder:next': { req: undefined; res: ReminderItem | null };
  /** Pick a reminder and show it on the active tab even if reminders are paused (settings "test" button). */
  'reminder:test': { req: undefined; res: { shown: boolean; reason?: string } };
  /** Inject the overlay into a tab and open the reader (optionally at a verse). */
  'reader:open': { req: { tabId: number; surah?: number; ayah?: number }; res: { ok: boolean; error?: string } };
}

/** Messages sent FROM the background TO the overlay content script. */
export type OverlayMessage =
  | { type: 'overlay:ping' }
  | { type: 'overlay:toast'; item: ReminderItem }
  | { type: 'overlay:reader'; surah?: number; ayah?: number };

export type BackgroundType = keyof BackgroundRequests;

export function sendToBackground<K extends BackgroundType>(
  type: K,
  req?: BackgroundRequests[K]['req'],
): Promise<BackgroundRequests[K]['res']> {
  return browser.runtime.sendMessage({ type, req }).then((res: unknown) => {
    if (res && typeof res === 'object' && '__error' in res) throw new Error(String((res as { __error: unknown }).__error));
    return res as BackgroundRequests[K]['res'];
  });
}
