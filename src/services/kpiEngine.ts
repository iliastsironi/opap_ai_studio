import { Shift } from '../types/index.ts';
import { EmployeeKPI, ShiftKPI, VltReconciliationRecord } from '../data/pnlData.ts';

// The display name for each shift type. These are UI labels, not data - the
// figures beside them are always computed from real shifts.
const SHIFT_TYPE_NAMES: Record<ShiftKPI['shiftType'], string> = {
  MORNING: 'Πρωινή Βάρδια (8:00 - 16:00)',
  AFTERNOON: 'Απογευματινή Βάρδια (16:00 - 00:00 / 02:00)',
  NIGHT: 'Βραδινή / Play Hall (00:00 - 04:00)',
};

export interface DynamicKpiEngineInput {
  shifts: Shift[];
  vltReconciliations: VltReconciliationRecord[];
}

export interface DynamicFinancialData {
  employeeKpis: EmployeeKPI[];
  shiftKpis: ShiftKPI[];
  vltReconciliations: VltReconciliationRecord[];
  totals: {
    shiftTurnover: number;
    totalDiscrepancy: number;
    shrinkageRate: number;
  };
}

/**
 * Computes Employee KPIs, Shift KPIs and cash-discrepancy totals from raw shifts.
 * The monthly P&L is computed separately by src/lib/pnlEngine.ts.
 */
