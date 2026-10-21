import { browser } from '#imports';
import { useEffect, useState } from 'react';
import type { ReminderItem } from '../../core/types';
import { sendToBackground } from '../../shared/messages';
import { lastItemItem, updateSettings } from '../../shared/storage';
import { useSettings, useUi } from '../../ui/hooks';
import { ReminderCard } from '../../ui/ReminderCard';

export function App() {
  const settings = useSettings();
  const ui = useUi(settings);
  const { t, lang, dir } = ui;
  const [item, setItem] = useState<ReminderItem | null>(null);
  const [access, setAccess] = useState<boolean | null>(null);
  const [cannotOpen, setCannotOpen] = useState(false);

  useEffect(() => {
    void browser.action.setBadgeText({ text: '' });
    void lastItemItem.getValue().then(setItem);
    void browser.permissions
      .contains({ origins: ['<all_urls>'] })
      .then(setAccess)
      .catch(() => setAccess(false));
  }, []);

  if (!settings) return null;

  const another = async () => {
    const next = await sendToBackground('reminder:next');
    if (next) setItem(next);
  };

  const openReader = async (surah?: number, ayah?: number) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return setCannotOpen(true);
    const res = await sendToBackground('reader:open', { tabId: tab.id, surah, ayah });
    if (res.ok) window.close();
    else setCannotOpen(true);
  };

  return (
    <div className="nour surface" data-theme={settings.theme} dir={dir} lang={lang}>
      <div className="page popup">
        <div className="page-head">
          <img src="/icon/48.png" alt="" />
          <div>
            <h1>{t('appName')}</h1>
            <p>{t('tagline')}</p>
          </div>
        </div>

        {item ? (
          <ReminderCard
            item={item}
            t={t}
            uiLang={lang}
            fontSize={Math.min(settings.fontSize, 28)}
            onAnother={another}
            onOpenReader={() => openReader(item.surah, item.ayah)}
          />
        ) : (
          <div className="note">
            {t('noReminderYet')} {t('noReminderYetHint')}
            <div className="actions" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={another}>
                {t('anotherOne')}
              </button>
            </div>
          </div>
        )}

        <button className="btn btn-primary" onClick={() => openReader()}>
          {t('openReaderHere')}
        </button>
        {cannotOpen && <div className="note warn">{t('cannotOpenHere')}</div>}
        {access === false && <div className="note">{t('needsSitePermission')}</div>}

        <div className="row">
          <span className="note" style={{ flex: 1 }}>
            {settings.enabled ? t('nextIn', { n: settings.intervalMinutes }) : t('paused')}
          </span>
          <button className="btn" onClick={() => updateSettings({ enabled: !settings.enabled })}>
            {settings.enabled ? t('pause') : t('resume')}
          </button>
          <button className="btn" onClick={() => browser.runtime.openOptionsPage()}>
            {t('settings')}
          </button>
        </div>
      </div>
    </div>
  );
}
