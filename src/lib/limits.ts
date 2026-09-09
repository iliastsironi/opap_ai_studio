/**
 * Shared numeric ceilings for the app's financial inputs.
 * These are typo guards, not tight business limits: generous enough that no
 * legitimate single-shift value should ever approach them, while still
 * catching an obvious fat-fingered extra digit or a pasted garbage value.
 */

/** Max piece-count for a single physical denomination (banknotes/coins) in the cash counter. */
export const MAX_DENOMINATION_QUANTITY = 999;

/** Max value for a single euro-amount field (sales, meters, expenses, etc.). */
export const MAX_CURRENCY_AMOUNT = 99999.99;

/**
 * Parses a field as a non-negative decimal amount, bounded by `max`. Empty/
 * undefined -> 0 (matches parseNonNegativeInt's convention for empty
 * fields). Negatives, non-numeric strings, and anything over `max` all
 * report as invalid so the caller can surface a clear Greek validation
 * error instead of silently coercing or clamping them.
 */
export function parseNonNegativeAmount(
  raw: string | number | undefined,
  max: number = MAX_CURRENCY_AMOUNT
): { value: number; isValid: boolean } {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { value: 0, isValid: true };
  }
  const str = String(raw).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) {
    return { value: 0, isValid: false };
  }
  const n = parseFloat(str);
  return { value: n, isValid: Number.isFinite(n) && n >= 0 && n <= max };
}
