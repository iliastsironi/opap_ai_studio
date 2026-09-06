export interface ExpectedCashInput {
  opening_cash?: number | string | null;
  opap_gross_sales?: number | string | null;
  opap_payouts?: number | string | null;
  vouchers?: number | string | null;
  cancellations?: number | string | null;
  pame_stoixima?: number | string | null;
  pame_stoixima_balance?: number | string | null;
  vlts_cash_in?: number | string | null;
  vlts_cash_out?: number | string | null;
  scratch_lotto_sales?: number | string | null;
  tora_pos?: number | string | null;
  clever_point?: number | string | null;
  fnb_cash?: number | string | null;
  fnb_sales?: number | string | null;
  customer_credit_collected?: number | string | null;
  card_payments?: number | string | null;
  expenses_paid_cash?: number | string | null;
  customer_credit_granted?: number | string | null;
  bank_deposits?: number | string | null;
}

export interface DiscrepancyResult {
  countedCash: number;
  expectedCash: number;
  discrepancy: number;
  discrepancyPercentage: number;
  isUnbalanced: boolean;
  isExceedingThreshold: boolean;
}

export const EUR_DENOMINATIONS = [
  { key: '500', value: 500, label: '500 €' },
  { key: '200', value: 200, label: '200 €' },
  { key: '100', value: 100, label: '100 €' },
  { key: '50', value: 50, label: '50 €' },
  { key: '20', value: 20, label: '20 €' },
  { key: '10', value: 10, label: '10 €' },
  { key: '5', value: 5, label: '5 €' },
  { key: '2', value: 2, label: '2 €' },
  { key: '1', value: 1, label: '1 €' },
  { key: '0.50', value: 0.5, label: '0,50 €' },
  { key: '0.20', value: 0.2, label: '0,20 €' },
  { key: '0.10', value: 0.1, label: '0,10 €' },
] as const;

/**
  Safely parses a number, returning 0 for null, undefined, NaN, or non-numeric values.
 */
export function safeNum(val: number | string | null | undefined): number {
  if (val === null || val === undefined || val === '') return 0;
  const parsed = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}

/**
  Returns the first candidate that actually has a value (a real 0 counts),
  only falling through when every candidate is genuinely missing.
  `Number(field) || fallback` treats a real 0 as falsy and silently
  substitutes a wrong non-zero number instead — this avoids that bug.
 */
export function pickNum(...vals: Array<number | string | null | undefined>): number {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== '') return safeNum(v);
  }
  return 0;
}

/**
  Rounds a number to 2 decimal places to prevent floating-point precision issues.
 */
export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
  Calculates total counted cash from a dictionary of denomination quantities.
 */
export function calculateCountedCash(
  denominations?: Record<string, number | string | null | undefined>
): number {
  if (!denominations || typeof denominations !== 'object') return 0;

  let total = 0;
  for (const denom of EUR_DENOMINATIONS) {
    const rawCount = denominations[denom.key];
    const count = Math.max(0, Math.floor(safeNum(rawCount)));
    total += count * denom.value;
  }

  return roundCurrency(total);
}

/**
  Calculates the expected revenue / cash requirement for shift closing.
  Formula requested:
  Αναμενόμενο = (Αριθμοπαιχνίδια ΟΠΑΠ - OPAP Payouts) + Scratch & Λαχεία + TORA DIRECT + Cleverpoint + VLTs Cash-In + VLTs Cash-Out + FnB
 */
export function calculateExpectedCash(input: ExpectedCashInput): number {
  const arithmoNet = safeNum(input.opap_gross_sales) 
    - safeNum(input.opap_payouts) 
    + safeNum(input.vouchers) 
    - safeNum(input.cancellations);
  const scratch = safeNum(input.scratch_lotto_sales);
  const tora = safeNum(input.tora_pos);
  const clever = safeNum(input.clever_point);
  const vltsIn = safeNum(input.vlts_cash_in);
  const vltsOut = safeNum(input.vlts_cash_out);
  const pameStoixima = safeNum(input.pame_stoixima) || safeNum(input.pame_stoixima_balance);
  const fnb = safeNum(input.fnb_cash) || safeNum(input.fnb_sales);

  const expected = arithmoNet + scratch + tora + clever + vltsIn + vltsOut + pameStoixima + fnb;
  return roundCurrency(expected);
}

