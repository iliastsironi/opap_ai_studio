export interface VltReconciliationItem {
  id?: string;
  storeId?: string | null;
  date: string;
  opapnetAmount: number;
  countedAmount: number;
  difference: number;
  status: 'BALANCED' | 'DISCREPANCY' | 'PENDING';
}

export type VltReconciliationRecord = VltReconciliationItem;

export interface WeeklyRosterStore {
  storeId: string;
  storeName: string;
  schedule: Array<{
    shift: string;
    // Optional required role for this shift row (a SYSTEM_ROLES code, e.g.
    // 'EMPLOYEE'). Absent/empty means no role requirement - keeps every
    // roster saved before this field existed valid as-is.
    role?: string;
    mon: string;
    tue: string;
    wed: string;
    thu: string;
    fri: string;
    sat: string;
    sun: string;
  }>;
}

export interface EmployeeKPI {
  employeeId: string;
  employeeName: string;
  storeId: string;
  storeName: string;
  totalShifts: number;
  totalHours: number;
  scratchTurnover: number;
  scratchPerHour: number;
  fnbTurnover: number;
  cancellationRate: number; // %
  totalDiscrepancy: number; // €
  discrepantShiftsCount: number;
  reliabilityScore: number; // 0-100%
  activeCreditsGiven: number;
  creditsCollected: number;
  avgShiftClosingSpeedMinutes: number;
}

export interface ShiftKPI {
  shiftType: 'MORNING' | 'AFTERNOON' | 'NIGHT';
  shiftTypeName: string;
  avgRevenue: number;
  avgOpapSales: number;
  avgVltNet: number;
  avgFnbSales: number;
  cashRatio: number; // %
  posRatio: number; // %
  avgDiscrepancy: number;
  avgExpensesToRevenue: number; // %
  // Absent unless something real derives it. Nothing does today: peak hour was
  // only ever supplied by the sample rows, so a card simply omits the line
  // rather than showing an invented time window.
  peakHour?: string;
}
