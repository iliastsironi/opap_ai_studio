/**
 * What a money field should do when you click into it.
 *
 * A field sitting at «0» or «0.00» made you delete it before you could type.
 * Every figure on a closing screen starts that way, so every entry began with
 * a backspace - and a half-deleted «0.0» left behind is a figure nobody meant.
 *
 * A zero carries no information here: an empty money field already reads as
 * nothing throughout this app. So a zero is cleared outright and anything
 * else is selected, which lets you overwrite it in one keystroke while a
 * figure you clicked into by mistake survives being clicked away from.
 */

/** True when `text` says «nothing», in any of the ways it can say it. */
export function isZeroText(text: string | number | null | undefined): boolean {
  if (text === null || text === undefined) return true;
  const trimmed = String(text).trim();
  if (trimmed === '') return true;
  // A lone sign or separator is somebody mid-typing, not a zero.
  if (!/^-?[0-9]*[.,]?[0-9]*$/.test(trimmed)) return false;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) && n === 0;
}

export type FocusAction = 'clear' | 'select';

export function focusAction(text: string | number | null | undefined): FocusAction {
  return isZeroText(text) ? 'clear' : 'select';
}
