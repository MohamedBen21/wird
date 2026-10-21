import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../core/settings';
import { dirOf, makeT, resolveUiLanguage, type T } from '../shared/i18n';
import { getSettings, watchSettings } from '../shared/storage';
import type { Lang } from '../core/types';

/** Loads the settings and keeps them in sync with changes made elsewhere (options page, other tabs). */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let alive = true;
    getSettings().then((s) => alive && setSettings(s));
    const stop = watchSettings((s) => alive && setSettings(s));
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return settings;
}

export interface UiContext {
  settings: Settings;
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: T;
}

/** Derives the interface language, text direction and translator from the settings. */
export function useUi(settings: Settings | null): UiContext {
  const s = settings ?? DEFAULT_SETTINGS;
  return useMemo(() => {
    const lang = resolveUiLanguage(s.uiLanguage);
    return { settings: s, lang, dir: dirOf(lang), t: makeT(lang) };
  }, [s]);
}
