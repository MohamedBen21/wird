import { LANGS, type Lang } from './types';
import type { ContentMode } from './scheduler';
import type { QuietHours } from './quiet-hours';

export type ToastPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type Theme = 'auto' | 'light' | 'dark';
export type UiLanguage = 'auto' | Lang;

export interface Settings {
  enabled: boolean;
  /** Minutes between reminders. */
  intervalMinutes: number;
  content: ContentMode;
  /** Languages shown for every verse/hadith, in display order. At least one. */
  languages: Lang[];
  uiLanguage: UiLanguage;
  hadithCollections: string[];
  quietHours: QuietHours;
  /** Use OS notifications when the page cannot show a toast (needs the optional permission). */
  notifications: boolean;
  /** Seconds before the toast closes itself. 0 keeps it until dismissed. */
  toastSeconds: number;
  toastPosition: ToastPosition;
  /** Hostnames where reminders must not appear. */
  blockedHosts: string[];
  theme: Theme;
  /** Reader font size for Arabic text, in px. */
  fontSize: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  intervalMinutes: 10,
  content: 'both',
  languages: ['ar', 'en'],
  uiLanguage: 'auto',
  hadithCollections: ['nawawi', 'qudsi', 'bukhari', 'muslim'],
  quietHours: { enabled: false, start: '23:00', end: '05:00' },
  notifications: false,
  toastSeconds: 20,
  toastPosition: 'bottom-right',
  blockedHosts: [],
  theme: 'auto',
  fontSize: 26,
};

export const INTERVAL_MIN = 1;
export const INTERVAL_MAX = 1440;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Normalizes a hostname the user typed ("https://www.Example.com/path" -> "www.example.com"). */
export function cleanHost(input: string): string {
  const t = input.trim().toLowerCase();
  if (!t) return '';
  try {
    return new URL(t.includes('://') ? t : `https://${t}`).hostname;
  } catch {
    return '';
  }
}

/** Returns true if `host` equals or is a subdomain of any blocked host. */
export function isHostBlocked(host: string, blocked: string[]): boolean {
  const h = host.toLowerCase();
  return blocked.some((b) => h === b || h.endsWith(`.${b}`));
}

/** Merges stored (possibly old or hand-edited) settings over the defaults and fixes invalid values. */
export function sanitizeSettings(input: unknown): Settings {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;

  const languages = Array.isArray(s.languages)
    ? (Array.from(new Set(s.languages.filter((l): l is Lang => LANGS.includes(l as Lang)))) as Lang[])
    : [];
  const q = (s.quietHours && typeof s.quietHours === 'object' ? s.quietHours : {}) as Record<string, unknown>;

  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
    intervalMinutes: Math.round(clamp(num(s.intervalMinutes, d.intervalMinutes), INTERVAL_MIN, INTERVAL_MAX)),
    content: pick(s.content, ['both', 'quran', 'hadith'] as const, d.content),
    languages: languages.length ? languages : [...d.languages],
    uiLanguage: pick(s.uiLanguage, ['auto', 'ar', 'en', 'fr'] as const, d.uiLanguage),
    hadithCollections: Array.isArray(s.hadithCollections)
      ? s.hadithCollections.filter((c): c is string => typeof c === 'string')
      : [...d.hadithCollections],
    quietHours: {
      enabled: typeof q.enabled === 'boolean' ? q.enabled : d.quietHours.enabled,
      start: typeof q.start === 'string' ? q.start : d.quietHours.start,
      end: typeof q.end === 'string' ? q.end : d.quietHours.end,
    },
    notifications: typeof s.notifications === 'boolean' ? s.notifications : d.notifications,
    toastSeconds: Math.round(clamp(num(s.toastSeconds, d.toastSeconds), 0, 600)),
    toastPosition: pick(s.toastPosition, ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const, d.toastPosition),
    blockedHosts: Array.isArray(s.blockedHosts)
      ? Array.from(new Set(s.blockedHosts.filter((h): h is string => typeof h === 'string').map(cleanHost).filter(Boolean)))
      : [],
    theme: pick(s.theme, ['auto', 'light', 'dark'] as const, d.theme),
    fontSize: Math.round(clamp(num(s.fontSize, d.fontSize), 16, 48)),
  };
}

/** Languages in canonical display order: Arabic first, then English, then French. */
export function orderLanguages(langs: Lang[]): Lang[] {
  return LANGS.filter((l) => langs.includes(l));
}
