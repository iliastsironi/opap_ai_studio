import { describe, expect, it } from 'vitest';
import { bundleSizeProblem, packPieces } from '../lib/scratchBarcode.ts';

/**
 * Ο αριθμός παιχνιδιού που έπεσε στη διπλανή στήλη.
 *
 * «Δώρο 5€» και «Δώρο 10€» αποθηκεύτηκαν με bundleSize 168 και 169 - τους
 * αριθμούς παιχνιδιού τους (0168, 0169). Ένα σκρατς με bundleSize > 0
 * μετριέται σε πακέτα αντί για αύξοντες αριθμούς, δηλαδή σαν λαχείο, και
 * τίποτα δεν το έλεγε.
 */
describe('τι στέκει ως τεμάχια ανά πακέτο', () => {
  it('το πραγματικό λάθος: 168 σε σκρατς των 5 €', () => {
    // Πακέτο 5 €: 300/5 = 60 δελτία. Μια «πεντάδα» των 168 είναι αδύνατη.
    expect(packPieces(5)).toBe(60);
    const problem = bundleSizeProblem(5, 168);
    expect(problem).toContain('168');
    expect(problem).toContain('60');
    expect(problem).toContain('αριθμός παιχνιδιού');
  });

  it('και το δεύτερο: 169 σε σκρατς των 10 €', () => {
    expect(bundleSizeProblem(10, 169)).not.toBeNull();
  });

  it('μια κανονική πεντάδα περνάει', () => {
    expect(bundleSizeProblem(2, 5)).toBeNull();
    expect(bundleSizeProblem(5, 5)).toBeNull();
    expect(bundleSizeProblem(1, 5)).toBeNull();
  });

  it('κενό σημαίνει μεμονωμένα, όχι λάθος', () => {
    // Το 0 ΕΙΝΑΙ πληροφορία σε αυτό το έργο και δεν γίνεται σφάλμα.
    expect(bundleSizeProblem(5, 0)).toBeNull();
    expect(bundleSizeProblem(5, undefined)).toBeNull();
    expect(bundleSizeProblem(5, null)).toBeNull();
    expect(bundleSizeProblem(5, '')).toBeNull();
  });

  it('πεντάδα ίση με ολόκληρο το πακέτο επιτρέπεται — είναι το όριο', () => {
    expect(bundleSizeProblem(5, 60)).toBeNull();
    expect(bundleSizeProblem(5, 61)).not.toBeNull();
  });

  it('δηλωμένο μέγεθος πακέτου αλλάζει το όριο', () => {
    // 7ΑΡΙ Χ50: 15 δελτία, 750 €. Το όριο είναι 15, όχι 300/50 = 6.
    expect(bundleSizeProblem(50, 15, 15)).toBeNull();
    expect(bundleSizeProblem(50, 16, 15)).not.toBeNull();
  });

  it('χωρίς γνωστό μέγεθος πακέτου δεν εφευρίσκει όριο', () => {
    // Τιμή που δεν διαιρεί το 300: κανένα πακέτο, κανένας έλεγχος.
    expect(packPieces(7)).toBeNull();
    expect(bundleSizeProblem(7, 168)).toBeNull();
    expect(bundleSizeProblem(0, 5)).toBeNull();
  });

  it('δεκαδικό δεν είναι τεμάχια', () => {
    expect(bundleSizeProblem(5, 2.5)).toContain('ακέραιος');
  });
});
