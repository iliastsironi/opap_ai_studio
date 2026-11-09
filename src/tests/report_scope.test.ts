// Το εύρος της Επισκόπησης: τι μετράει πού, και ότι οι κάρτες συμφωνούν.
//
// Ο κανόνας που φυλάνε αυτά τα tests τον έθεσε ο ιδιοκτήτης: «στα έξοδα του
// μαγαζιού, πχ το ΟΠΑΠ, δεν πρέπει να φαίνονται τα έξοδα/έσοδα καφέ, αλλά
// μόνο στο FnB».

import { describe, it, expect } from 'vitest';
import { MonthlyPnlInput, computeMonthlyPnl, totalCosts } from '../lib/pnlEngine.ts';
import {
  SCOPE_AGENCY,
  SCOPE_ALL,
  SCOPE_FNB,
  isStoreScope,
  scopeRule,
  scopedCostMix,
  scopedFigures,
} from '../lib/reportScope.ts';

const STORE_A = 'store_a';
const STORE_B = 'store_b';

// Ένα μαγαζί με καφέ μέσα του, κι ένα χωρίς. Στρογγυλά νούμερα, ώστε κάθε
// απόκλιση να διαβάζεται με το μάτι.
const OCTOBER: MonthlyPnlInput = {
  month: '2026-10',
  stores: [
    { id: STORE_A, code: '101499', name: 'Allwyn Store', storeType: 'OPAP_AGENCY' },
    { id: STORE_B, code: '101498', name: 'Allwyn Play', storeType: 'OPAP_AGENCY' },
  ],
  commissions: [
    { id: 'c1', batchId: 'b1', storeId: STORE_A, entryDate: '2026-10-31', line: 'Tora Wallet ΑΕ', amount: 1000 },
    { id: 'c2', batchId: 'b1', storeId: STORE_B, entryDate: '2026-10-31', line: 'Tora Wallet ΑΕ', amount: 400 },
  ],
  fixedCosts: [{ storeId: STORE_A, period: '2026-10-01', name: 'Ένοικιο', amount: 200 }],
  payroll: [
    {
      storeId: STORE_A, unit: 'STORE', period: '2026-10-01', name: 'Ταμίας',
      baseSalary: 0, salaryIncrease: 0, overtimeAmount: 0, christmasBonus: 0, holidayAllowance: 0,
      leaveDaysTaken: 0, leaveCompensation: 0, bonus: 0, bankAmount: 300, advancePayment: 0,
    },
    {
      storeId: STORE_A, unit: 'FNB', period: '2026-10-01', name: 'Μπαρίστα',
      baseSalary: 0, salaryIncrease: 0, overtimeAmount: 0, christmasBonus: 0, holidayAllowance: 0,
      leaveDaysTaken: 0, leaveCompensation: 0, bonus: 0, bankAmount: 150, advancePayment: 0,
    },
  ],
  companyCosts: [
    { period: '2026-10-01', kind: 'FIXED', name: 'ΙΚΑ', amount: 90 },
    { period: '2026-10-01', kind: 'LOAN', name: 'Δόση', amount: 60 },
  ],
  companyDaily: [],
  expenses: [
    { id: 'e1', storeId: STORE_A, date: '2026-10-03', category: 'EXPENSES_GP', recipient: 'Χαρτικά', amount: 100 },
    { id: 'e2', storeId: STORE_A, date: '2026-10-04', category: 'EXPENSES_FNB', recipient: 'Κάβα Ζωγράφος', amount: 250 },
    { id: 'e3', storeId: STORE_B, date: '2026-10-07', category: 'EXPENSES_GP', recipient: 'Περίπτερο', amount: 40 },
  ],
  shifts: [],
  fnbManualDays: [{ storeId: STORE_A, day: '2026-10-05', cash: 500, pos: 300 }],
  vltCounts: [],
};

const pnl = computeMonthlyPnl(OCTOBER);
const SCOPES = [SCOPE_ALL, SCOPE_AGENCY, SCOPE_FNB, STORE_A, STORE_B];
const mixTotal = (scope: string): number =>
  Math.round(scopedCostMix(pnl, scope).reduce((acc, slice) => acc + slice.value, 0) * 100) / 100;
const keysOf = (scope: string): string[] => scopedCostMix(pnl, scope).map((slice) => slice.key);

