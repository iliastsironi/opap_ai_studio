import { describe, expect, it } from 'vitest';
import { handsOverCash, shiftHandover, type ClosedShiftCash } from '../lib/shiftHandover.ts';

/**
 * Κοψίματα σε πλήθη, όπως τα γράφει ο καταμετρητής: {«50»: 2, «0.5»: 4}.
 */
const den = (counts: Record<string, number>) => counts;

const shift = (over: Partial<ClosedShiftCash> = {}): ClosedShiftCash => ({
  shift_type: 'NIGHT',
  counted_denominations: den({ '50': 40, '20': 1, '0.5': 20, '0.2': 10 }), // 2.020 € + 12 €
  opening_cash_notes: 1000,
  coin_handover: 0,
  ...over,
});

describe('ποια βάρδια παραδίδει', () => {
  it('η βραδινή — εκεί περνάει ο υπεύθυνος', () => {
    expect(handsOverCash('NIGHT')).toBe(true);
  });

  it('η πρωινή όχι — ο ιδιοκτήτης το είπε ρητά', () => {
    expect(handsOverCash('MORNING')).toBe(false);
  });

  it('η απογευματινή ναι, γιατί αλλού κλείνει αυτή τη μέρα', () => {
    expect(handsOverCash('AFTERNOON')).toBe(true);
  });

  it('τίποτα άγνωστο δεν περνάει για βραδινή', () => {
    expect(handsOverCash('CUSTOM')).toBe(false);
    expect(handsOverCash(null)).toBe(false);
    expect(handsOverCash(undefined)).toBe(false);
    expect(handsOverCash('night')).toBe(false);
  });
});

describe('τι σηκώνει ο υπεύθυνος από μια βάρδια', () => {
  it('ο φάκελος είναι τα χαρτονομίσματα πάνω από το πάγιο', () => {
    const h = shiftHandover(shift());
    expect(h.envelope).toBe(1020);
    expect(h.coins).toBe(0);
    expect(h.total).toBe(1020);
    expect(h.isShort).toBe(false);
  });

  it('τα κέρματα του συρταριού ΔΕΝ παραδίδονται — είναι τα ρέστα του επόμενου', () => {
    // 12 € κέρματα στο συρτάρι, και κανένα δεν φεύγει. Ένας φάκελος
    // μετρημένος πάνω στο σύνολο του συρταριού θα έβγαζε 1.032 €.
    const h = shiftHandover(shift());
    expect(h.total).toBe(1020);
  });

  it('το κύπελλο ταξιδεύει μαζί, και φαίνεται χωριστά', () => {
    // Η βραδινή 23/10: φάκελος 1.940 €, κύπελλο 70 € — 2.010 € στο χέρι.
    const h = shiftHandover(
      shift({ counted_denominations: den({ '50': 58, '20': 2 }), coin_handover: 70 })
    );
    expect(h.envelope).toBe(1940);
    expect(h.coins).toBe(70);
    expect(h.total).toBe(2010);
  });

  it('χωρίς πάγιο στη γραμμή δεν φουσκώνει ο φάκελος κατά 1.000 €', () => {
    // Αν το opening_cash_notes έλειπε και διαβαζόταν ως μηδέν, ολόκληρο το
    // συρτάρι θα διαβαζόταν ως παράδοση. Καμία βραδινή των 43 δεν το έχει
    // κενό, αλλά το ταμπελάκι δεν επιτρέπεται να λέει ψέματα αν συμβεί.
    const h = shiftHandover(shift({ opening_cash_notes: null }));
    expect(h.envelope).toBe(2020);
  });

  it('συρτάρι κάτω από το πάγιο: μηδέν παράδοση, και το λέει', () => {
    const h = shiftHandover(
      shift({ counted_denominations: den({ '50': 16, '0.5': 20 }) }) // 800 € + 10 €
    );
    expect(h.total).toBe(0);
    expect(h.isShort).toBe(true);
  });

  it('το safe drop δεν μπαίνει — έφυγε ώρες πριν', () => {
    const withDrop = shiftHandover(shift({ bank_deposits: 500 }));
    expect(withDrop.total).toBe(shiftHandover(shift()).total);
  });

  it('άμεση εξόφληση ταξιδεύει στον φάκελο, χρέωση όχι', () => {
    // 20 € έλλειμμα, ανοχή 5 → 15 € στον χειριστή. Πληρωμένα στο χέρι,
    // ταξιδεύουν· χρεωμένα, δεν υπάρχουν μετρητά να σηκωθούν.
    const base = {
      discrepancy: -20, discrepancy_baseline: 0, discrepancy_threshold: 5,
    };
    const paid = shiftHandover(shift({ ...base, discrepancy_settlement: 'PAID_CASH' }));
    const charged = shiftHandover(shift({ ...base, discrepancy_settlement: 'CHARGE' }));

    expect(paid.settlement).toBe(15);
    expect(paid.total).toBe(1035);
    expect(charged.settlement).toBe(0);
    expect(charged.total).toBe(1020);
  });

  it('η εξόφληση μετριέται στη ΔΙΚΗ της απόκλιση, όχι στη σωρευτική', () => {
    // Σωρευτική −30, αλλά η πρωινή είχε ήδη −25: δική της −5, μέσα στην
    // ανοχή, άρα καμία χρέωση και κανένα μετρητό στον φάκελο.
    const h = shiftHandover(
      shift({
        discrepancy: -30, discrepancy_baseline: -25, discrepancy_threshold: 5,
        discrepancy_settlement: 'PAID_CASH',
      })
    );
    expect(h.settlement).toBe(0);
    expect(h.total).toBe(1020);
  });

  it('άδεια γραμμή δεν σκάει και δεν επινοεί χρήματα', () => {
    expect(shiftHandover(null)).toEqual({
      envelope: 0, coins: 0, settlement: 0, total: 0, isShort: false,
    });
    expect(shiftHandover({}).total).toBe(0);
  });
});
