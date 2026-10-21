import { useEffect, useRef, useState } from 'react';
import type { ReminderItem } from '../core/types';
import type { UiContext } from './hooks';
import { ReminderCard } from './ReminderCard';
import { sendToBackground } from '../shared/messages';

interface Props {
  item: ReminderItem;
  ui: UiContext;
  onClose: () => void;
  onItem: (item: ReminderItem) => void;
  onOpenReader: (surah: number, ayah: number) => void;
}

export function Toast({ item, ui, onClose, onItem, onOpenReader }: Props) {
  const { settings, lang, t } = ui;
  const seconds = settings.toastSeconds;
  const [paused, setPaused] = useState(false);
  const remaining = useRef(seconds * 1000);
  const startedAt = useRef(0);

  // A new item (or a changed duration) restarts the countdown.
  useEffect(() => {
    remaining.current = seconds * 1000;
  }, [item.id, seconds]);

  // Pausing (hover or focus) keeps the time that is left, so the toast never vanishes under the cursor.
  useEffect(() => {
    if (!seconds || paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(onClose, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [seconds, paused, item.id, onClose]);

  const another = async () => {
    try {
      const next = await sendToBackground('reminder:next');
      if (next) onItem(next);
    } catch {
      // The extension may have been reloaded; nothing useful to do on the page.
    }
  };

  const progress = seconds ? (
    <div
      className="progress"
      key={item.id}
      style={{ animationDuration: `${seconds}s`, animationPlayState: paused ? 'paused' : 'running' }}
    />
  ) : undefined;

  return (
    <div
      className={`toast pos-${settings.toastPosition}`}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ReminderCard
        item={item}
        t={t}
        uiLang={lang}
        fontSize={Math.min(settings.fontSize, item.kind === 'quran' ? 28 : 22)}
        top={progress ?? <div className="card-bar" />}
        onAnother={another}
        onOpenReader={item.surah ? () => onOpenReader(item.surah!, item.ayah!) : undefined}
        onClose={onClose}
      />
    </div>
  );
}
