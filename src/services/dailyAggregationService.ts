import { Shift } from '../types/index.ts';
import { safeNum, roundCurrency } from './financialCalculator.ts';

export interface ShiftContributionSummary {
  shiftId: string;
  shiftType: string;
  registerId: string;
  openedBy: string;
  openedAt: string;
  closedBy?: string;
  closedAt?: string;
  status: string;
  openingCash: number;
  countedCash: number;
  expectedCash: number;
  discrepancy: number;
  opapGross: number;
  opapPayouts: number;
  opapNet: number;
  vltsCashIn: number;
  vltsCashOut: number;
  vltsNet: number;
  scratchSales: number;
  toraPos: number;
  cleverPoint: number;
  fnbSales: number;
  fnbCash: number;
  fnbCard: number;
  cardPayments: number;
  expenses: number;
  creditGranted: number;
  creditCollected: number;
  bankDeposits: number;
}

export interface RegisterDailySummary {
  registerId: string;
  shiftsCount: number;
  firstShiftOpeningCash: number;
  lastShiftClosingCash: number;
  totalShiftDiscrepancy: number;
  shifts: ShiftContributionSummary[];
}

export interface DailyAggregatedReport {
  date: string; // YYYY-MM-DD
  formattedDate: string; // e.g. 02/09/2026
  storeId: string;
  storeName: string;
  totalShiftsCount: number;
  registersCount: number;
  registers: Record<string, RegisterDailySummary>;
  shiftContributions: ShiftContributionSummary[];

  // Non-Double-Counted Cash Drawer Balances
  // True Initial Float = sum of first shift opening cash for each active register
  initialOpeningCash: number;
  // True Final Drawer Cash = sum of last shift counted cash for each active register
  finalCountedCash: number;
  
  // Total Bank/Safe Outflows made across all shifts during the day
  totalBankDeposits: number;

  // Additive Activity Flows
  totalOpapGross: number;
  totalOpapPayouts: number;
  totalOpapNet: number;
  totalVltsCashIn: number;
  totalVltsCashOut: number;
  totalVltsNet: number;
  totalScratchSales: number;
  totalToraPos: number;
  totalCleverPoint: number;
  totalFnbSales: number;
  totalFnbCash: number;
  totalFnbCard: number;
  totalCardPayments: number;
  totalExpensesPaidCash: number;
  totalCreditGranted: number;
  totalCreditCollected: number;

  // Daily Totals & Cash Reconciliation
  totalGrossTurnover: number; // OPAP Gross + VLTs In + Scratch + Tora + Clever + FnB
  totalNetCashActivity: number; // Net cash inflows/outflows produced during the day
  dailyExpectedClosingDrawer: number; // initialOpeningCash + netCashActivity - totalBankDeposits
  dailyExpectedCashRevenue: number; // Expected sales volume (sum of net expected)
  dailyDiscrepancy: number; // finalCountedCash - dailyExpectedClosingDrawer
  isDiscrepancyExceeded: boolean;

  // Status Summary
  allApproved: boolean;
  hasPendingApproval: boolean;
  hasOpenShifts: boolean;
}

/**
 * Extracts a normalized date string (YYYY-MM-DD) from ISO timestamp
 */
