import { browser, createShadowRootUi, defineContentScript } from '#imports';
import { createRoot } from 'react-dom/client';
import { OverlayApp, type OverlayCommand } from '../ui/OverlayApp';
import '../ui/styles.css';
import type { OverlayMessage } from '../shared/messages';

const FONT_STYLE_ID = 'nour-font-face';

/** @font-face rules are ignored inside shadow roots, so the font is declared on the page itself. */
function injectFont() {
  if (document.getElementById(FONT_STYLE_ID)) return;
  const url = (browser.runtime.getURL as (p: string) => string)('/fonts/amiri-quran-arabic.woff2');
  const style = document.createElement('style');
  style.id = FONT_STYLE_ID;
  style.textContent = `@font-face{font-family:"Nour Amiri Quran";src:url("${url}") format("woff2");font-display:swap;}`;
  (document.head ?? document.documentElement).append(style);
}

export default defineContentScript({
  // Injected on demand by the background (see `ensureOverlay`), never declared in the manifest.
  registration: 'runtime',
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const w = window as unknown as { __nourOverlay?: boolean };
    if (w.__nourOverlay) return;
    w.__nourOverlay = true;

    injectFont();

    // Commands that arrive before React has mounted are queued and replayed.
    let dispatch: ((cmd: OverlayCommand) => void) | null = null;
    const pending: OverlayCommand[] = [];
    const send = (cmd: OverlayCommand) => (dispatch ? dispatch(cmd) : pending.push(cmd));

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const msg = message as OverlayMessage | undefined;
      if (!msg || typeof msg !== 'object') return false;
      switch (msg.type) {
        case 'overlay:ping':
          sendResponse({ ok: true });
          return false;
        case 'overlay:toast':
          send({ type: 'toast', item: msg.item });
          sendResponse({ ok: true });
          return false;
        case 'overlay:reader':
          send({ type: 'reader', surah: msg.surah, ayah: msg.ayah });
          sendResponse({ ok: true });
          return false;
        default:
          return false;
      }
    });

    const ui = await createShadowRootUi(ctx, {
      name: 'nour-overlay',
      position: 'overlay',
      zIndex: 2147483646,
      anchor: 'body',
      onMount(container) {
        const root = createRoot(container);
        root.render(
          <OverlayApp
            register={(fn) => {
              dispatch = fn;
              for (const cmd of pending.splice(0)) fn(cmd);
            }}
          />,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();

    // Keep keystrokes typed in the reader away from the page's own keyboard shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      ui.shadowHost.addEventListener(type, (e) => e.stopPropagation());
    }
  },
});
