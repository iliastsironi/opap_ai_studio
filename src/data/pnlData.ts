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
  peakHour: string;
}

export const VLT_RECONCILIATIONS_SAMPLE: VltReconciliationItem[] = [
  { date: '1/9/2024', opapnetAmount: 6880.00, countedAmount: 6880.00, difference: 0.00, status: 'BALANCED' },
  { date: '15/7/2024', opapnetAmount: 7405.00, countedAmount: 7405.00, difference: 0.00, status: 'BALANCED' },
  { date: '18/7/2024', opapnetAmount: 4665.00, countedAmount: 4665.00, difference: 0.00, status: 'BALANCED' },
  { date: '22/7/2024', opapnetAmount: 5560.00, countedAmount: 5560.00, difference: 0.00, status: 'BALANCED' },
  { date: '25/7/2024', opapnetAmount: 3670.00, countedAmount: 3670.00, difference: 0.00, status: 'BALANCED' },
  { date: '29/7/2024', opapnetAmount: 7800.00, countedAmount: 7800.00, difference: 0.00, status: 'BALANCED' },
];

export const EMPLOYEE_KPIS_SAMPLE: EmployeeKPI[] = [
  {
    employeeId: 'emp_2',
    employeeName: 'Μάκης Κουτσούμπας',
    storeId: '100343',
    storeName: '100343 (ΟΠΑΠ)',
    totalShifts: 26,
    totalHours: 208,
    scratchTurnover: 1420.00,
    scratchPerHour: 6.83,
    fnbTurnover: 450.00,
    cancellationRate: 0.28,
    totalDiscrepancy: +4.50,
    discrepantShiftsCount: 1,
    reliabilityScore: 98.5,
    activeCreditsGiven: 120.00,
    creditsCollected: 120.00,
    avgShiftClosingSpeedMinutes: 11,
  },
  {
    employeeId: 'emp_1',
    employeeName: 'Δημήτρης Φλώρος',
    storeId: '100343',
    storeName: '100343 (ΟΠΑΠ)',
    totalShifts: 25,
    totalHours: 200,
    scratchTurnover: 1180.00,
    scratchPerHour: 5.90,
    fnbTurnover: 380.00,
    cancellationRate: 0.35,
    totalDiscrepancy: -2.80,
    discrepantShiftsCount: 2,
    reliabilityScore: 96.0,
    activeCreditsGiven: 80.00,
    creditsCollected: 80.00,
    avgShiftClosingSpeedMinutes: 14,
  },
  {
    employeeId: 'emp_3',
    employeeName: 'Βαγγέλης Ντινόπουλος',
    storeId: '100343',
    storeName: '100343 (ΟΠΑΠ)',
    totalShifts: 22,
    totalHours: 176,
    scratchTurnover: 980.00,
    scratchPerHour: 5.56,
    fnbTurnover: 290.00,
    cancellationRate: 0.42,
    totalDiscrepancy: 0.00,
    discrepantShiftsCount: 0,
    reliabilityScore: 99.0,
    activeCreditsGiven: 50.00,
    creditsCollected: 50.00,
    avgShiftClosingSpeedMinutes: 12,
  },
  {
    employeeId: 'emp_4',
    employeeName: 'Νάντια Κολοβελώνη',
    storeId: '100343_FnB',
    storeName: '100343 FnB',
    totalShifts: 24,
    totalHours: 192,
    scratchTurnover: 0,
    scratchPerHour: 0,
    fnbTurnover: 2840.00,
    cancellationRate: 0.05,
    totalDiscrepancy: -1.20,
    discrepantShiftsCount: 1,
    reliabilityScore: 97.8,
    activeCreditsGiven: 0,
    creditsCollected: 0,
    avgShiftClosingSpeedMinutes: 9,
  },
  {
    employeeId: 'emp_6',
    employeeName: 'Άννα-Μαρία Κουτροζή',
    storeId: '100343_FnB',
    storeName: '100343 FnB',
    totalShifts: 25,
    totalHours: 200,
    scratchTurnover: 0,
    scratchPerHour: 0,
    fnbTurnover: 2513.10,
    cancellationRate: 0.08,
    totalDiscrepancy: +0.80,
    discrepantShiftsCount: 1,
    reliabilityScore: 98.2,
    activeCreditsGiven: 0,
    creditsCollected: 0,
    avgShiftClosingSpeedMinutes: 8,
  },
  {
    employeeId: 'emp_11',
    employeeName: 'Κριστίνα Τσιμπούκα',
    storeId: 'PlayOpap_400298',
    storeName: 'Play 400298',
    totalShifts: 26,
    totalHours: 208,
    scratchTurnover: 0,
    scratchPerHour: 0,
    fnbTurnover: 720.00,
    cancellationRate: 0.12,
    totalDiscrepancy: +5.00,
    discrepantShiftsCount: 1,
    reliabilityScore: 99.1,
    activeCreditsGiven: 200.00,
    creditsCollected: 200.00,
    avgShiftClosingSpeedMinutes: 10,
  },
  {
    employeeId: 'emp_12',
    employeeName: 'Σμαρώ Δινηκόλα',
    storeId: 'PlayOpap_400298',
    storeName: 'Play 400298',
    totalShifts: 26,
    totalHours: 208,
    scratchTurnover: 0,
    scratchPerHour: 0,
    fnbTurnover: 680.00,
    cancellationRate: 0.15,
    totalDiscrepancy: -4.00,
    discrepantShiftsCount: 2,
    reliabilityScore: 97.4,
    activeCreditsGiven: 150.00,
    creditsCollected: 150.00,
    avgShiftClosingSpeedMinutes: 11,
  },
  {
    employeeId: 'emp_9',
    employeeName: 'Τάσος Δραχτίδης',
    storeId: 'PlayOpap_400298',
    storeName: 'Play 400298',
    totalShifts: 25,
    totalHours: 200,
    scratchTurnover: 0,
    scratchPerHour: 0,
    fnbTurnover: 640.00,
    cancellationRate: 0.18,
    totalDiscrepancy: -1.50,
    discrepantShiftsCount: 1,
    reliabilityScore: 98.0,
    activeCreditsGiven: 100.00,
    creditsCollected: 100.00,
    avgShiftClosingSpeedMinutes: 13,
  },
];

