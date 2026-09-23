const pad = (n: number) => (n < 10 ? '0' : '') + n;

/** Seconds into a video as m:ss.s */
export function fmtSeconds(s: number | null | undefined): string {
  if (s === null || s === undefined || !isFinite(s)) return '-';
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`;
}

/** Duration as h:mm:ss or m:ss */
export function fmtDuration(s: number | null | undefined): string {
  if (s === null || s === undefined || !isFinite(s)) return '-';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function fmtClock(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleTimeString();
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

export function fmtBytes(b: number): string {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  let v = b;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(1)} ${units[i]}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 0) return 'in ' + Math.abs(Math.round(d)) + 's';
  if (d < 5) return 'just now';
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

/** A Date as the value of an <input type="datetime-local">, in local time. */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value as an unambiguous ISO 8601 string, or null when empty or invalid. */
export function fromLocalInput(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Record to a sorted entry list, because templates cannot index a Record under strict settings. */
export function entriesDesc(rec: Record<string, number> | null | undefined): { key: string; value: number }[] {
  if (!rec) return [];
  return Object.entries(rec).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}
