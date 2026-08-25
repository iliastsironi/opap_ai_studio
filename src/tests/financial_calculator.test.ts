import { describe, expect, it } from 'vitest';
import {
  calculateCountedCash,
  calculateDiscrepancy,
  calculateExpectedCash,
  calculateTotalReconciliationCount,
  calculateReconciliationBreakdown,
  roundCurrency,
  safeNum,
} from '../services/financialCalculator.js';

describe('Financial Calculation Service - ShiftLedger Engine', () => {
  describe('safeNum & rounding utilities', () => {
    it('safely handles null, undefined, strings, and Greek comma format', () => {
      expect(safeNum(null)).toBe(0);
      expect(safeNum(undefined)).toBe(0);
      expect(safeNum('')).toBe(0);
      expect(safeNum('150.50')).toBe(150.5);
      expect(safeNum('150,50')).toBe(150.5);
      expect(safeNum('invalid')).toBe(0);
    });

    it('correctly rounds currency to 2 decimal places preventing float drift', () => {
      expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
      expect(roundCurrency(10.555)).toBe(10.56);
      expect(roundCurrency(10.554)).toBe(10.55);
    });
  });

  describe('calculateCountedCash', () => {
    it('calculates total EUR cash correctly from denomination dictionary', () => {
      const denominations = {
        '500': 1, // 500
        '100': 2, // 200
        '50': 5,  // 250
        '20': 10, // 200
        '2': 5,   // 10
        '0.50': 4,// 2
        '0.01': 10 // 0.10
      };
      // Total = 500 + 200 + 250 + 200 + 10 + 2 + 0.10 = 1162.10
      expect(calculateCountedCash(denominations)).toBe(1162.1);
    });

    it('ignores negative or float denomination quantities gracefully', () => {
      const denominations = {
        '50': -5, // should treat as 0
        '20': 2.9, // should floor to 2 -> 40
      };
      expect(calculateCountedCash(denominations)).toBe(40);
    });

    it('returns 0 for missing or empty denomination inputs', () => {
      expect(calculateCountedCash(undefined)).toBe(0);
      expect(calculateCountedCash({})).toBe(0);
    });
  });

  describe('calculateExpectedCash', () => {
    it('matches user excel sheet reports calculation: 3954.42 € and discrepancy 0.64 €', () => {
      const expected = calculateExpectedCash({
        opening_cash: 1274.70,
        scratch_lotto_sales: 289.00, // 731 - 442
        tora_pos: 2669.67,
        clever_point: 0,
        vlts_cash_in: 0,
        vlts_cash_out: -471.85, // Negative cash flow
        pame_stoixima: 136.41,
        opap_gross_sales: 4217.00,
        cancellations: 5.00,
        opap_payouts: 2989.36,
        vouchers: -63.75,
        fnb_cash: 172.30,
      });
      // 289 + 2669.67 - 471.85 + 136.41 + (4217 - 5 - 2989.36 - 63.75) + 172.30 = 3954.42
      expect(expected).toBe(3954.42);

      const discrepancy = calculateDiscrepancy(3955.06, expected);
      expect(discrepancy.discrepancy).toBe(0.64);
    });

    it('accurately calculates expected register cash for balanced OPAP & FnB shift', () => {
      const input = {
        opap_gross_sales: 1500.0,
        opap_payouts: 400.0,
        scratch_lotto_sales: 150.0,
        tora_pos: 100.0,
        clever_point: 50.0,
        vlts_cash_in: 600.0,
        vlts_cash_out: -200.0,
        fnb_cash: 80.0,
      };

      // Expected = (1500 - 400) + 150 + 100 + 50 + 600 + (-200) + 80 = 1880.0
      expect(calculateExpectedCash(input)).toBe(1880.0);
    });

    it('handles negative or missing inputs without throwing errors', () => {
      const input = {
        opap_gross_sales: '200',
        opap_payouts: null,
        fnb_cash: '-50', // negative input handled via safeNum
      };

      // Expected = (200 - 0) + (-50) = 150.0
      expect(calculateExpectedCash(input)).toBe(150.0);
    });
  });

  describe('calculateDiscrepancy & Thresholds', () => {
    it('detects balanced cash register (zero discrepancy)', () => {
      const res = calculateDiscrepancy(1000.0, 1000.0, 10.0);
      expect(res.discrepancy).toBe(0);
      expect(res.discrepancyPercentage).toBe(0);
      expect(res.isUnbalanced).toBe(false);
      expect(res.isExceedingThreshold).toBe(false);
    });

    it('detects short cash discrepancy (deficit) exceeding threshold', () => {
      const res = calculateDiscrepancy(980.0, 1000.0, 10.0);
      expect(res.discrepancy).toBe(-20.0);
      expect(res.discrepancyPercentage).toBe(-2.0);
      expect(res.isUnbalanced).toBe(true);
      expect(res.isExceedingThreshold).toBe(true);
    });

    it('detects surplus cash discrepancy within allowable threshold', () => {
      const res = calculateDiscrepancy(1005.0, 1000.0, 10.0);
      expect(res.discrepancy).toBe(5.0);
      expect(res.discrepancyPercentage).toBe(0.5);
      expect(res.isUnbalanced).toBe(true);
      expect(res.isExceedingThreshold).toBe(false);
    });

    it('handles zero expected cash edge case for percentage calculation', () => {
      const res = calculateDiscrepancy(15.0, 0, 10.0);
      expect(res.discrepancy).toBe(15.0);
      expect(res.discrepancyPercentage).toBe(100);
      expect(res.isExceedingThreshold).toBe(true);
    });
  });

  describe('calculateTotalReconciliationCount', () => {
    it('calculates grand total reconciliation count correctly matching user template', () => {
      // User Template:
      // Μετρητά (1935) + Κέρματα (303) + POS (739.94) + Έξοδα (2383.82 + 18.00 = 2401.82) + Πιστώσεις (45) - Επιστροφές (195) = 5229.76
      // Σύνολο Καταμέτρησης = 5229.76 - 1274.70 (Αρχικό) = 3955.06
      const breakdown = calculateReconciliationBreakdown({
        countedCashInDrawer: 2238.00, // 1935.00 + 303.00
        posSalesTotal: 739.94,
        expensesTotal: 2401.82,
        bankDeposits: 0,
        customerCreditsGranted: 45.00,
        customerReturns: 195.00,
        openingCash: 1274.70,
      });

      expect(breakdown.grossTotal).toBe(5229.76);
      expect(breakdown.openingCash).toBe(1274.70);
      expect(breakdown.netTotal).toBe(3955.06);

      const netResult = calculateTotalReconciliationCount({
        countedCashInDrawer: 2238.00,
        posSalesTotal: 739.94,
        expensesTotal: 2401.82,
        bankDeposits: 0,
        customerCreditsGranted: 45.00,
        customerReturns: 195.00,
        openingCash: 1274.70,
      });

      expect(netResult).toBe(3955.06);
    });
  });
});
