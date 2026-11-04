import { describe, expect, it } from 'vitest';
import {
  agingLabel, agingTone, canWithdraw, daysInWarehouse, daysUntilWithdrawable,
  EXPIRY_DAYS, HARD_LIMIT_DAYS, summariseAging, WARN_AFTER_DAYS, withdrawBlockedReason,
} from '../lib/warehouseAging.ts';

const NOW = new Date('2026-11-04T09:00:00Z');
const daysAgo = (n: number) => {
  const d = new Date(Date.UTC(2026, 10, 4) - n * 86400000);
  return d.toISOString().slice(0, 10);
};

describe('πόσες ημέρες κάθεται', () => {
  it('σήμερα είναι μηδέν', () => {
    expect(daysInWarehouse(daysAgo(0), NOW)).toBe(0);
  });

  it('μετράει ημερολογιακές ημέρες, όχι ώρες', () => {
    expect(daysInWarehouse(daysAgo(1), NOW)).toBe(1);
    expect(daysInWarehouse(daysAgo(90), NOW)).toBe(90);
  });

  it('ημερομηνία στο μέλλον δεν γίνεται αρνητική', () => {
    // Λάθος καταχώρηση δεν διαβάζεται ούτε σαν φρέσκο ούτε σαν ληγμένο.
    expect(daysInWarehouse('2027-01-01', NOW)).toBe(0);
  });

  it('σκουπίδια δίνουν μηδέν', () => {
    expect(daysInWarehouse(null, NOW)).toBe(0);
    expect(daysInWarehouse('χθες', NOW)).toBe(0);
  });
});

describe('πότε αρχίζει να καίει', () => {
  it('ήσυχα μέχρι τις 84', () => {
    expect(agingTone(0)).toBe('OK');
    expect(agingTone(WARN_AFTER_DAYS - 1)).toBe('OK');
    expect(agingLabel(10)).toBeNull();
  });

  it('στις 85 πλησιάζει', () => {
    expect(agingTone(85)).toBe('WARNING');
    expect(agingLabel(85)).toBe('85 ημέρες — λήγει σε 5');
    expect(agingTone(89)).toBe('WARNING');
  });

  it('στις 90 έληξε', () => {
    expect(agingTone(EXPIRY_DAYS)).toBe('CRITICAL');
    expect(agingLabel(90)).toContain('έληξε');
  });

  it('μετά τις 110 μένει κόκκινο — δεν σβήνει ποτέ μόνο του', () => {
    // Το πακέτο που ξεχάστηκε περισσότερο απ' όλα δεν γίνεται το μόνο
    // που δεν φαίνεται.
    expect(agingTone(HARD_LIMIT_DAYS + 1)).toBe('CRITICAL');
    expect(agingTone(500)).toBe('CRITICAL');
    expect(agingLabel(200)).toContain('έπρεπε να έχει αποσυρθεί');
  });
});

describe('η σύνοψη πάνω από τη λίστα', () => {
  it('μετράει και τα δύο σκαλιά και τα ευρώ των ληγμένων', () => {
    const packs = [
      { received_at: daysAgo(10), pieces: 150, unit_price: 2 },
      { received_at: daysAgo(86), pieces: 60, unit_price: 5 },
      { received_at: daysAgo(95), pieces: 30, unit_price: 10 },
      { received_at: daysAgo(130), pieces: 15, unit_price: 50 },
    ];
    expect(summariseAging(packs, NOW)).toEqual({
      warning: 1,
      critical: 2,
      criticalValue: 300 + 750,
    });
  });

  it('άδεια αποθήκη δεν ειδοποιεί', () => {
    expect(summariseAging([], NOW)).toEqual({ warning: 0, critical: 0, criticalValue: 0 });
  });
});

describe('πότε ανοίγει η απόσυρση', () => {
  it('κλειστή πριν από τις 90 ημέρες', () => {
    // Ένα πακέτο που δεν πουλάει δεν επιστρέφεται· επιστρέφεται όταν λήξει.
    expect(canWithdraw(0)).toBe(false);
    expect(canWithdraw(85)).toBe(false);
    expect(canWithdraw(EXPIRY_DAYS - 1)).toBe(false);
  });

  it('ανοίγει ακριβώς την 90ή', () => {
    expect(canWithdraw(EXPIRY_DAYS)).toBe(true);
    expect(canWithdraw(200)).toBe(true);
  });

  it('λέει πόσες ημέρες μένουν', () => {
    expect(daysUntilWithdrawable(85)).toBe(5);
    expect(daysUntilWithdrawable(90)).toBe(0);
    expect(daysUntilWithdrawable(120)).toBe(0);
  });

  it('εξηγεί γιατί είναι κλειστή', () => {
    expect(withdrawBlockedReason(85)).toContain('απομένουν 5');
    expect(withdrawBlockedReason(90)).toBeNull();
  });
});