export const SHIFT_KPIS_SAMPLE: ShiftKPI[] = [
  {
    shiftType: 'MORNING',
    shiftTypeName: 'Πρωινή Βάρδια (8:00 - 16:00)',
    avgRevenue: 1980.00,
    avgOpapSales: 1350.00,
    avgVltNet: 450.00,
    avgFnbSales: 180.00,
    cashRatio: 72,
    posRatio: 28,
    avgDiscrepancy: +0.40,
    avgExpensesToRevenue: 5.2,
    peakHour: '11:00 - 13:00 (ΚΙΝΟ & Σκρατς)',
  },
  {
    shiftType: 'AFTERNOON',
    shiftTypeName: 'Απογευματινή Βάρδια (16:00 - 00:00 / 02:00)',
    avgRevenue: 3450.00,
    avgOpapSales: 1950.00,
    avgVltNet: 1250.00,
    avgFnbSales: 250.00,
    cashRatio: 64,
    posRatio: 36,
    avgDiscrepancy: -1.20,
    avgExpensesToRevenue: 3.8,
    peakHour: '19:30 - 22:30 (Live Στοίχημα & VLTs)',
  },
  {
    shiftType: 'NIGHT',
    shiftTypeName: 'Βραδινή / Play Hall (00:00 - 04:00)',
    avgRevenue: 1220.00,
    avgOpapSales: 200.00,
    avgVltNet: 950.00,
    avgFnbSales: 70.00,
    cashRatio: 58,
    posRatio: 42,
    avgDiscrepancy: 0.00,
    avgExpensesToRevenue: 2.1,
    peakHour: '00:30 - 02:30 (VLT Jackpots)',
  },
];

