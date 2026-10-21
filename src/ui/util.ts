import type { Lang, ReminderItem, Texts } from '../core/types';
import { LANGS } from '../core/types';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * The bundled Quran font has no glyph for U+065E (the "open fathatan" used in the Madinah-style text
 * we ship; 1,800+ occurrences) and would show an empty box. For DISPLAY ONLY it is drawn as the
 * standard fathatan U+064B. The stored text, search and copying all keep the original characters.
 */
export function displayArabic(s: string): string {
  return s.replace(/\u065E/g, '\u064B');
}

export function toArabicIndic(n: number): string {
  return String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);
}

/** Languages present in a Texts object, in canonical order (Arabic, English, French). */
export function presentLangs(texts: Texts): Lang[] {
  return LANGS.filter((l) => texts[l]);
}

/** Plain-text version of a reminder for copying. */
export function reminderToText(item: ReminderItem, uiLang: Lang): string {
  const title = item.title[uiLang] ?? Object.values(item.title)[0] ?? '';
  const body = presentLangs(item.texts)
    .map((l) => item.texts[l])
    .join('\n\n');
  return `${body}\n\n— ${title}`;
}

/** Copies text. The async Clipboard API can be blocked on some pages, so fall back to execCommand. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
