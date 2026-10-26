/**
 * Ποιος την άνοιξε και πότε.
 *
 * The open-shift control at the top of the screen said «ΑΝΟΙΧΤΗ ΒΑΡΔΙΑ» and
 * nothing else - who was on it and since when lived in a `title` tooltip,
 * which is invisible on the phone the staff actually use. The hero card
 * further down gave the operator and the time but never the date, so a till
 * left open overnight read as though it had started this morning.
 *
 * One line, written the same way wherever it appears.
 */

const dateFmt = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export interface WhoWhenShift {
  opened_by_user_name?: string | null;
  opened_at?: string | null;
}

/** «26/10/2026 08:15», in Athens, whatever zone the browser is in. */
export function whenOpened(openedAt: string | null | undefined): string {
  const at = new Date(String(openedAt ?? ''));
  if (Number.isNaN(at.getTime())) return '';
  return `${dateFmt.format(at)} ${timeFmt.format(at)}`;
}

export function whoOpened(name: string | null | undefined): string {
  return String(name ?? '').trim() || 'Υπάλληλος';
}

/**
 * «Γιώργος Τυλιγάδας · 26/10/2026 08:15»
 *
 * Falls back to just the name when the timestamp is unreadable, rather than
 * printing a separator with nothing after it.
 */
export function whoAndWhen(shift: WhoWhenShift | null | undefined): string {
  const who = whoOpened(shift?.opened_by_user_name);
  const when = whenOpened(shift?.opened_at);
  return when ? `${who} · ${when}` : who;
}
