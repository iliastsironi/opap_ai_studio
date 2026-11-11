import { describe, it, expect } from 'vitest';
import { packIsGone, packWarning } from '../lib/scratchPackWarning';

/** Πακέτο 2 €: 150 δελτία. Θέση 150 σημαίνει άδειο. */
const FINISHED = { price: 2, startNo: '150', endNo: '' };
const HALF_WAY = { price: 2, startNo: '40', endNo: '70' };

describe('packIsGone', () => {
  it('τελειωμένο πακέτο που δεν πούλησε τίποτα: δεν υπάρχει', () => {
    expect(packIsGone(FINISHED, { soldThisShift: 0 })).toBe(true);
  });

  it('το ίδιο όταν δεν δοθεί καθόλου ποσότητα', () => {
    expect(packIsGone(FINISHED)).toBe(true);
  });

  it('πακέτο που τέλειωσε ΜΕΣΑ στη βάρδια κρατάει τα νούμερά του', () => {
    // 30 δελτία πουλήθηκαν και το πακέτο σώθηκε: τα νούμερα εξηγούν την πώληση.
    expect(packIsGone({ price: 2, startNo: '120', endNo: '150' }, { soldThisShift: 30 })).toBe(false);
  });

  it('πακέτο με απόθεμα δεν είναι τελειωμένο', () => {
    expect(packIsGone(HALF_WAY, { soldThisShift: 0 })).toBe(false);
  });

  it('τα λαχεία δεν έχουν πακέτο από πίσω — ποτέ', () => {
    expect(packIsGone(FINISHED, { isLottery: true, soldThisShift: 0 })).toBe(false);
  });

  it('χωρίς τιμή που να δίνει μέγεθος πακέτου δεν αποφασίζει', () => {
    expect(packIsGone({ price: 3.5, startNo: '10' })).toBe(false);
  });

  it('γραμμή που δεν μέτρησε κανείς δεν είναι τελειωμένη', () => {
    expect(packIsGone({ price: 2, startNo: '', endNo: '' })).toBe(false);
  });

  it('το Χ50 μετράει με τα δικά του δελτία, όχι με τον κανόνα των 300', () => {
    // 15 δελτία ανά πακέτο. Στη θέση 15 τελείωσε· στη θέση 6 όχι.
    expect(packIsGone({ price: 50, packPieces: 15, startNo: '15' })).toBe(true);
    expect(packIsGone({ price: 50, packPieces: 15, startNo: '6' })).toBe(false);
  });

  it('συμφωνεί με το packWarning', () => {
    expect(packWarning(FINISHED)?.state).toBe('finished');
  });
});