export const WEEKLY_ROSTER_SAMPLE = [
  {
    storeId: '100343',
    storeName: '100343',
    schedule: [
      { shift: '8:00 - 16:00 (Πρωί)', mon: 'Μάκης', tue: 'Μάκης', wed: 'Βαγγέλης', thu: 'Μήτσος', fri: 'Μάκης', sat: 'Βαγγέλης', sun: 'Μήτσος' },
      { shift: '16:00 - 00:00 (Απόγευμα)', mon: 'Μήτσος', tue: 'Βαγγέλης', wed: 'Μάκης', thu: 'Μάκης', fri: 'Μήτσος', sat: 'Μήτσος', sun: 'Μάκης' },
      { shift: 'Ρεπό', mon: '-', tue: 'Μήτσος', wed: 'Μήτσος', thu: 'Βαγγέλης', fri: 'Βαγγέλης', sat: 'Μάκης', sun: '-' },
    ],
  },
  {
    storeId: '100343_FnB',
    storeName: '100343 FnB',
    schedule: [
      { shift: '7:30 - 15:45 (Πρωί)', mon: 'Άννα_Μαρία', tue: 'Άννα_Μαρία', wed: 'Ραφ', thu: 'Ραφ', fri: 'Νάντια', sat: 'Νάντια', sun: 'Νάντια' },
      { shift: '15:45 - 00:00 (Απόγευμα)', mon: 'Νάντια', tue: 'Νάντια', wed: 'Άννα_Μαρία', thu: 'Άννα_Μαρία', fri: 'Ραφ', sat: 'Ραφ', sun: 'Άννα_Μαρία' },
      { shift: 'Ρεπό', mon: 'Ραφ', tue: 'Ραφ', wed: 'Νάντια', thu: 'Νάντια', fri: 'Άννα_Μαρία', sat: 'Άννα_Μαρία', sun: 'Ραφ' },
    ],
  },
  {
    storeId: '100411',
    storeName: '100411',
    schedule: [
      { shift: '9:00 - 15:30 (Πρωί)', mon: 'Αχινιώτη', tue: 'Αχινιώτη', wed: 'Αχινιώτη', thu: 'Αχινιώτη', fri: 'Μολέ', sat: 'Μολέ', sun: 'Μολέ' },
      { shift: '15:30 - 22:00 (Απόγευμα)', mon: 'Βαγγέλης', tue: 'Μολέ', wed: 'Μολέ', thu: 'Μολέ', fri: 'Αχινιώτη', sat: 'Αχινιώτη', sun: 'Βαγγέλης' },
      { shift: 'Ρεπό', mon: 'Μολέ', tue: '-', wed: '-', thu: '-', fri: '-', sat: '-', sun: 'Αχινιώτη' },
    ],
  },
  {
    storeId: 'PlayOpap_400298',
    storeName: 'Play 400298',
    schedule: [
      { shift: '10:00 - 18:00 (Πρωί)', mon: 'Χριστίνα', tue: 'Χριστίνα', wed: 'Χριστίνα', thu: 'Σμαρώ', fri: 'Σμαρώ', sat: 'Σμαρώ', sun: 'Σμαρώ' },
      { shift: '18:00 - 02:00 (Απόγευμα)', mon: 'Βάσω, Σμαρώ', tue: 'Βάσω, Τάσος', wed: 'Βάσω, Τάσος', thu: 'Τάσος, Χριστίνα', fri: 'Βάσω, Τάσος', sat: 'Βάσω, Τάσος', sun: 'Βάσω, Τάσος' },
      { shift: 'Ρεπό', mon: 'Τάσος', tue: 'Σμαρώ', wed: 'Σμαρώ', thu: 'Βάσω', fri: 'Χριστίνα', sat: 'Χριστίνα', sun: 'Χριστίνα' },
    ],
  },
];