/**
  Computes cash discrepancy, discrepancy percentage, and threshold alert status.
  Formula: Διαφορά = Σύνολο Καταμέτρησης - Σύνολο Αναφοράς (Expected Cash)
 */
export function calculateDiscrepancy(
  countedCash: number | string | null | undefined,
  expectedCash: number | string | null | undefined,
  threshold = 10.0
): DiscrepancyResult {
  const counted = safeNum(countedCash);
  const expected = safeNum(expectedCash);

  const discrepancy = roundCurrency(counted - expected);

  let discrepancyPercentage = 0;
  if (Math.abs(expected) > 0.0001) {
    discrepancyPercentage = roundCurrency((discrepancy / Math.abs(expected)) * 100);
  } else if (Math.abs(discrepancy) > 0.0001) {
    discrepancyPercentage = 100;
  }

  const isUnbalanced = Math.abs(discrepancy) > 0.001;
  const isExceedingThreshold = Math.abs(discrepancy) > safeNum(threshold);

  return {
    countedCash: counted,
    expectedCash: expected,
    discrepancy,
    discrepancyPercentage,
    isUnbalanced,
    isExceedingThreshold,
  };
}

export interface TotalReconciliationInput {
  openingCash?: number | string | null | undefined;
  countedCashInDrawer: number | string | null | undefined;
  posSalesTotal: number | string | null | undefined;
  expensesTotal: number | string | null | undefined;
  bankDeposits?: number | string | null | undefined;
  customerCreditsGranted: number | string | null | undefined;
  customerReturns: number | string | null | undefined;
}

export interface ReconciliationBreakdownResult {
  drawerCash: number;
  posSales: number;
  expenses: number;
  deposits: number;
  creditsGranted: number;
  creditCollected: number;
  grossTotal: number;
  openingCash: number;
  netTotal: number;
}

/**
  Calculates full reconciliation breakdown:
  - grossTotal (Σύνολο Ταμείου): Μετρητά + POS + Έξοδα + Χρηματοκιβώτιο/Καταθέσεις + Πιστώσεις - Επιστροφές
  - netTotal (Σύνολο Καταμέτρησης): grossTotal - Αρχικό Κεφάλαιο
 */
export function calculateReconciliationBreakdown(input: TotalReconciliationInput): ReconciliationBreakdownResult {
  const drawerCash = safeNum(input.countedCashInDrawer);
  const posSales = safeNum(input.posSalesTotal);
  const expenses = safeNum(input.expensesTotal);
  const deposits = safeNum(input.bankDeposits);
  const creditsGranted = safeNum(input.customerCreditsGranted);
  const creditCollected = safeNum(input.customerReturns);
  const opening = safeNum(input.openingCash);

  const grossTotal = roundCurrency(
    drawerCash + posSales + expenses + deposits + creditsGranted - creditCollected
  );
  const netTotal = roundCurrency(grossTotal - opening);

  return {
    drawerCash,
    posSales,
    expenses,
    deposits,
    creditsGranted,
    creditCollected,
    grossTotal,
    openingCash: opening,
    netTotal,
  };
}

/**
  Calculates "Σύνολο Καταμέτρησης" (Grand Reconciliation Total):
  (Καταμετρητής Χαρτονομισμάτων & Κερμάτων) + (POS) + expenses_paid_cash + bank_deposits + customer_credit_granted - customer_credit_collected - opening_cash
 */
export function calculateTotalReconciliationCount(input: TotalReconciliationInput): number {
  const breakdown = calculateReconciliationBreakdown(input);
  return breakdown.netTotal;
}

/**
  Calculates separate totals for banknotes and coins from a denomination count object.
 */
export function calculateBanknotesAndCoins(
  denominations?: Record<string, number | string | null | undefined>
): { banknotes: number; coins: number; total: number } {
  if (!denominations || typeof denominations !== 'object') {
    return { banknotes: 0, coins: 0, total: 0 };
  }
  let banknotes = 0;
  let coins = 0;
  for (const denom of EUR_DENOMINATIONS) {
    const count = Math.max(0, Math.floor(safeNum(denominations[denom.key])));
    if (denom.value >= 5) {
      banknotes += count * denom.value;
    } else {
      coins += count * denom.value;
    }
  }
  return {
    banknotes: roundCurrency(banknotes),
    coins: roundCurrency(coins),
    total: roundCurrency(banknotes + coins),
  };
}
