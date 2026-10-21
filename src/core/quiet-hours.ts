export interface QuietHours {
  enabled: boolean;
  /** "HH:MM" local time. */
  start: string;
  end: string;
}

function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True when `now` falls inside the quiet window. The window may wrap past midnight (22:00-06:00). */
export function isQuietNow(now: Date, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false;
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  if (start === null || end === null || start === end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}
