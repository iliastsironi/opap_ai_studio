import { describe, it, expect } from 'vitest';
import {
  displayedRowCount,
  formatQuantity,
  looseOf,
  quantityView,
  toPieces,
  unitsOf,
} from '../lib/lotteryQuantityView';

/** Οι ρυθμίσεις και των δύο μαγαζιών του πρακτορείου: πεντάδες παντού. */
const UNITS = {
  scr_laiko: 'BUNDLES',
  scr_eidiki_x5: 'BUNDLES',
  scr_eidiki_x10: 'BUNDLES',
  scr_ethniko_x20: 'BUNDLES',
  scr_protochroniatiko: 'BUNDLES',
};

const LAIKO = { id: 'scr_laiko', bundleSize: 5, price: 2 };
const ETHNIKO = { id: 'scr_ethniko_x20', bundleSize: 0, price: 20 };
const GATA = { id: 'scr_2_gata', price: 2 };

describe('σε τι μονάδα δείχνεται', () => {
  it('Λαϊκό: 200 κομμάτια είναι 40 πεντάδες', () => {
    const v = quantityView(LAIKO, true, UNITS);
    expect(v.inBundles).toBe(true);
    expect(v.size).toBe(5);
    expect(unitsOf(200, v)).toBe(40);
    expect(formatQuantity(200, v)).toBe('40 πεντ.');
  });

  it('Λαϊκό: η πεντάδα κοστίζει 10 €, όχι 2 €', () => {
    expect(quantityView(LAIKO, true, UNITS).unitPrice).toBe(10);
  });

  /**
   * Η παγίδα του `|| 5`. Στο Εθνικό η μονάδα ΕΙΝΑΙ η πεντάδα: ο αριθμός
   * είναι ήδη πεντάδες και τα 20 € είναι η τιμή της.
   */
  it('Εθνικό: 337 είναι 337 πεντάδες, όχι 67', () => {
    const v = quantityView(ETHNIKO, true, UNITS);
    expect(v.inBundles).toBe(true);
    expect(v.size).toBe(0);
    expect(unitsOf(337, v)).toBe(337);
    expect(formatQuantity(337, v)).toBe('337 πεντ.');
  });

  it('Εθνικό: η πεντάδα μένει 20 €, δεν γίνεται 100 €', () => {
    expect(quantityView(ETHNIKO, true, UNITS).unitPrice).toBe(20);
  });

  it('τα σκρατς μετριούνται πάντα σε κομμάτια', () => {
    const v = quantityView(GATA, false, UNITS);
    expect(v.inBundles).toBe(false);
    expect(formatQuantity(12, v)).toBe('12 τμχ');
    expect(v.unitPrice).toBe(2);
  });

  /**
   * Η προεπιλογή του Λαϊκού όπου δεν έχει δηλωθεί τίποτα. «Και τα δύο»
   * σημαίνει ότι η γραμμή κρατάει ΚΟΜΜΑΤΙΑ - μια διαίρεση εδώ έδειχνε 40
   * για 200 δελτία, και τιμή 10 € το κομμάτι.
   */
  it('DUAL: ο αριθμός μένει σε κομμάτια και η τιμή ανά κομμάτι', () => {
    const v = quantityView(LAIKO, true, {});
    expect(v.inBundles).toBe(false);
    expect(v.size).toBe(0);
    expect(formatQuantity(200, v)).toBe('200 τμχ');
    expect(v.unitPrice).toBe(2);
  });

  it('λαχείο δηλωμένο σε κομμάτια μένει σε κομμάτια', () => {
    const v = quantityView(LAIKO, true, { scr_laiko: 'PIECES' });
    expect(v.inBundles).toBe(false);
    expect(formatQuantity(203, v)).toBe('203 τμχ');
    expect(v.unitPrice).toBe(2);
  });
});

describe('το σπασμένο υπόλοιπο', () => {
  const v = quantityView(LAIKO, true, UNITS);

  it('φαίνεται όταν υπάρχει', () => {
    expect(formatQuantity(203, v)).toBe('40 πεντ. + 3 τμχ');
    expect(unitsOf(203, v)).toBe(40);
    expect(looseOf(203, v)).toBe(3);
  });

  it('δεν γράφεται όταν δεν υπάρχει', () => {
    expect(formatQuantity(200, v)).toBe('40 πεντ.');
    expect(looseOf(200, v)).toBe(0);
  });

  /** Μια μετατροπή που το έκοβε θα χρέωνε τρία δελτία σε όποιον παρέδωσε. */
  it('ΕΠΙΣΤΡΕΦΕΙ ΑΚΕΡΑΙΟ: 40 πεντάδες + 3 = 203 κομμάτια', () => {
    expect(toPieces(40, 3, v)).toBe(203);
    expect(toPieces(unitsOf(203, v), looseOf(203, v), v)).toBe(203);
  });

  it('στο Εθνικό δεν υπάρχει υπόλοιπο να χαθεί', () => {
    const e = quantityView(ETHNIKO, true, UNITS);
    expect(looseOf(337, e)).toBe(0);
    expect(toPieces(337, 0, e)).toBe(337);
  });
});

/** Ο κανόνας που έμενε κλειδωμένος μέσα στον πίνακα του ταμείου. */
describe('displayedRowCount — ίδιος κανόνας, ένα σημείο', () => {
  it('διαιρεί όταν υπάρχει πεντάδα από πίσω', () => {
    expect(displayedRowCount(337, 5, true)).toBe(67);
  });

  it('δεν διαιρεί όταν η μονάδα ΕΙΝΑΙ η πεντάδα', () => {
    expect(displayedRowCount(337, 0, true)).toBe(337);
  });

  it('δεν διαιρεί όταν το μαγαζί μετράει κομμάτια', () => {
    expect(displayedRowCount(337, 5, false)).toBe(337);
  });

  it('μια πεντάδα που δεν είναι αριθμός δεν διαιρεί τίποτα', () => {
    expect(displayedRowCount(40, undefined, true)).toBe(40);
    expect(displayedRowCount(40, 'πεντάδα', true)).toBe(40);
    expect(displayedRowCount(40, -5, true)).toBe(40);
  });
});
