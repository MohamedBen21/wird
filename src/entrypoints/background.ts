import { browser, defineBackground } from '#imports';
import { ContentRepository } from '../core/repository';
import { pickNext } from '../core/scheduler';
import { isQuietNow } from '../core/quiet-hours';
import { isHostBlocked, orderLanguages, type Settings } from '../core/settings';
import type { ReminderItem } from '../core/types';
import { extensionLoader } from '../shared/loader';
import type { BackgroundRequests, BackgroundType, OverlayMessage } from '../shared/messages';
import { getSettings, lastItemItem, schedulerItem, watchSettings } from '../shared/storage';

const ALARM = 'nour-reminder';
const OVERLAY_FILE = '/content-scripts/overlay.js';

const repo = new ContentRepository(extensionLoader);

interface TabLike {
  id?: number;
  url?: string;
}

type ShowResult = 'shown' | 'blocked' | 'no-access' | 'unsupported' | 'no-tab' | 'error';

// ----------------------------------------------------------------------------- scheduling

async function syncAlarm(): Promise<void> {
  const settings = await getSettings();
  if (!settings.enabled) {
    await browser.alarms.clear(ALARM);
    return;
  }
  const existing = await browser.alarms.get(ALARM);
  if (existing?.periodInMinutes === settings.intervalMinutes) return;
  await browser.alarms.create(ALARM, {
    delayInMinutes: settings.intervalMinutes,
    periodInMinutes: settings.intervalMinutes,
  });
}

async function nextItem(settings: Settings): Promise<ReminderItem | null> {
  const [quranPool, hadithPool, state] = await Promise.all([
    repo.quranPool(),
    repo.hadithPool(settings.hadithCollections),
    schedulerItem.getValue(),
  ]);
  const pick = pickNext({ mode: settings.content, quranPool, hadithPool, state });
  if (!pick) return null;
  await schedulerItem.setValue(pick.state);
  const item = await repo.getItem(pick.id, orderLanguages(settings.languages));
  if (item) await lastItemItem.setValue(item);
  return item;
}

// ----------------------------------------------------------------------------- delivery

async function activeTab(): Promise<TabLike | undefined> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

