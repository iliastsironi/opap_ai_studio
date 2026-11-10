import { describe, expect, it } from 'vitest';
import { groupDaysByStore, groupShiftsByDay, type GroupableShift } from '../lib/inspectionDayGroups.ts';

const shift = (over: Partial<GroupableShift> & Pick<GroupableShift, 'id' | 'store_id' | 'opened_at'>): GroupableShift => ({
  register_id: 'Ταμείο 1',
  store_name: over.store_id === 'lamia' ? 'Allwyn Store | Lamia' : 'Allwyn Store | Stilida',
  discrepancy: 0,
  ...over,
});

/**
 * Με επιλεγμένα «Όλα τα Καταστήματα» οι κάρτες έρχονταν ανακατεμένες -
 * Λαμία Δευτέρα, Στυλίδα Δευτέρα, Λαμία Κυριακή - γιατί η ταξινόμηση είναι
 * κατά ημέρα. Σωστή σειρά, λάθος ερώτηση.
 */
describe('οι εκκρεμείς επιθεωρήσεις, ένα πλαίσιο ανά μαγαζί', () => {
  const days = groupShiftsByDay([
    shift({ id: 'l1', store_id: 'lamia', opened_at: '2026-11-09T06:00:00Z', discrepancy: 11.81 }),
    shift({ id: 'l2', store_id: 'lamia', opened_at: '2026-11-09T19:00:00Z', discrepancy: 13.71 }),
    shift({ id: 's1', store_id: 'stilida', opened_at: '2026-11-09T07:00:00Z', discrepancy: -2 }),
    shift({ id: 'l3', store_id: 'lamia', opened_at: '2026-11-08T19:00:00Z', discrepancy: 1 }),
  ]);

  it('κάθε μαγαζί μαζεύεται σε ένα τμήμα', () => {
    const sections = groupDaysByStore(days);
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.storeName)).toEqual([
      'Allwyn Store | Lamia',
      'Allwyn Store | Stilida',
    ]);
  });

  it('αλφαβητικά, ώστε η σειρά να μην χοροπηδάει με κάθε νέο κλείσιμο', () => {
    const sections = groupDaysByStore(days);
    const reversed = groupDaysByStore([...days].reverse());
    expect(reversed.map((s) => s.storeId)).toEqual(sections.map((s) => s.storeId));
  });

  it('μετράει τις βάρδιες του μαγαζιού, σε όλες τις ημέρες του', () => {
    const [lamia, stilida] = groupDaysByStore(days);
    expect(lamia.shiftCount).toBe(3);
    expect(lamia.days).toHaveLength(2);
    expect(stilida.shiftCount).toBe(1);
  });

  it('και το καθαρό τους — ένα νούμερο ανά μαγαζί', () => {
    const [lamia, stilida] = groupDaysByStore(days);
    expect(lamia.totalDiscrepancy).toBeCloseTo(26.52, 2);
    expect(stilida.totalDiscrepancy).toBeCloseTo(-2, 2);
  });

  it('μέσα στο μαγαζί, νεότερη μέρα πρώτη — όπως ήταν πάντα', () => {
    const [lamia] = groupDaysByStore(days);
    expect(lamia.days.map((d) => d.day)).toEqual(['2026-11-09', '2026-11-08']);
  });

  it('ένα μαγαζί δίνει ένα τμήμα, κανένα δίνει κανένα', () => {
    expect(groupDaysByStore(days.filter((d) => d.storeId === 'lamia'))).toHaveLength(1);
    expect(groupDaysByStore([])).toEqual([]);
    expect(groupDaysByStore(null)).toEqual([]);
  });
});