describe('εύρος αναφοράς', () => {
  it('το μαγαζί είναι το πρακτορείο του - ο καφές δεν μπαίνει μέσα', () => {
    // Ο καφές υπάρχει και έχει τζίρο· αλλιώς το test θα περνούσε από τύχη.
    expect(scopedFigures(pnl, SCOPE_FNB).revenue).toBe(800);
    expect(pnl.hasFnb).toBe(true);

    // Και όμως, το κατάστημα που τον στεγάζει δείχνει μόνο τις προμήθειές του.
    expect(scopedFigures(pnl, STORE_A).revenue).toBe(1000);
  });

  it('ο καφές δεν εμφανίζεται ούτε στα έξοδα του μαγαζιού', () => {
    expect(keysOf(STORE_A)).not.toContain('FNB_DAILY');
    expect(keysOf(SCOPE_FNB)).toContain('FNB_DAILY');
    // Ούτε κρυμμένος μέσα στο σύνολο: 100 του πρακτορείου, όχι 350.
    expect(scopedCostMix(pnl, STORE_A).find((s) => s.key === 'AGENCY_DAILY')?.value).toBe(100);
  });

  it('η γραμμή που δεν ισχύει λείπει, δεν γράφεται 0,00', () => {
    // «Αγορές Καφέ 0,00» κάτω από ένα μαγαζί διαβάζεται «ο καφές μου δεν
    // ξόδεψε τίποτα», ενώ ο καφές απλώς δεν μετράει εκεί.
    expect(keysOf(STORE_B)).toEqual(['AGENCY_DAILY', 'FIXED', 'PAYROLL']);
    expect(keysOf(SCOPE_FNB)).toEqual(['FNB_DAILY', 'FIXED', 'PAYROLL']);
    expect(keysOf(SCOPE_ALL)).toEqual(['AGENCY_DAILY', 'FNB_DAILY', 'FIXED', 'PAYROLL', 'COMPANY', 'LOANS']);
  });

  it('το πλακίδιο «Έξοδα» και το Cost Mix δίπλα του λένε το ίδιο νούμερο', () => {
    // Αυτό έσπαγε: το ντόνατ έδειχνε πάντα όλη την εταιρία, ό,τι εύρος κι αν
    // διάλεγε ο χρήστης, δίπλα σε ένα πλακίδιο που ακολουθούσε το εύρος.
    for (const scope of SCOPES) {
      expect(mixTotal(scope)).toBe(scopedFigures(pnl, scope).costs);
    }
  });

  it('τα εταιρικά και τα δάνεια δεν χρεώνονται σε ένα μαγαζί ούτε στον καφέ', () => {
    expect(pnl.companyExpenses + pnl.loans).toBe(150);
    for (const scope of [STORE_A, STORE_B, SCOPE_FNB]) {
      expect(keysOf(scope)).not.toContain('COMPANY');
      expect(keysOf(scope)).not.toContain('LOANS');
      expect(scopeRule(scope).carriesCompany).toBe(false);
    }
    expect(scopeRule(SCOPE_AGENCY).carriesCompany).toBe(true);
    expect(scopeRule(SCOPE_ALL).carriesCompany).toBe(true);
  });

  it('οι τρεις συνολικές όψεις συμφωνούν με τη Σύνοψη του P&L', () => {
    expect(scopedFigures(pnl, SCOPE_ALL)).toEqual({
      revenue: pnl.storesTotal.revenue,
      costs: totalCosts(pnl),
      result: pnl.netResult,
    });
    expect(scopedFigures(pnl, SCOPE_AGENCY).revenue).toBe(pnl.agency.revenue);
    expect(scopedFigures(pnl, SCOPE_AGENCY).result).toBe(pnl.agencyNet);
    expect(scopedFigures(pnl, SCOPE_FNB).revenue).toBe(pnl.fnb.revenue);
    expect(scopedFigures(pnl, SCOPE_FNB).result).toBe(pnl.fnbNet);
  });

  it('τα καταστήματα μαζί ξαναδίνουν το πρακτορείο', () => {
    // Κανένα μαγαζί δεν χάνεται και κανένα δεν μετριέται δύο φορές - εκτός
    // από τα εταιρικά, που δεν ανήκουν σε κανένα.
    const perStore = [STORE_A, STORE_B].map((id) => scopedFigures(pnl, id));
    const agency = scopedFigures(pnl, SCOPE_AGENCY);
    expect(perStore.reduce((a, f) => a + f.revenue, 0)).toBe(agency.revenue);
    expect(perStore.reduce((a, f) => a + f.costs, 0)).toBe(agency.costs - 150);
  });

  it('ξέρει ποιο εύρος είναι κατάστημα', () => {
    expect(isStoreScope(STORE_A)).toBe(true);
    expect([SCOPE_ALL, SCOPE_AGENCY, SCOPE_FNB].map(isStoreScope)).toEqual([false, false, false]);
    expect(scopeRule(STORE_A)).toEqual({ storeId: STORE_A, sides: ['STORE'], carriesCompany: false });
  });
});
