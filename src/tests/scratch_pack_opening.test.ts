import { describe, it, expect } from 'vitest';
import { isPackOpening, startNoForNewPack } from '../lib/scratchPackOpening';
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

/**
 * Το νούμερο που βάζει η οθόνη, που είναι ΚΑΙ ο κανόνας της βάσης.
 *
 * Από το 0081 η scratch_pack_opening_allowed() δέχεται από υπάλληλο μόνο
 * μηδέν ή την πάγια ποσότητα του καταστήματος. Αυτά τα τεστ είναι η άλλη
 * άκρη εκείνου του κανόνα: αν αλλάξει η προσυμπλήρωση και ξεχαστεί η
 * μετάφραση στη βάση, σπάνε εδώ και όχι πάνω στον πάγκο με ένα 42501.
 */
describe('startNoForNewPack — ο κανόνας που επιβάλλει και το 0081', () => {
  it('ένα καινούριο πακέτο σκρατς ξεκινά από το μηδέν', () => {
    expect(startNoForNewPack({ id: 'scr_1', bundleSize: undefined }, {})).toBe('0');
  });

  it('η πάγια ποσότητα δεν αγγίζει παιχνίδι που δεν έχει', () => {
    expect(
      startNoForNewPack({ id: 'scr_eidiki_x5', bundleSize: 5 }, {
        laiko_standing_order_bundles: 40,
        ethniko_standing_order_bundles: 40,
      })
    ).toBe('0');
  });

  it('Λαϊκό: 40 πεντάδες στη Λαμία είναι 200 κομμάτια', () => {
    expect(
      startNoForNewPack({ id: 'scr_laiko', bundleSize: 5 }, { laiko_standing_order_bundles: 40 })
    ).toBe('200');
  });

  /** Η παγίδα του `|| 5`: στο Εθνικό η μονάδα ΕΙΝΑΙ η πεντάδα. */
  it('Εθνικό: πεντάδα 0 σημαίνει επί ένα, άρα 40', () => {
    expect(
      startNoForNewPack({ id: 'scr_ethniko_x20', bundleSize: 0 }, {
        ethniko_standing_order_bundles: 40,
      })
    ).toBe('40');
  });

  it('πάγια που δεν έχει οριστεί δεν είναι μηδέν ποσότητα — είναι μηδέν αρχικό', () => {
    expect(startNoForNewPack({ id: 'scr_laiko', bundleSize: 5 }, {})).toBe('0');
  });

  /** Στυλίδα: δηλωμένο μηδέν, που είναι απάντηση και όχι κενό. */
  it('δηλωμένο μηδέν πεντάδες δίνει μηδέν', () => {
    expect(
      startNoForNewPack({ id: 'scr_laiko', bundleSize: 5 }, { laiko_standing_order_bundles: 0 })
    ).toBe('0');
  });
});
