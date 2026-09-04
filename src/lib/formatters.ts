/**
 * Standard monetary and number formatters for ShiftLedger.
 * Mandate:
 * - € symbol
 * - Period as thousands separator (.)
 * - Comma as decimal separator (,)
 * - Exactly two decimals (e.g. €22.311,65)
 * With no exceptions app-wide.
 */

export function formatCurrency(
  amount: number | string | null | undefined,
  options?: {
    showSign?: boolean;
    alwaysShowSign?: boolean;
  }
): string {
  if (amount === null || amount === undefined || amount === '') {
    return '€0,00';
  }

  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(num)) {
    return '€0,00';
  }

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  // Greek locale 'el-GR' uses period (.) as thousands separator and comma (,) as decimal separator
  const formattedAbs = absNum.toLocaleString('el-GR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (isNegative) {
    return `-€${formattedAbs}`;
  }

  if ((options?.showSign || options?.alwaysShowSign) && num > 0) {
    return `+€${formattedAbs}`;
  }

  return `€${formattedAbs}`;
}

export function formatNumber(
  value: number | string | null | undefined,
  fractionDigits: number = 2
): string {
  if (value === null || value === undefined || value === '') {
    return '0,00';
  }
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) {
    return '0,00';
  }
  return num.toLocaleString('el-GR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
