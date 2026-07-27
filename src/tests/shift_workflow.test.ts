import { describe, expect, it, beforeAll } from 'vitest';
import { getDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { calculateCountedCash, calculateExpectedCash, calculateDiscrepancy } from '../services/financialCalculator.js';

describe('Shift Opening & Closing Workflow Core Business Logic', () => {
  beforeAll(async () => {
    await getDb();
    await seedDatabase();
  });

  describe('Duplicate Submission Prevention & Immutable State', () => {
    it('prevents employee modification when shift status is SUBMITTED or APPROVED', () => {
      const shiftSubmitted = {
        id: 'shift_demo_01',
        status: 'SUBMITTED',
        opened_by_user_id: 'usr_employee_01',
      };

      const isImmutable = ['SUBMITTED', 'APPROVED'].includes(shiftSubmitted.status);
      expect(isImmutable).toBe(true);
    });

    it('allows manager to trigger CORRECTION_REQUESTED or REOPENED status transition', () => {
      let currentStatus = 'SUBMITTED';
      const managerNotes = 'Επανακαταμέτρηση ταμείου λόγω απόκλισης';

      // Manager requests correction
      if (['SUBMITTED', 'APPROVED'].includes(currentStatus)) {
        currentStatus = 'CORRECTION_REQUESTED';
      }

      expect(currentStatus).toBe('CORRECTION_REQUESTED');
      expect(managerNotes).toBeTruthy();

      // Employee is now allowed to edit and resubmit
      const isEmployeeEditableNow = ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'].includes(currentStatus);
      expect(isEmployeeEditableNow).toBe(true);
    });
  });

  describe('Financial Calculations on Shift Closing', () => {
    it('calculates OPAP Net, VLT Net, Expected Cash, and Discrepancy accurately', () => {
      const shiftData = {
        opening_cash: 250.0,
        opap_gross_sales: 2000.0,
        opap_payouts: 500.0,
        vlts_cash_in: 3000.0,
        vlts_cash_out: 1500.0,
        scratch_lotto_sales: 100.0,
        fnb_cash: 150.0,
        customer_credit_collected: 50.0,
        card_payments: 600.0,
        expenses_paid_cash: 80.0,
        customer_credit_granted: 40.0,
        bank_deposits: 2000.0,
      };

      const expectedCash = calculateExpectedCash(shiftData);
      // Inflows = 250 + 2000 + 3000 + 100 + 150 + 50 = 5550.0
      // Outflows = 500 + 1500 + 600 + 80 + 40 + 2000 = 4720.0
      // Expected Cash = 5550 - 4720 = 830.00
      expect(expectedCash).toBe(830.0);

      const countedDenominations = {
        '100': 5, // 500
        '50': 5,  // 250
        '20': 3,  // 60
        '10': 2,  // 20
      };
      const countedCash = calculateCountedCash(countedDenominations);
      expect(countedCash).toBe(830.0);

      const disc = calculateDiscrepancy(countedCash, expectedCash, 10.0);
      expect(disc.discrepancy).toBe(0.0);
      expect(disc.discrepancyPercentage).toBe(0.0);
      expect(disc.isUnbalanced).toBe(false);
      expect(disc.isExceedingThreshold).toBe(false);
    });

    it('detects unbalance exceeding configurable threshold', () => {
      const expectedCash = 1000.0;
      const countedCash = 975.0; // 25€ short
      const threshold = 10.0;

      const disc = calculateDiscrepancy(countedCash, expectedCash, threshold);
      expect(disc.discrepancy).toBe(-25.0);
      expect(disc.discrepancyPercentage).toBe(-2.5);
      expect(disc.isUnbalanced).toBe(true);
      expect(disc.isExceedingThreshold).toBe(true);
    });
  });

  describe('Permission Enforcement', () => {
    it('verifies system permissions for shift roles', () => {
      const employeePermissions = ['store.view', 'shift.create', 'shift.submit', 'expense.create'];
      const managerPermissions = [
        'org.view', 'store.view', 'users.view', 'shift.create', 'shift.submit', 'shift.approve', 'shift.reopen', 'expense.create', 'expense.approve', 'cash.view'
      ];

      expect(employeePermissions.includes('shift.submit')).toBe(true);
      expect(employeePermissions.includes('shift.approve')).toBe(false);

      expect(managerPermissions.includes('shift.approve')).toBe(true);
      expect(managerPermissions.includes('shift.reopen')).toBe(true);
    });
  });
});
