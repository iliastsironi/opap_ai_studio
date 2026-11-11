import { describe, it, expect } from 'vitest';
import { isPackOpening } from '../lib/scratchPackOpening';
import { lockScratchRowsForSave } from '../components/shifts/ScratchCalculatorTable';

/** Η γραμμή κρατάει πολύ περισσότερα πεδία από όσα κρίνει ο κανόνας. */
const row = (o: Record<string, unknown>) => o;

/** Η γραμμή πριν: πακέτο ΑΑΑ, η βάρδια το βρήκε στο 40 και πούλησε ως το 70. */
const BEFORE = {
  id: 'scr_1',
  name: 'ΓΑΤΑ 2€',
  price: 2,
  packCode: 'AAA111',
  startNo: '40',
  endNo: '70',
  backStartNo: '',
  backEndNo: '149',
};

/** Η ίδια γραμμή αφού άνοιξε το πακέτο ΒΒΒ. */
const AFTER_OPEN = {
  ...BEFORE,
  packCode: 'BBB222',
  startNo: '0',
  endNo: '',
  backStartNo: '',
  backEndNo: '149',
  isNewPack: true,
};

describe('isPackOpening', () => {
  it('αναγνωρίζει το άνοιγμα νέου πακέτου', () => {
    expect(isPackOpening(BEFORE, row(AFTER_OPEN))).toBe(true);
  });

  it('σκέτη αλλαγή του αρχικού ΔΕΝ είναι άνοιγμα', () => {
    expect(isPackOpening(BEFORE, row({ ...BEFORE, startNo: '70' }))).toBe(false);
  });

  it('ίδιος κωδικός πακέτου δεν είναι άνοιγμα', () => {
    expect(isPackOpening(BEFORE, row({ ...AFTER_OPEN, packCode: 'AAA111' }))).toBe(false);
  });

  it('κενός κωδικός δεν είναι άνοιγμα', () => {
    expect(isPackOpening(BEFORE, row({ ...AFTER_OPEN, packCode: '' }))).toBe(false);
  });

  it('χωρίς τη σήμανση νέου πακέτου δεν περνάει', () => {
    expect(isPackOpening(BEFORE, row({ ...AFTER_OPEN, isNewPack: false }))).toBe(false);
  });

  /** Αν έχει ήδη μετρηθεί πώληση πάνω του, δεν είναι «μόλις άνοιξε». */
  it('μετρημένο τελικό δεν περνάει', () => {
    expect(isPackOpening(BEFORE, row({ ...AFTER_OPEN, endNo: '12' }))).toBe(false);
  });

  it('μετρημένη πίσω πλευρά δεν περνάει', () => {
    expect(isPackOpening(BEFORE, row({ ...AFTER_OPEN, backStartNo: '5' }))).toBe(false);
  });

  it('δέχεται και το isNewPack ως κείμενο, όπως το δίνει η JSONB', () => {
    expect(isPackOpening(BEFORE, row({ ...AFTER_OPEN, isNewPack: 'true' }))).toBe(true);
  });
});

describe('lockScratchRowsForSave — το άνοιγμα περνάει', () => {
  it('ο υπάλληλος ανοίγει πακέτο και τα νούμερα ΔΕΝ γυρίζουν πίσω', () => {
    const [saved] = lockScratchRowsForSave([AFTER_OPEN as never], [BEFORE], false);
    expect(saved.startNo).toBe('0');
    expect(saved.packCode).toBe('BBB222');
  });

  it('αλλά σκέτη αλλαγή του αρχικού γυρίζει πίσω, όπως πριν', () => {
    const [saved] = lockScratchRowsForSave(
      [{ ...BEFORE, startNo: '70' } as never],
      [BEFORE],
      false
    );
    expect(saved.startNo).toBe('40');
  });

  it('το Πίσω-Τελικό του νέου πακέτου περνάει μαζί με το άνοιγμα', () => {
    const [saved] = lockScratchRowsForSave(
      [{ ...AFTER_OPEN, backEndNo: '299' } as never],
      [BEFORE],
      false
    );
    expect(saved.backEndNo).toBe('299');
  });

  it('ο υπεύθυνος δεν περιορίζεται από τίποτα', () => {
    const [saved] = lockScratchRowsForSave([{ ...BEFORE, startNo: '5' } as never], [BEFORE], true);
    expect(saved.startNo).toBe('5');
  });
});
