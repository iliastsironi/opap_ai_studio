/**
 * Reading a number out of what somebody is in the middle of typing.
 *
 * `<input type="number">` cannot hold an unfinished number. Type «5,» or «5.»
 * and the browser reports the value as an empty string, so a field bound to
 * `Number(e.target.value) || 0` jumps to 0 and wipes what was there - which is
 * exactly what happens on a Greek keyboard, where the decimal separator is a
 * comma and is therefore the first thing pressed after the whole euros.
 *
 * The fix is to keep the text as typed and read a number out of it, which is
 * what these do.
 */

/** Characters a money or quantity field may hold while being typed. */
const ALLOWED = /^-?[0-9]*[.,]?[0-9]*$/;

/** True while `text` could still become a number. */
export function isPartialNumber(text: string): boolean {
  return ALLOWED.test(text.trim());
}

/**
 * The number `text` currently represents, or null when it does not represent
 * one yet - «», «-», «5,» on its own are all mid-typing, not zero.
 */
export function parseLooseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function clampNumber(n: number, min?: number, max?: number): number {
  let out = n;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
}

/** How a committed value is shown once the field is left. */
export function formatLooseNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '';
  return decimals > 0 ? String(Number(n.toFixed(decimals))) : String(Math.round(n));
}