export function computeDynamicFinancials(input: DynamicKpiEngineInput): DynamicFinancialData {
  const { shifts = [], vltReconciliations = [] } = input;

  // -----------------------------------------------------------------
  // 1. DYNAMIC EMPLOYEE KPIS
  // -----------------------------------------------------------------
  const employeeMap: Record<string, EmployeeKPI> = {};

  shifts.forEach((shift) => {
    const empId = shift.closed_by_user_id || shift.opened_by_user_id || 'emp_default';
    const empName = shift.closed_by_user_name || shift.opened_by_user_name || 'Εργαζόμενος';

    if (!employeeMap[empId]) {
      employeeMap[empId] = {
        employeeId: empId,
        employeeName: empName,
        storeId: shift.store_id || '100343',
        storeName: shift.store_name || '100343 (ΟΠΑΠ)',
        totalShifts: 0,
        totalHours: 0,
        scratchTurnover: 0,
        scratchPerHour: 0,
        fnbTurnover: 0,
        cancellationRate: 0,
        totalDiscrepancy: 0,
        discrepantShiftsCount: 0,
        reliabilityScore: 100,
        activeCreditsGiven: 0,
        creditsCollected: 0,
        avgShiftClosingSpeedMinutes: 12,
      };
    }

    const emp = employeeMap[empId];
    emp.totalShifts += 1;

    // Estimate shift hours from duration or standard 8h
    let hours = 8;
    if (shift.opened_at && shift.closed_at) {
      const diffMs = new Date(shift.closed_at).getTime() - new Date(shift.opened_at).getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours > 0.5 && diffHours < 24) {
        hours = Math.round(diffHours * 10) / 10;
      }
    }
    emp.totalHours += hours;

    const scratch = Number(shift.scratch_lotto_sales || shift.scratch_sales || 0);
    emp.scratchTurnover += scratch;

    const fnb = Number(shift.fnb_sales || shift.fnb_cash || 0);
    emp.fnbTurnover += fnb;

    const disc = Number(shift.discrepancy || 0);
    emp.totalDiscrepancy += disc;
    if (Math.abs(disc) >= 1.0) {
      emp.discrepantShiftsCount += 1;
    }

    emp.activeCreditsGiven += Number(shift.customer_credit_granted || 0);
    emp.creditsCollected += Number(shift.customer_credit_collected || 0);
  });

  // Calculate ratios per employee
  const calculatedEmployeeKpis: EmployeeKPI[] = Object.values(employeeMap).map((emp) => {
    const scratchPerHour = emp.totalHours > 0 ? Math.round((emp.scratchTurnover / emp.totalHours) * 100) / 100 : 0;
    const discRatio = emp.totalShifts > 0 ? (emp.discrepantShiftsCount / emp.totalShifts) : 0;
    const reliability = Math.max(80, Math.min(100, Math.round(100 - (discRatio * 20) - (Math.abs(emp.totalDiscrepancy) / 50))));

    return {
      ...emp,
      scratchPerHour,
      reliabilityScore: reliability,
      totalDiscrepancy: Math.round(emp.totalDiscrepancy * 100) / 100,
    };
  });

  // No shifts means no KPIs. An empty table says that truthfully; invented
  // rows would be indistinguishable from real ones once real shifts exist.
  const finalEmployeeKpis = calculatedEmployeeKpis;

  // -----------------------------------------------------------------
  // 2. DYNAMIC SHIFT KPIS (MORNING vs AFTERNOON vs NIGHT)
  // -----------------------------------------------------------------
  const shiftTypeTotals: Record<string, {
    count: number;
    revenue: number;
    opap: number;
    vlt: number;
    fnb: number;
    cash: number;
    pos: number;
    discrepancy: number;
    expenses: number;
  }> = {
    MORNING: { count: 0, revenue: 0, opap: 0, vlt: 0, fnb: 0, cash: 0, pos: 0, discrepancy: 0, expenses: 0 },
    AFTERNOON: { count: 0, revenue: 0, opap: 0, vlt: 0, fnb: 0, cash: 0, pos: 0, discrepancy: 0, expenses: 0 },
    NIGHT: { count: 0, revenue: 0, opap: 0, vlt: 0, fnb: 0, cash: 0, pos: 0, discrepancy: 0, expenses: 0 },
  };

  shifts.forEach((shift) => {
    const type = (shift.shift_type || 'MORNING').toUpperCase();
    const target = shiftTypeTotals[type] || shiftTypeTotals.MORNING;

    const opap = Number(shift.opap_gross_sales || 0);
    const vlt = Number(shift.vlts_net || (Number(shift.vlts_cash_in || 0) - Number(shift.vlts_cash_out || 0)));
    const fnb = Number(shift.fnb_sales || 0);
    const pos = Number(shift.card_payments || 0);
    const countedCash = Number(shift.counted_cash || 0);
    const disc = Number(shift.discrepancy || 0);
    const exp = Number(shift.expenses_paid_cash || 0);

    target.count += 1;
    target.opap += opap;
    target.vlt += Math.max(0, vlt);
    target.fnb += fnb;
    target.revenue += (opap + Math.max(0, vlt) + fnb);
    target.pos += pos;
    target.cash += countedCash;
    target.discrepancy += disc;
    target.expenses += exp;
  });

  // One card per shift type that actually ran. A type with no shifts is left
  // out entirely rather than shown with placeholder figures.
  const finalShiftKpis: ShiftKPI[] = (Object.keys(shiftTypeTotals) as Array<ShiftKPI['shiftType']>)
    .filter((shiftType) => shiftTypeTotals[shiftType].count > 0)
    .map((shiftType) => {
      const data = shiftTypeTotals[shiftType];
      const totalPay = data.cash + data.pos;
      return {
        shiftType,
        shiftTypeName: SHIFT_TYPE_NAMES[shiftType],
        avgRevenue: Math.round((data.revenue / data.count) * 100) / 100,
        avgOpapSales: Math.round((data.opap / data.count) * 100) / 100,
        avgVltNet: Math.round((data.vlt / data.count) * 100) / 100,
        avgFnbSales: Math.round((data.fnb / data.count) * 100) / 100,
        // No cash and no card means there is no split to report, not a 0/0 one.
        cashRatio: totalPay > 0 ? Math.round((data.cash / totalPay) * 100) : 0,
        posRatio: totalPay > 0 ? Math.round((data.pos / totalPay) * 100) : 0,
        avgDiscrepancy: Math.round((data.discrepancy / data.count) * 100) / 100,
        avgExpensesToRevenue: data.revenue > 0 ? Math.round((data.expenses / data.revenue) * 1000) / 10 : 0,
      };
    });

  // -----------------------------------------------------------------
  // 3. CASH DISCREPANCY vs SHIFT TURNOVER (Shrinkage)
  // -----------------------------------------------------------------
  const shiftTurnover = shifts.reduce((sum, shift) => {
    const opapNet = Number(shift.opap_gross_sales || 0) - Number(shift.opap_payouts || 0);
    const scratchSales = Number(shift.scratch_lotto_sales || shift.scratch_sales || 0);
    const vltIn = Number(shift.vlts_cash_in || 0);
    const vltOut = Number(shift.vlts_cash_out || 0);
    const vltNet = shift.vlts_net !== undefined ? Number(shift.vlts_net) : Math.max(0, vltIn - vltOut);
    const fnbSales = Number(shift.fnb_sales || shift.fnb_cash || 0);
    return sum + Math.max(0, opapNet + scratchSales + vltNet + fnbSales);
  }, 0);

  const totalDiscrepancySum = shifts.reduce((sum, s) => sum + Number(s.discrepancy || 0), 0);
  const shrinkageRate = shiftTurnover > 0 ? (Math.abs(totalDiscrepancySum) / shiftTurnover) * 100 : 0;

  return {
    employeeKpis: finalEmployeeKpis,
    shiftKpis: finalShiftKpis,
    vltReconciliations,
    totals: {
      shiftTurnover: Math.round(shiftTurnover * 100) / 100,
      totalDiscrepancy: Math.round(totalDiscrepancySum * 100) / 100,
      shrinkageRate: Math.round(shrinkageRate * 1000) / 1000,
    },
  };
}
