import { useState, type ReactNode } from 'react';
import type { Lang, ReminderItem } from '../core/types';
import type { T } from '../shared/i18n';
import { copyText, displayArabic, presentLangs, reminderToText } from './util';

interface Props {
  item: ReminderItem;
  t: T;
  uiLang: Lang;
  /** Arabic font size in px. */
  fontSize: number;
  onAnother?: () => void;
  onOpenReader?: () => void;
  onClose?: () => void;
  /** Extra content rendered above the card body (e.g. the auto-hide progress bar). */
  top?: ReactNode;
}

export function ReminderCard({ item, t, uiLang, fontSize, onAnother, onOpenReader, onClose, top }: Props) {
  const [copied, setCopied] = useState(false);
  const title = item.title[uiLang] ?? Object.values(item.title)[0] ?? '';
  const langs = presentLangs(item.texts);

  const copy = async () => {
    if (await copyText(reminderToText(item, uiLang))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <article className="card">
      {top ?? <div className="card-bar" />}
      <div className="card-body">
        <div className="card-head">
          <div className="card-title">
            <span className="badge">{item.kind === 'quran' ? t('quran') : t('hadith')}</span>
            {title}
          </div>
          {onClose && (
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('close')} title={t('close')}>
              ×
            </button>
          )}
        </div>

        <div className="texts">
          {langs.map((l) =>
            l === 'ar' ? (
              <p key={l} className="t-ar" lang="ar" dir="rtl" style={{ fontSize }}>
                {displayArabic(item.texts.ar ?? '')}
              </p>
            ) : (
              <p key={l} className="t-tr" lang={l} dir="ltr">
                {item.texts[l]}
              </p>
            ),
          )}
        </div>

        <div className="actions">
          {onAnother && (
            <button className="btn btn-primary" onClick={onAnother}>
              {t('anotherOne')}
            </button>
          )}
          {onOpenReader && item.kind === 'quran' && (
            <button className="btn" onClick={onOpenReader}>
              {t('openReader')}
            </button>
          )}
          <button className="btn" onClick={copy}>
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
      </div>
    </article>
  );
}