function parseWebUrl(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

async function hasAccessTo(url: URL): Promise<boolean> {
  try {
    if (await browser.permissions.contains({ origins: ['<all_urls>'] })) return true;
    return await browser.permissions.contains({ origins: [`${url.origin}/*`] });
  } catch {
    return false;
  }
}

/** Injects the overlay script unless it is already running in the tab. */
async function ensureOverlay(tabId: number): Promise<void> {
  try {
    const pong = (await browser.tabs.sendMessage(tabId, { type: 'overlay:ping' } satisfies OverlayMessage)) as
      | { ok?: boolean }
      | undefined;
    if (pong?.ok) return;
  } catch {
    // No receiver yet: inject below.
  }
  await browser.scripting.executeScript({ target: { tabId }, files: [OVERLAY_FILE] });
}

async function sendOverlay(tabId: number, msg: OverlayMessage): Promise<void> {
  await ensureOverlay(tabId);
  await browser.tabs.sendMessage(tabId, msg);
}

async function showOnTab(tab: TabLike | undefined, item: ReminderItem, settings: Settings): Promise<ShowResult> {
  if (!tab?.id) return 'no-tab';
  const url = parseWebUrl(tab.url);
  if (!url) return tab.url ? 'unsupported' : 'no-access';
  if (isHostBlocked(url.hostname, settings.blockedHosts)) return 'blocked';
  if (!(await hasAccessTo(url))) return 'no-access';
  try {
    await sendOverlay(tab.id, { type: 'overlay:toast', item });
    return 'shown';
  } catch {
    return 'error';
  }
}

async function notify(item: ReminderItem, settings: Settings): Promise<void> {
  const langs = orderLanguages(settings.languages);
  const title = item.title[langs[0]] ?? '';
  // Notifications are small: prefer the first translation (more readable than long Arabic) when present.
  const lang = langs.find((l) => l !== 'ar') ?? langs[0];
  const raw = item.texts[lang] ?? item.texts[langs[0]] ?? '';
  const message = raw.length > 240 ? `${raw.slice(0, 237)}…` : raw;

  let granted = false;
  if (settings.notifications) {
    try {
      granted = await browser.permissions.contains({ permissions: ['notifications'] });
    } catch {
      granted = false;
    }
  }
  if (granted && browser.notifications) {
    await browser.notifications.create(`wird-${Date.now()}`, {
      type: 'basic',
      iconUrl: (browser.runtime.getURL as (p: string) => string)('/icon/128.png'),
      title,
      message,
    });
    return;
  }
  // Last resort: a badge on the toolbar button. The popup clears it and shows the reminder.
  await browser.action.setBadgeBackgroundColor({ color: '#0f5132' });
  await browser.action.setBadgeText({ text: '1' });
}

async function tick(): Promise<void> {
  const settings = await getSettings();
  if (!settings.enabled || isQuietNow(new Date(), settings.quietHours)) return;
  const item = await nextItem(settings);
  if (!item) return;
  const result = await showOnTab(await activeTab(), item, settings);
  if (result === 'blocked') return;
  if (result !== 'shown') await notify(item, settings);
}

// ----------------------------------------------------------------------------- reader

async function openReader(tabId: number, surah?: number, ayah?: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await sendOverlay(tabId, { type: 'overlay:reader', surah, ayah });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ----------------------------------------------------------------------------- first run

/** Opens the settings page after installation. openOptionsPage can fail if no window is ready yet. */
async function openWelcome(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await browser.runtime.openOptionsPage();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  try {
    await browser.tabs.create({ url: (browser.runtime.getURL as (p: string) => string)('/options.html') });
  } catch {
    // No window at all: the user will find the settings from the toolbar popup.
  }
}

// ----------------------------------------------------------------------------- messages

type Handlers = {
  [K in BackgroundType]: (
    req: BackgroundRequests[K]['req'],
    sender: { tab?: TabLike },
  ) => Promise<BackgroundRequests[K]['res']>;
};

const handlers: Handlers = {
  'repo:chapters': () => repo.chapters(),

  'repo:chapter': async (req) => {
    const settings = await getSettings();
    const langs = orderLanguages(settings.languages);
    const view = await repo.getChapter(req!.surah, langs);
    if (!view) return null;
    // Every surah except Al-Fatihah (where it is verse 1) and At-Tawbah opens with the basmala.
    let basmala: string | null = null;
    if (req!.surah !== 1 && req!.surah !== 9) {
      basmala = (await repo.getVerse(1, 1, ['ar']))?.texts.ar ?? null;
    }
    return { view, basmala };
  },

  'repo:search': async (req) => {
    const settings = await getSettings();
    return repo.search(req!.query, orderLanguages(settings.languages), req!.limit ?? 40);
  },

  'reminder:next': async () => nextItem(await getSettings()),

  'reminder:test': async () => {
    const settings = await getSettings();
    const item = await nextItem(settings);
    if (!item) return { shown: false, reason: 'no-content' };
    const result = await showOnTab(await activeTab(), item, settings);
    return result === 'shown' ? { shown: true } : { shown: false, reason: result };
  },

  'reader:open': (req) => openReader(req!.tabId, req!.surah, req!.ayah),
};

// ----------------------------------------------------------------------------- wiring

export default defineBackground(() => {
  // All listeners are registered synchronously: Chrome wakes the service worker for them.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    void syncAlarm();
    if (reason === 'install') void openWelcome();
  });
  browser.runtime.onStartup.addListener(() => void syncAlarm());
  watchSettings(() => void syncAlarm());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void tick();
  });

  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'open-reader') return;
    const target = tab ?? (await activeTab());
    if (target?.id !== undefined) await openReader(target.id);
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const m = message as { type?: string; req?: unknown } | undefined;
    const handler = m?.type ? (handlers as Record<string, ((req: unknown, s: unknown) => Promise<unknown>) | undefined>)[m.type] : undefined;
    if (!handler) return false;
    handler(m!.req, sender).then(sendResponse, (err: unknown) =>
      sendResponse({ __error: err instanceof Error ? err.message : String(err) }),
    );
    return true; // keep the channel open for the async response
  });

  // Make sure the alarm exists whenever the worker starts (e.g. after a browser update).
  void syncAlarm();
});
