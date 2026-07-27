import { describe, expect, it } from 'vitest';
import {
  calculateCountedCash,
  calculateDiscrepancy,
  calculateExpectedCash,
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
    it('accurately calculates expected register cash for balanced OPAP & FnB shift', () => {
      const input = {
        opening_cash: 200.0,
        opap_gross_sales: 1500.0,
        opap_payouts: 400.0,
        vlts_cash_in: 600.0,
        vlts_cash_out: 200.0,
        scratch_lotto_sales: 150.0,
        fnb_cash: 80.0,
        customer_credit_collected: 50.0,
        card_payments: 300.0, // POS card payments
        expenses_paid_cash: 45.0, // store expense paid from register
        customer_credit_granted: 30.0, // unpaid customer tab
        bank_deposits: 500.0, // drop box deposit
      };

      // Inflows = 200 + 1500 + 600 + 150 + 80 + 50 = 2580.0
      // Outflows = 400 + 200 + 300 + 45 + 30 + 500 = 1475.0
      // Expected = 2580 - 1475 = 1105.00
      expect(calculateExpectedCash(input)).toBe(1105.0);
    });

    it('handles negative or missing inputs without throwing errors', () => {
      const input = {
        opening_cash: '200',
        opap_gross_sales: null,
        opap_payouts: undefined,
        fnb_cash: '-50', // negative input handled via safeNum
      };

      // Expected = 200 + (-50) = 150.0
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
});
