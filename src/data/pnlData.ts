export interface StorePnLSummary {
  storeId: string;
  storeName: string;
  turnover: number;
  dailyExpenses: number;
  fixedExpenses: number;
  payroll: number;
  corporateExpenses: number;
  loans: number;
  profitBeforeTax: number;
}

export interface FixedExpenseItem {
  id?: string;
  name: string;
  store100343: number;
  store400298: number;
  store100411: number;
  store143344: number;
  total: number;
}

export interface CorporateExpenseItem {
  id?: string;
  category: string;
  name: string;
  amount: number;
}

export interface EmployeePayrollItem {
  id: string;
  employeeId?: string;
  storeId: string;
  storeName: string;
  name: string;
  email: string;
  iban?: string;
  baseSalary: number;
  salaryIncrease?: number;
  daysWorked: number;
  hoursWorked: number;
  multiplier?: number;
  overtimeHours: number;
  christmasBonus?: number;
  holidayAllowance?: number;
  leaveDaysTaken?: number;
  leaveCompensation?: number;
  bonus: number;
  totalPayroll: number;
  bankAmount: number;
  advancePayment: number;
  cashInHand: number;
}

export type PayrollEmployeeRecord = EmployeePayrollItem;

export interface VltReconciliationItem {
  id?: string;
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
    mon: string;
    tue: string;
    wed: string;
    thu: string;
    fri: string;
    sat: string;
    sun: string;
  }>;
}

export interface DailyExpenseEntry {
  date: string;
  dayName: string;
  suppliers: Record<string, number>;
  otherExpenses: { name: string; amount: number }[];
  totalDay: number;
}