export function getShiftDateKey(isoDateStr?: string): string {
  if (!isoDateStr) return new Date().toISOString().split('T')[0];
  try {
    const d = new Date(isoDateStr);
    return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Formats YYYY-MM-DD date to Greek localized date string
 */
export function formatGreekDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-');
    if (y && m && d) {
      const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
      return dateObj.toLocaleDateString('el-GR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Core Daily Report Aggregation Algorithm:
 * Automatically aggregates all shifts for a specific date and store,
 * strictly preventing double-counting of initial and final balances.
 */
export function aggregateShiftsForDay(
  shifts: Shift[],
  targetDate?: string,
  storeId?: string
): DailyAggregatedReport {
  const selectedDate = targetDate || getShiftDateKey();

  // Filter shifts belonging to this day (using opened_at or closed_at)
  let dayShifts = shifts.filter((s) => {
    const shiftDate = getShiftDateKey(s.opened_at || s.created_at);
    return shiftDate === selectedDate;
  });

  if (storeId && storeId !== 'ALL') {
    dayShifts = dayShifts.filter((s) => s.store_id === storeId);
  }

  // Sort shifts chronologically (earliest first)
  dayShifts.sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());

  const storeName = dayShifts[0]?.store_name || (storeId === 'ALL' ? 'Όλα τα Καταστήματα' : 'Κατάστημα');

  // Group shifts by register to determine true initial and final drawer balances
  const registersMap: Record<string, Shift[]> = {};
  for (const s of dayShifts) {
    const reg = s.register_id || 'REG-01';
    if (!registersMap[reg]) {
      registersMap[reg] = [];
    }
    registersMap[reg].push(s);
  }

  let initialOpeningCash = 0;
  let finalCountedCash = 0;
  const registers: Record<string, RegisterDailySummary> = {};

  // For each register:
  // 1. Initial Opening Cash = Opening Cash of the 1st shift of the day for that register
  // 2. Final Counted Cash = Counted Cash of the LAST closed/current shift of the day for that register
  for (const [regId, regShifts] of Object.entries(registersMap)) {
    const sorted = [...regShifts].sort(
      (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()
    );

    const firstShift = sorted[0];
    const lastShift = sorted[sorted.length - 1];

    const regFirstOpening = safeNum(firstShift?.opening_cash);
    // If the last shift is closed or counted, use its counted_cash; otherwise use its current counted_cash
    const regLastCounted = safeNum(lastShift?.counted_cash);

    initialOpeningCash += regFirstOpening;
    finalCountedCash += regLastCounted;

    let regDiscrepancySum = 0;
    const shiftContribs: ShiftContributionSummary[] = sorted.map((s) => {
      const opapGross = safeNum(s.opap_gross_sales);
      const opapPayouts = safeNum(s.opap_payouts);
      const opapNet = safeNum(s.opap_net_sales) || opapGross - opapPayouts;
      const vltsIn = safeNum(s.vlts_cash_in);
      const vltsOut = safeNum(s.vlts_cash_out);
      const vltsNet = safeNum(s.vlts_net) || vltsIn - vltsOut;
      const scratchSales = safeNum(s.scratch_lotto_sales) || safeNum(s.scratch_sales);
      const toraPos = safeNum(s.tora_total) || (safeNum(s.tora_pos1) + safeNum(s.tora_pos2) + safeNum(s.tora_pos_1) + safeNum(s.tora_pos_2)) || safeNum(s.custom_field_values?.tora_pos);
      const cleverPoint = safeNum(s.clever_point_total) || safeNum(s.custom_field_values?.clever_point);
      const fnbSales = safeNum(s.fnb_sales);
      const fnbCash = safeNum(s.fnb_cash);
      const fnbCard = safeNum(s.fnb_card);
      const cardPayments = safeNum(s.card_payments);
      const expenses = safeNum(s.expenses_paid_cash);
      const creditGranted = safeNum(s.customer_credit_granted);
      const creditCollected = safeNum(s.customer_credit_collected);
      const bankDeposits = safeNum(s.bank_deposits);
      const discrepancy = safeNum(s.discrepancy);

      regDiscrepancySum += discrepancy;

      return {
        shiftId: s.id,
        shiftType: s.shift_type,
        registerId: s.register_id || 'REG-01',
        openedBy: s.opened_by_user_name || 'Υπάλληλος',
        openedAt: s.opened_at,
        closedBy: s.closed_by_user_name,
        closedAt: s.closed_at,
        status: s.status,
        openingCash: safeNum(s.opening_cash),
        countedCash: safeNum(s.counted_cash),
        expectedCash: safeNum(s.expected_cash),
        discrepancy,
        opapGross,
        opapPayouts,
        opapNet,
        vltsCashIn: vltsIn,
        vltsCashOut: vltsOut,
        vltsNet,
        scratchSales,
        toraPos,
        cleverPoint,
        fnbSales,
        fnbCash,
        fnbCard,
        cardPayments,
        expenses,
        creditGranted,
        creditCollected,
        bankDeposits,
      };
    });

    registers[regId] = {
      registerId: regId,
      shiftsCount: regShifts.length,
      firstShiftOpeningCash: roundCurrency(regFirstOpening),
      lastShiftClosingCash: roundCurrency(regLastCounted),
      totalShiftDiscrepancy: roundCurrency(regDiscrepancySum),
      shifts: shiftContribs,
    };
  }

  // Accumulate additive sales and flows across ALL shifts of the day
  let totalOpapGross = 0;
  let totalOpapPayouts = 0;
  let totalOpapNet = 0;
  let totalVltsCashIn = 0;
  let totalVltsCashOut = 0;
  let totalVltsNet = 0;
  let totalScratchSales = 0;
  let totalToraPos = 0;
  let totalCleverPoint = 0;
  let totalFnbSales = 0;
  let totalFnbCash = 0;
  let totalFnbCard = 0;
  let totalCardPayments = 0;
  let totalExpensesPaidCash = 0;
  let totalCreditGranted = 0;
  let totalCreditCollected = 0;
  let totalBankDeposits = 0;
  let totalShiftDiscrepancies = 0;

  const allShiftContributions: ShiftContributionSummary[] = [];

  let allApproved = dayShifts.length > 0;
  let hasPendingApproval = false;
  let hasOpenShifts = false;

  for (const s of dayShifts) {
    if (s.status !== 'APPROVED') allApproved = false;
    if (s.status === 'SUBMITTED') hasPendingApproval = true;
    if (['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'].includes(s.status)) {
      hasOpenShifts = true;
    }

    const opapGross = safeNum(s.opap_gross_sales);
    const opapPayouts = safeNum(s.opap_payouts);
    const opapNet = safeNum(s.opap_net_sales) || opapGross - opapPayouts;
    const vltsIn = safeNum(s.vlts_cash_in);
    const vltsOut = safeNum(s.vlts_cash_out);
    const vltsNet = safeNum(s.vlts_net) || vltsIn - vltsOut;
    const scratchSales = safeNum(s.scratch_lotto_sales) || safeNum(s.scratch_sales);
    const toraPos = safeNum(s.tora_total) || (safeNum(s.tora_pos1) + safeNum(s.tora_pos2) + safeNum(s.tora_pos_1) + safeNum(s.tora_pos_2)) || safeNum(s.custom_field_values?.tora_pos);
    const cleverPoint = safeNum(s.clever_point_total) || safeNum(s.custom_field_values?.clever_point);
    const fnbSales = safeNum(s.fnb_sales);
    const fnbCash = safeNum(s.fnb_cash);
    const fnbCard = safeNum(s.fnb_card);
    const cardPayments = safeNum(s.card_payments);
    const expenses = safeNum(s.expenses_paid_cash);
    const creditGranted = safeNum(s.customer_credit_granted);
    const creditCollected = safeNum(s.customer_credit_collected);
    const bankDeposits = safeNum(s.bank_deposits);
    const discrepancy = safeNum(s.discrepancy);

    totalOpapGross += opapGross;
    totalOpapPayouts += opapPayouts;
    totalOpapNet += opapNet;
    totalVltsCashIn += vltsIn;
    totalVltsCashOut += vltsOut;
    totalVltsNet += vltsNet;
    totalScratchSales += scratchSales;
    totalToraPos += toraPos;
    totalCleverPoint += cleverPoint;
    totalFnbSales += fnbSales;
    totalFnbCash += fnbCash;
    totalFnbCard += fnbCard;
    totalCardPayments += cardPayments;
    totalExpensesPaidCash += expenses;
    totalCreditGranted += creditGranted;
    totalCreditCollected += creditCollected;
    totalBankDeposits += bankDeposits;
    totalShiftDiscrepancies += discrepancy;

    allShiftContributions.push({
      shiftId: s.id,
      shiftType: s.shift_type,
      registerId: s.register_id || 'REG-01',
      openedBy: s.opened_by_user_name || 'Υπάλληλος',
      openedAt: s.opened_at,
      closedBy: s.closed_by_user_name,
      closedAt: s.closed_at,
      status: s.status,
      openingCash: safeNum(s.opening_cash),
      countedCash: safeNum(s.counted_cash),
      expectedCash: safeNum(s.expected_cash),
      discrepancy,
      opapGross,
      opapPayouts,
      opapNet,
      vltsCashIn: vltsIn,
      vltsCashOut: vltsOut,
      vltsNet,
      scratchSales,
      toraPos,
      cleverPoint,
      fnbSales,
      fnbCash,
      fnbCard,
      cardPayments,
      expenses,
      creditGranted,
      creditCollected,
      bankDeposits,
    });
  }

  // Gross Turnover (Total business volume)
  const totalGrossTurnover = roundCurrency(
    totalOpapGross + totalVltsCashIn + totalScratchSales + totalToraPos + totalCleverPoint + totalFnbSales
  );

  // Net Cash Generated (Inflows - Cash Payouts - Cash Expenses + Credit Collected - Credit Granted)
  const totalNetCashActivity = roundCurrency(
    totalOpapNet +
      totalVltsNet +
      totalScratchSales +
      totalToraPos +
      totalCleverPoint +
      totalFnbCash +
      totalCreditCollected -
      totalCreditGranted -
      totalExpensesPaidCash
  );

  // Expected Closing Drawer = True Initial Float + Net Cash Activity - Midday Bank Deposits/Drops
  const dailyExpectedClosingDrawer = roundCurrency(
    initialOpeningCash + totalNetCashActivity - totalBankDeposits
  );

  const dailyExpectedCashRevenue = roundCurrency(totalNetCashActivity);

  // Daily Discrepancy = Final Counted Cash - Expected Closing Cash
  const dailyDiscrepancy = roundCurrency(finalCountedCash - dailyExpectedClosingDrawer);
  const isDiscrepancyExceeded = Math.abs(dailyDiscrepancy) > 15;

  return {
    date: selectedDate,
    formattedDate: formatGreekDate(selectedDate),
    storeId: storeId || 'store_opap_01',
    storeName,
    totalShiftsCount: dayShifts.length,
    registersCount: Object.keys(registersMap).length,
    registers,
    shiftContributions: allShiftContributions,

    initialOpeningCash: roundCurrency(initialOpeningCash),
    finalCountedCash: roundCurrency(finalCountedCash),
    totalBankDeposits: roundCurrency(totalBankDeposits),

    totalOpapGross: roundCurrency(totalOpapGross),
    totalOpapPayouts: roundCurrency(totalOpapPayouts),
    totalOpapNet: roundCurrency(totalOpapNet),
    totalVltsCashIn: roundCurrency(totalVltsCashIn),
    totalVltsCashOut: roundCurrency(totalVltsCashOut),
    totalVltsNet: roundCurrency(totalVltsNet),
    totalScratchSales: roundCurrency(totalScratchSales),
    totalToraPos: roundCurrency(totalToraPos),
    totalCleverPoint: roundCurrency(totalCleverPoint),
    totalFnbSales: roundCurrency(totalFnbSales),
    totalFnbCash: roundCurrency(totalFnbCash),
    totalFnbCard: roundCurrency(totalFnbCard),
    totalCardPayments: roundCurrency(totalCardPayments),
    totalExpensesPaidCash: roundCurrency(totalExpensesPaidCash),
    totalCreditGranted: roundCurrency(totalCreditGranted),
    totalCreditCollected: roundCurrency(totalCreditCollected),

    totalGrossTurnover,
    totalNetCashActivity,
    dailyExpectedClosingDrawer,
    dailyExpectedCashRevenue,
    dailyDiscrepancy,
    isDiscrepancyExceeded,

    allApproved,
    hasPendingApproval,
    hasOpenShifts,
  };
}

/**
 * Groups all shifts into daily aggregated summaries
 */
export function groupShiftsByDayAndStore(
  shifts: Shift[],
  storeIdFilter: string = 'ALL'
): Record<string, DailyAggregatedReport> {
  const dateSet = new Set<string>();

  for (const s of shifts) {
    if (storeIdFilter !== 'ALL' && s.store_id !== storeIdFilter) continue;
    const dateKey = getShiftDateKey(s.opened_at || s.created_at);
    dateSet.add(dateKey);
  }

  // Sort dates descending (newest first)
  const sortedDates = Array.from(dateSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const reportsMap: Record<string, DailyAggregatedReport> = {};
  for (const date of sortedDates) {
    reportsMap[date] = aggregateShiftsForDay(shifts, date, storeIdFilter);
  }

  return reportsMap;
}

/**
 * Generates clean CSV export for the aggregated daily report
 */
export function exportDailyReportToCsv(report: DailyAggregatedReport): void {
  const headers = [
    'Ημερομηνία',
    'Κατάστημα',
    'Σύνολο Βαρδιών',
    'Αρχικό Ταμείο (1η Βάρδια)',
    'ΟΠΑΠ Μικτά (€)',
    'ΟΠΑΠ Πληρωμές (€)',
    'ΟΠΑΠ Καθαρά (€)',
    'VLTs Cash-In (€)',
    'VLTs Cash-Out (€)',
    'VLTs Καθαρά (€)',
    'Σκρατς & Λαχεία (€)',
    'TORA Direct (€)',
    'Clever Point (€)',
    'FnB Μετρητά (€)',
    'FnB Κάρτες (€)',
    'Συνολικές Πληρωμές Κάρτας/POS (€)',
    'Έξοδα Μετρητών (€)',
    'Πιστώσεις Πελατών (Χρέωση) (€)',
    'Εισπράξεις Πιστώσεων (€)',
    'Καταθέσεις / Χρηματοκιβώτιο (€)',
    'Καθαρή Ταμειακή Δραστηριότητα (€)',
    'Αναμενόμενο Τελικό Ταμείο (€)',
    'Πραγματικό Τελικό Ταμείο (Τελευταία Βάρδια) (€)',
    'Ημερήσια Απόκλιση (€)',
  ];

  const row = [
    `"${report.date}"`,
    `"${report.storeName}"`,
    report.totalShiftsCount,
    report.initialOpeningCash.toFixed(2),
    report.totalOpapGross.toFixed(2),
    report.totalOpapPayouts.toFixed(2),
    report.totalOpapNet.toFixed(2),
    report.totalVltsCashIn.toFixed(2),
    report.totalVltsCashOut.toFixed(2),
    report.totalVltsNet.toFixed(2),
    report.totalScratchSales.toFixed(2),
    report.totalToraPos.toFixed(2),
    report.totalCleverPoint.toFixed(2),
    report.totalFnbCash.toFixed(2),
    report.totalFnbCard.toFixed(2),
    report.totalCardPayments.toFixed(2),
    report.totalExpensesPaidCash.toFixed(2),
    report.totalCreditGranted.toFixed(2),
    report.totalCreditCollected.toFixed(2),
    report.totalBankDeposits.toFixed(2),
    report.totalNetCashActivity.toFixed(2),
    report.dailyExpectedClosingDrawer.toFixed(2),
    report.finalCountedCash.toFixed(2),
    report.dailyDiscrepancy.toFixed(2),
  ];

  let shiftRowsHeader = '\n\nΑΝΑΛΥΣΗ ΑΝΑ ΒΑΡΔΙΑ ΗΜΕΡΑΣ:\nΒάρδια,Ταμείο,Υπάλληλος,Έναρξη,Λήξη,Αρχικό,Καταμετρημένο,Αναμενόμενο,Απόκλιση,ΟΠΑΠ Καθαρά,VLTs Καθαρά,Σκρατς,Tora,FnB,Έξοδα,Καταθέσεις';
  const shiftRows = report.shiftContributions.map((s) => {
    return [
      `"${s.shiftType}"`,
      `"${s.registerId}"`,
      `"${s.openedBy}"`,
      `"${new Date(s.openedAt).toLocaleTimeString('el-GR')}"`,
      `"${s.closedAt ? new Date(s.closedAt).toLocaleTimeString('el-GR') : 'Σε Εξέλιξη'}"`,
      s.openingCash.toFixed(2),
      s.countedCash.toFixed(2),
      s.expectedCash.toFixed(2),
      s.discrepancy.toFixed(2),
      s.opapNet.toFixed(2),
      s.vltsNet.toFixed(2),
      s.scratchSales.toFixed(2),
      s.toraPos.toFixed(2),
      s.fnbSales.toFixed(2),
      s.expenses.toFixed(2),
      s.bankDeposits.toFixed(2),
    ].join(',');
  });

  const csvContent = '\uFEFF' + headers.join(',') + '\n' + row.join(',') + shiftRowsHeader + '\n' + shiftRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `daily_report_${report.date}_${report.storeId}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
