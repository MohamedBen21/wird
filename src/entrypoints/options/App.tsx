import { browser } from '#imports';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ContentRepository } from '../../core/repository';
import {
  INTERVAL_MAX,
  INTERVAL_MIN,
  cleanHost,
  type Settings,
  type ToastPosition,
} from '../../core/settings';
import type { CollectionMeta, Lang, ReminderItem } from '../../core/types';
import { LANGS } from '../../core/types';
import type { StringKey } from '../../shared/i18n';
import { extensionLoader } from '../../shared/loader';
import { sendToBackground } from '../../shared/messages';
import { updateSettings } from '../../shared/storage';
import { useSettings, useUi } from '../../ui/hooks';
import { ReminderCard } from '../../ui/ReminderCard';

const LANG_LABEL: Record<Lang, StringKey> = { ar: 'langAr', en: 'langEn', fr: 'langFr' };
const POSITIONS: [ToastPosition, StringKey][] = [
  ['bottom-right', 'posBR'],
  ['bottom-left', 'posBL'],
  ['top-right', 'posTR'],
  ['top-left', 'posTL'],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sec">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function App() {
  const settings = useSettings();
  const ui = useUi(settings);
  const { t, lang, dir } = ui;

  const [collections, setCollections] = useState<CollectionMeta[]>([]);
  const [access, setAccess] = useState(false);
  const [notifPerm, setNotifPerm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<ReminderItem | null>(null);
  const [intervalText, setIntervalText] = useState<string | null>(null);
  const [hostsText, setHostsText] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refreshPermissions = useCallback(async () => {
    try {
      setAccess(await browser.permissions.contains({ origins: ['<all_urls>'] }));
      setNotifPerm(await browser.permissions.contains({ permissions: ['notifications'] }));
    } catch {
      setAccess(false);
    }
  }, []);

  useEffect(() => {
    void refreshPermissions();
    void new ContentRepository(extensionLoader).collections().then(setCollections);
  }, [refreshPermissions]);

  const save = useCallback(async (patch: Partial<Settings>) => {
    await updateSettings(patch);
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  }, []);

  const newPreview = useCallback(async () => {
    const item = await sendToBackground('reminder:next');
    if (item) setPreview(item);
  }, []);

  // Language changes re-render the preview in the new languages.
  const langKey = settings?.languages.join(',');
  useEffect(() => {
    if (langKey) void newPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langKey]);

  const quiet = settings?.quietHours;
  const hostsValue = useMemo(() => settings?.blockedHosts.join('\n') ?? '', [settings?.blockedHosts]);

  if (!settings || !quiet) return null;

  const toggleLang = (l: Lang) => {
    const has = settings.languages.includes(l);
    const next = has ? settings.languages.filter((x) => x !== l) : [...settings.languages, l];
    if (next.length === 0) return; // at least one language stays on
    void save({ languages: LANGS.filter((x) => next.includes(x)) });
  };

  const toggleCollection = (id: string) => {
    const has = settings.hadithCollections.includes(id);
    void save({
      hadithCollections: has
        ? settings.hadithCollections.filter((c) => c !== id)
        : [...settings.hadithCollections, id],
    });
  };

  const commitInterval = () => {
    if (intervalText === null) return;
    const n = Number(intervalText);
    setIntervalText(null);
    if (Number.isFinite(n) && n >= INTERVAL_MIN) void save({ intervalMinutes: n });
  };

  const commitHosts = () => {
    if (hostsText === null) return;
    const hosts = hostsText.split(/[\n,]+/).map(cleanHost).filter(Boolean);
    setHostsText(null);
    void save({ blockedHosts: hosts });
  };

  const grantAccess = async () => {
    setMessage(null);
    await browser.permissions.request({ origins: ['<all_urls>'] });
    await refreshPermissions();
  };

  const revokeAccess = async () => {
    await browser.permissions.remove({ origins: ['<all_urls>'] });
    await refreshPermissions();
  };

  const toggleNotifications = async (on: boolean) => {
    setMessage(null);
    if (!on) return void save({ notifications: false });
    const ok = await browser.permissions.request({ permissions: ['notifications'] });
    await refreshPermissions();
    if (ok) void save({ notifications: true });
    else setMessage(t('notificationsDenied'));
  };

  const sendTest = () => {
    setMessage(t('testWaiting'));
    setTimeout(async () => {
      const res = await sendToBackground('reminder:test');
      setMessage(
        res.shown
          ? t('testShown')
          : res.reason === 'no-access'
            ? t('testNoAccess')
            : t('testNoTab'),
      );
    }, 5000);
  };

  return (
    <div className="nour surface" data-theme={settings.theme} dir={dir} lang={lang}>
      <main className="options">
        <div className="page-head">
          <img src="/icon/48.png" alt="" />
          <div>
            <h1>{t('appName')}</h1>
            <p>
              {t('tagline')} · {t('shortcut')}
            </p>
          </div>
        </div>

        <Section title={t('secReminders')}>
          <label className="check">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
            {t('enabled')}
          </label>

          <div className="field">
            <span className="label">{t('interval')}</span>
            <div className="inline">
              <input
                type="number"
                min={INTERVAL_MIN}
                max={INTERVAL_MAX}
                value={intervalText ?? settings.intervalMinutes}
                onChange={(e) => setIntervalText(e.target.value)}
                onBlur={commitInterval}
                onKeyDown={(e) => e.key === 'Enter' && commitInterval()}
                aria-label={t('interval')}
              />
              {t('minutes')}
            </div>
          </div>

          <div className="field">
            <label htmlFor="content">{t('content')}</label>
            <select
              id="content"
              value={settings.content}
              onChange={(e) => save({ content: e.target.value as Settings['content'] })}
            >
              <option value="both">{t('contentBoth')}</option>
              <option value="quran">{t('contentQuran')}</option>
              <option value="hadith">{t('contentHadith')}</option>
            </select>
          </div>

          {settings.content !== 'quran' && (
            <div className="field">
              <span className="label">{t('collections')}</span>
              <div className="chips">
                {collections.map((c) => {
                  const on = settings.hadithCollections.includes(c.id);
                  return (
                    <label key={c.id} className={`chip${on ? ' on' : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleCollection(c.id)} />
                      {c[lang]}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        <Section title={t('secLanguages')}>
          <div className="chips">
            {LANGS.map((l) => {
              const on = settings.languages.includes(l);
              return (
                <label key={l} className={`chip${on ? ' on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleLang(l)} />
                  {t(LANG_LABEL[l])}
                </label>
              );
            })}
          </div>
          <p className="help">{t('languagesHint')}</p>

          <div className="field">
            <span className="label">{t('preview')}</span>
            {preview && (
              <ReminderCard
                item={preview}
                t={t}
                uiLang={lang}
                fontSize={settings.fontSize}
                onAnother={newPreview}
              />
            )}
          </div>
        </Section>

        <Section title={t('secDisplay')}>
          <div className="inline">
            <div className="field">
              <label htmlFor="ui">{t('uiLanguage')}</label>
              <select
                id="ui"
                value={settings.uiLanguage}
                onChange={(e) => save({ uiLanguage: e.target.value as Settings['uiLanguage'] })}
              >
                <option value="auto">{t('uiAuto')}</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="theme">{t('theme')}</label>
              <select id="theme" value={settings.theme} onChange={(e) => save({ theme: e.target.value as Settings['theme'] })}>
                <option value="auto">{t('themeAuto')}</option>
                <option value="light">{t('themeLight')}</option>
                <option value="dark">{t('themeDark')}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pos">{t('position')}</label>
              <select
                id="pos"
                value={settings.toastPosition}
                onChange={(e) => save({ toastPosition: e.target.value as ToastPosition })}
              >
                {POSITIONS.map(([value, key]) => (
                  <option key={value} value={value}>
                    {t(key)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="inline">
            <div className="field">
              <label htmlFor="toast">{t('toastSeconds')}</label>
              <div className="inline">
                <input
                  id="toast"
                  type="number"
                  min={0}
                  max={600}
                  value={settings.toastSeconds}
                  onChange={(e) => save({ toastSeconds: Number(e.target.value) })}
                />
                {t('seconds')}
              </div>
              <span className="help">{t('toastNever')}</span>
            </div>
            <div className="field">
              <label htmlFor="font">{t('fontSize')}</label>
              <input
                id="font"
                type="range"
                min={16}
                max={48}
                value={settings.fontSize}
                onChange={(e) => save({ fontSize: Number(e.target.value) })}
              />
            </div>
          </div>
        </Section>

        <Section title={t('secQuiet')}>
          <label className="check">
            <input
              type="checkbox"
              checked={quiet.enabled}
              onChange={(e) => save({ quietHours: { ...quiet, enabled: e.target.checked } })}
            />
            {t('quietEnable')}
          </label>
          <div className="inline">
            <input
              type="time"
              value={quiet.start}
              disabled={!quiet.enabled}
              onChange={(e) => e.target.value && save({ quietHours: { ...quiet, start: e.target.value } })}
              aria-label={t('quietEnable')}
            />
            {t('and')}
            <input
              type="time"
              value={quiet.end}
              disabled={!quiet.enabled}
              onChange={(e) => e.target.value && save({ quietHours: { ...quiet, end: e.target.value } })}
            />
          </div>
        </Section>

        <Section title={t('secAccess')}>
          <p className="help">{t('accessIntro')}</p>
          <div className={`note${access ? '' : ' warn'}`}>{access ? t('accessGranted') : t('accessNotGranted')}</div>
          <div className="actions">
            {access ? (
              <button className="btn" onClick={revokeAccess}>
                {t('revokeAccess')}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={grantAccess}>
                {t('grantAccess')}
              </button>
            )}
            <button className="btn" onClick={sendTest}>
              {t('sendTest')}
            </button>
          </div>
          {message && <div className="note">{message}</div>}

          <label className="check">
            <input
              type="checkbox"
              checked={settings.notifications && notifPerm}
              onChange={(e) => toggleNotifications(e.target.checked)}
            />
            {t('notifications')}
          </label>

          <div className="field">
            <label htmlFor="hosts">{t('blockedHosts')}</label>
            <textarea
              id="hosts"
              dir="ltr"
              value={hostsText ?? hostsValue}
              onChange={(e) => setHostsText(e.target.value)}
              onBlur={commitHosts}
              placeholder="example.com"
            />
            <span className="help">{t('blockedHostsHint')}</span>
          </div>
        </Section>

        <Section title={t('secAbout')}>
          <p className="about">{t('aboutText')}</p>
        </Section>
      </main>
      {saved && <div className="saved">{t('saved')}</div>}
    </div>
  );
}