export interface FnbShiftEntry {
  date: string;
  dayName: string;
  morningShift: { cashierName: string; cash: number; pos: number };
  afternoonShift: { cashierName: string; cash: number; pos: number };
  pdaTurnover: number;
  expenses: number;
  netDrawer: number;
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

export interface StoreKPI {
  storeId: string;
  storeName: string;
  storeType: string;
  ggr: number;
  ngr: number;
  vltWinPerMachine: number;
  vltMachineCount: number;
  opexToRevenue: number; // %
  fnbMargin: number; // %
  shrinkageRate: number; // %
  outstandingCredits: number;
  netProfit: number;
}

// Initial Real-world Data from 000000P&L_9_2024.xlsx
export const DEFAULT_PNL_SUMMARY: StorePnLSummary[] = [
  {
    storeId: '100343',
    storeName: 'Κατάστημα 100343 (ΟΠΑΠ)',
    turnover: 0,
    dailyExpenses: 217.03,
    fixedExpenses: 2330.44,
    payroll: 200.00,
    corporateExpenses: 0,
    loans: 0,
    profitBeforeTax: -2747.47,
  },
  {
    storeId: '100343_FnB',
    storeName: '100343 - FnB & Αναψυκτήριο',
    turnover: 5353.10,
    dailyExpenses: 2912.60,
    fixedExpenses: 0,
    payroll: 355.00,
    corporateExpenses: 0,
    loans: 0,
    profitBeforeTax: 2085.50,
  },
  {
    storeId: '100411',
    storeName: 'Κατάστημα 100411 (ΟΠΑΠ)',
    turnover: 0,
    dailyExpenses: 0,
    fixedExpenses: 459.60,
    payroll: 0,
    corporateExpenses: 0,
    loans: 0,
    profitBeforeTax: -459.60,
  },
  {
    storeId: 'PlayOpap_400298',
    storeName: 'Play OPAP 400298 (VLTs)',
    turnover: 0,
    dailyExpenses: 0,
    fixedExpenses: 2370.31,
    payroll: 0,
    corporateExpenses: 0,
    loans: 0,
    profitBeforeTax: -2370.31,
  },
  {
    storeId: '143344',
    storeName: 'Κατάστημα 143344 (ΟΠΑΠ)',
    turnover: 0,
    dailyExpenses: 0,
    fixedExpenses: 270.00,
    payroll: 0,
    corporateExpenses: 0,
    loans: 0,
    profitBeforeTax: -270.00,
  },
];

export const CORPORATE_EXPENSES_TOTAL = 1741.00;
export const LOANS_TOTAL = 0.00;

export const CORPORATE_EXPENSES_LIST = [
  { category: 'Έξοδα Εταιρίας', name: 'Μ_Νίκος', amount: 718.00 },
  { category: 'Έξοδα Εταιρίας', name: 'Μ_Περικλής', amount: 1023.00 },
  { category: 'Έξοδα Εταιρίας', name: 'Φόρος Εισοδήματος', amount: 0.00 },
  { category: 'Έξοδα Εταιρίας', name: 'ΕΦΚΑ Περικλής', amount: 0.00 },
  { category: 'Έξοδα Εταιρίας', name: 'ΕΦΚΑ Λένα', amount: 0.00 },
  { category: 'Έξοδα Εταιρίας', name: 'ΒΕΤΤΑΣ ΕΕ', amount: 0.00 },
  { category: 'Έξοδα Εταιρίας', name: 'Εφορία Play', amount: 0.00 },
  { category: 'Έξοδα Εταιρίας', name: 'Εφορία 100343', amount: 0.00 },
  { category: 'Έξοδα Εταιρίας', name: 'Πιστωτική Περικλής', amount: 0.00 },
  { category: 'Έξοδα Εταιρίας', name: 'ΕΝΦΙΑ', amount: 0.00 },
  { category: 'Έξοδα Εταιρίας', name: 'Τέλη Κυκλοφορίας', amount: 0.00 },
  { category: 'Δάνεια', name: 'Gold MC', amount: 0.00 },
  { category: 'Δάνεια', name: 'Δάνειο ΕΤΕ', amount: 0.00 },
  { category: 'Δάνεια', name: 'Επιστρεπτέα ΠΡΚ', amount: 0.00 },
  { category: 'Δάνεια', name: 'Δόση ΟΠΑΠ', amount: 0.00 },
];

export const FIXED_EXPENSES_LIST: FixedExpenseItem[] = [
  { name: 'Ενοίκιο', store100343: 2072.00, store400298: 2000.00, store100411: 300.00, store143344: 270.00, total: 4642.00 },
  { name: 'Ενέργεια (Ρεύμα)', store100343: 0, store400298: 0, store100411: 0, store143344: 0, total: 0 },
  { name: 'Ύδρευση (ΕΥΔΑΠ)', store100343: 144.84, store400298: 30.11, store100411: 46.00, store143344: 0, total: 220.95 },
  { name: 'OTE Internet & Τηλεφωνία', store100343: 0, store400298: 0, store100411: 0, store143344: 0, total: 0 },
  { name: 'OTE VPN 1', store100343: 0, store400298: 340.20, store100411: 0, store143344: 0, total: 340.20 },
  { name: 'OTE VPN 2', store100343: 0, store400298: 0, store100411: 0, store143344: 0, total: 0 },
  { name: 'OTE TV 1 / TV 2 / NOVA', store100343: 0, store400298: 0, store100411: 0, store143344: 0, total: 0 },
  { name: 'Τέλη VLTs', store100343: 0, store400298: 0, store100411: 0, store143344: 0, total: 0 },
  { name: 'Εφημερίδες / Έντυπα', store100343: 113.60, store400298: 0, store100411: 113.60, store143344: 0, total: 227.20 },
  { name: 'ΕΦΚΑ Εργοδοτικές Εισφορές', store100343: 0, store400298: 0, store100411: 0, store143344: 0, total: 0 },
  { name: 'Αμοιβή Λογιστή', store100343: 0, store400298: 0, store100411: 0, store143344: 0, total: 0 },
  { name: 'ΤΕΚΑ', store100343: 0, store400298: 0, store100411: 0, store143344: 0, total: 0 },
];

export const PAYROLL_EMPLOYEES_LIST: EmployeePayrollItem[] = [
  // 100343
  {
    id: 'emp_1',
    storeId: '100343',
    storeName: '100343 (ΟΠΑΠ)',
    name: 'Δημήτρης Φλώρος',
    email: 'dimitrisflo98@gmail.com',
    baseSalary: 666.86,
    daysWorked: 25,
    hoursWorked: 200,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 666.86,
    bankAmount: 666.86,
    advancePayment: 0,
    cashInHand: 0,
  },
  {
    id: 'emp_2',
    storeId: '100343',
    storeName: '100343 (ΟΠΑΠ)',
    name: 'Μάκης Κουτσούμπας',
    email: 'makiskouts93@gmail.com',
    baseSalary: 666.86,
    daysWorked: 26,
    hoursWorked: 208,
    overtimeHours: 0,
    bonus: 200.00,
    totalPayroll: 866.86,
    bankAmount: 666.86,
    advancePayment: 0,
    cashInHand: 200.00,
  },
  {
    id: 'emp_3',
    storeId: '100343',
    storeName: '100343 (ΟΠΑΠ)',
    name: 'Βαγγέλης Ντινόπουλος',
    email: 'vaggelisntin@gmail.com',
    baseSalary: 666.86,
    daysWorked: 22,
    hoursWorked: 176,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 666.86,
    bankAmount: 666.86,
    advancePayment: 0,
    cashInHand: 0,
  },
  // 100343_FnB
  {
    id: 'emp_4',
    storeId: '100343_FnB',
    storeName: '100343 FnB',
    name: 'Νάντια Κολοβελώνη',
    email: 'nandianandiaki@gmail.com',
    baseSalary: 666.86,
    daysWorked: 24,
    hoursWorked: 192,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 666.86,
    bankAmount: 666.86,
    advancePayment: 0,
    cashInHand: 0,
  },
  {
    id: 'emp_5',
    storeId: '100343_FnB',
    storeName: '100343 FnB',
    name: 'Γιούρη (FnB Barista)',
    email: 'giouri.fnb@shiftledger.gr',
    baseSalary: 355.00,
    daysWorked: 15,
    hoursWorked: 120,
    overtimeHours: 0,
    bonus: 355.00,
    totalPayroll: 710.00,
    bankAmount: 355.00,
    advancePayment: 0,
    cashInHand: 355.00,
  },
  {
    id: 'emp_6',
    storeId: '100343_FnB',
    storeName: '100343 FnB',
    name: 'Άννα-Μαρία Κουτροζή',
    email: 'annamariamissonirk@gmail.com',
    baseSalary: 666.86,
    daysWorked: 25,
    hoursWorked: 200,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 666.86,
    bankAmount: 666.86,
    advancePayment: 0,
    cashInHand: 0,
  },
  // 100411
  {
    id: 'emp_7',
    storeId: '100411',
    storeName: '100411 (ΟΠΑΠ)',
    name: 'Κατερίνα Αχινιώτη',
    email: 'k.achinioti@gmail.com',
    baseSalary: 666.86,
    daysWorked: 24,
    hoursWorked: 192,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 666.86,
    bankAmount: 666.86,
    advancePayment: 0,
    cashInHand: 0,
  },
  {
    id: 'emp_8',
    storeId: '100411',
    storeName: '100411 (ΟΠΑΠ)',
    name: 'Κατερίνα Μολέ',
    email: 'katerinaki13mole@gmail.com',
    baseSalary: 666.86,
    daysWorked: 23,
    hoursWorked: 184,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 666.86,
    bankAmount: 666.86,
    advancePayment: 0,
    cashInHand: 0,
  },
  // PlayOpap_400298
  {
    id: 'emp_9',
    storeId: 'PlayOpap_400298',
    storeName: 'Play 400298',
    name: 'Τάσος Δραχτίδης',
    email: 'tasos.drachtidis@shiftledger.gr',
    iban: 'GR8501721630005163069739762',
    baseSalary: 720.00,
    daysWorked: 25,
    hoursWorked: 200,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 720.00,
    bankAmount: 720.00,
    advancePayment: 0,
    cashInHand: 0,
  },
  {
    id: 'emp_10',
    storeId: 'PlayOpap_400298',
    storeName: 'Play 400298',
    name: 'Ειρήνη Τσιλιώνη',
    email: 'eirini.tsilioni@shiftledger.gr',
    baseSalary: 633.33,
    daysWorked: 22,
    hoursWorked: 176,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 633.33,
    bankAmount: 633.33,
    advancePayment: 0,
    cashInHand: 0,
  },
  {
    id: 'emp_11',
    storeId: 'PlayOpap_400298',
    storeName: 'Play 400298',
    name: 'Κριστίνα Τσιμπούκα',
    email: 'kristinatsim@gmail.com',
    iban: 'GR1801103960000039600528846',
    baseSalary: 756.49,
    daysWorked: 26,
    hoursWorked: 208,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 756.49,
    bankAmount: 756.49,
    advancePayment: 0,
    cashInHand: 0,
  },
  {
    id: 'emp_12',
    storeId: 'PlayOpap_400298',
    storeName: 'Play 400298',
    name: 'Σμαρώ Δινηκόλα',
    email: 'smarodi21@gmail.com',
    iban: 'GR3101101710000017162081776',
    baseSalary: 784.91,
    daysWorked: 26,
    hoursWorked: 208,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 784.91,
    bankAmount: 784.91,
    advancePayment: 0,
    cashInHand: 0,
  },
  {
    id: 'emp_13',
    storeId: 'PlayOpap_400298',
    storeName: 'Play 400298',
    name: 'Γιώργος Χριστοδούλου',
    email: 'giorgos.xristodoulou@shiftledger.gr',
    baseSalary: 305.00,
    daysWorked: 12,
    hoursWorked: 96,
    overtimeHours: 0,
    bonus: 0,
    totalPayroll: 305.00,
    bankAmount: 0,
    advancePayment: 305.00,
    cashInHand: 0,
  },
];

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

export const STORE_KPIS_SAMPLE: StoreKPI[] = [
  {
    storeId: '100343',
    storeName: 'Κατάστημα 100343 (ΟΠΑΠ)',
    storeType: 'OPAP Agency',
    ggr: 48500.00,
    ngr: 39500.00,
    vltWinPerMachine: 112.50,
    vltMachineCount: 12,
    opexToRevenue: 8.4,
    fnbMargin: 68.5,
    shrinkageRate: 0.02,
    outstandingCredits: 250.00,
    netProfit: 4620.00,
  },
  {
    storeId: '100343_FnB',
    storeName: '100343 - FnB & Αναψυκτήριο',
    storeType: 'F&B Store',
    ggr: 5353.10,
    ngr: 5353.10,
    vltWinPerMachine: 0,
    vltMachineCount: 0,
    opexToRevenue: 54.4,
    fnbMargin: 72.1,
    shrinkageRate: 0.01,
    outstandingCredits: 0.00,
    netProfit: 2085.50,
  },
  {
    storeId: 'PlayOpap_400298',
    storeName: 'Play OPAP 400298 (VLTs)',
    storeType: 'Gaming Hall',
    ggr: 86400.00,
    ngr: 71200.00,
    vltWinPerMachine: 168.40,
    vltMachineCount: 25,
    opexToRevenue: 6.8,
    fnbMargin: 62.0,
    shrinkageRate: 0.03,
    outstandingCredits: 450.00,
    netProfit: 9850.00,
  },
  {
    storeId: '100411',
    storeName: 'Κατάστημα 100411 (ΟΠΑΠ)',
    storeType: 'OPAP Agency',
    ggr: 29800.00,
    ngr: 24200.00,
    vltWinPerMachine: 95.00,
    vltMachineCount: 8,
    opexToRevenue: 9.1,
    fnbMargin: 65.0,
    shrinkageRate: 0.01,
    outstandingCredits: 120.00,
    netProfit: 2410.00,
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
