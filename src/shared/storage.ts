import { storage } from '#imports';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../core/settings';
import type { SchedulerState } from '../core/scheduler';
import type { ReminderItem } from '../core/types';

/** Settings roam with the browser account (sync storage). */
export const settingsItem = storage.defineItem<Settings>('sync:settings', { fallback: DEFAULT_SETTINGS });

/** Scheduler cursors and the last reminder stay on this device. */
export const schedulerItem = storage.defineItem<SchedulerState>('local:scheduler', { fallback: {} });
export const lastItemItem = storage.defineItem<ReminderItem | null>('local:lastItem', { fallback: null });
export const readerPosItem = storage.defineItem<{ surah: number; ayah: number }>('local:readerPos', {
  fallback: { surah: 1, ayah: 1 },
});

export async function getSettings(): Promise<Settings> {
  return sanitizeSettings(await settingsItem.getValue());
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitizeSettings({ ...(await getSettings()), ...patch });
  await settingsItem.setValue(next);
  return next;
}

/** Subscribes to settings changes (sanitized). Returns an unsubscribe function. */
export function watchSettings(cb: (s: Settings) => void): () => void {
  return settingsItem.watch((v) => cb(sanitizeSettings(v)));
}
