/**
 * The shift's start, split so the time can be shown in 24-hour form.
 *
 * `<input type="datetime-local">` takes its format from the BROWSER's locale,
 * not from the page: on an en-US browser it renders «10/19/2026, 01:43 PM»
 * whatever the app's language is, and neither the `lang` attribute nor CSS
 * changes that. A Greek agency writing 13:43 on every other document should
 * not have to read πμ/μμ here.
 *
 * So the date keeps its native picker - a date has no am/pm problem - and the
 * time becomes a plain text field this module parses. Forgiving on input,
 * because somebody typing a shift start types «9», «930» or «9:5» as often as
 * «09:30», and strict on output, because the value feeds a timestamp.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** 'YYYY-MM-DDTHH:mm' -> its two halves. Blank in, blank out. */
export function splitLocalDateTime(value: string | null | undefined): {
  date: string;
  time: string;
} {
  const raw = String(value ?? '');
  const [date = '', rest = ''] = raw.split('T');
  return { date, time: rest.slice(0, 5) };
}

/** The two halves back into what the input and the shift payload expect. */
export function joinLocalDateTime(date: string, time: string): string {
  if (!date) return '';
  const t = normalizeTime24(time);
  return `${date}T${t ?? '00:00'}`;
}

/**
 * Anything a person might type for a 24-hour time, as HH:mm - or null.
 *
 * Accepts «9», «09», «930», «0930», «9:3», «9.30», «21:05». Rejects a 25th
 * hour and a 60th minute rather than rolling them over, because a typo that
 * silently becomes the next day is worse than one that refuses.
 */
export function normalizeTime24(input: string | null | undefined): string | null {
  const raw = String(input ?? '').trim();
  if (raw === '') return null;

  const digits = raw.replace(/[^0-9]/g, '');
  const separated = /[:.\s]/.test(raw);

  let hours: number;
  let minutes: number;

  if (separated) {
    const [h = '', m = ''] = raw.split(/[:.\s]+/);
    hours = parseInt(h, 10);
    minutes = m === '' ? 0 : parseInt(m, 10);
  } else if (digits.length <= 2) {
    hours = parseInt(digits, 10);
    minutes = 0;
  } else if (digits.length === 3) {
    hours = parseInt(digits.slice(0, 1), 10);
    minutes = parseInt(digits.slice(1), 10);
  } else if (digits.length === 4) {
    hours = parseInt(digits.slice(0, 2), 10);
    minutes = parseInt(digits.slice(2), 10);
  } else {
    return null;
  }

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${pad(hours)}:${pad(minutes)}`;
}
