import { useCallback, useEffect, useState } from 'react';
import type { ReminderItem } from '../core/types';
import { useSettings, useUi } from './hooks';
import { Reader } from './Reader';
import { Toast } from './Toast';

export type OverlayCommand =
  | { type: 'toast'; item: ReminderItem }
  | { type: 'reader'; surah?: number; ayah?: number };

interface Props {
  /** Receives the function used to push commands (from the background) into the app. */
  register: (dispatch: (cmd: OverlayCommand) => void) => void;
}

export function OverlayApp({ register }: Props) {
  const settings = useSettings();
  const ui = useUi(settings);
  const [toast, setToast] = useState<ReminderItem | null>(null);
  const [reader, setReader] = useState<{ surah?: number; ayah?: number; key: number } | null>(null);

  useEffect(() => {
    register((cmd) => {
      if (cmd.type === 'toast') setToast(cmd.item);
      else setReader((r) => ({ surah: cmd.surah, ayah: cmd.ayah, key: (r?.key ?? 0) + 1 }));
    });
  }, [register]);

  const closeToast = useCallback(() => setToast(null), []);
  const closeReader = useCallback(() => setReader(null), []);

  if (!settings) return null;

  return (
    <div className="nour" data-theme={settings.theme} dir={ui.dir} lang={ui.lang}>
      {toast && (
        <Toast
          item={toast}
          ui={ui}
          onClose={closeToast}
          onItem={setToast}
          onOpenReader={(surah, ayah) => {
            setToast(null);
            setReader((r) => ({ surah, ayah, key: (r?.key ?? 0) + 1 }));
          }}
        />
      )}
      {reader && <Reader key={reader.key} ui={ui} initial={reader} onClose={closeReader} />}
    </div>
  );
}
