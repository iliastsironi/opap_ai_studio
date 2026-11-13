import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  belowEarlierShift, earlierRowsForFloor, matchingRow, type FloorReading,
} from '../lib/earlierShiftFloor.ts';
import { earlierShiftIssues, type ScratchTicketRow } from '../components/shifts/ScratchCalculatorTable.tsx';

/**
 * Η βραδινή δεν μπορεί να έχει πουλήσει λιγότερα από όσα είχε ήδη γράψει η
 * πρωινή: μέσα στην ημέρα τα νούμερα είναι σωρευτικά.
 *
 * Οι δύο πραγματικές περιπτώσεις (Στυλίδα 2/11, Λαμία 12/11) βρέθηκαν σε 56
 * ζευγάρια βαρδιών· όλα τα υπόλοιπα τεστ φυλάνε το αντίθετο - να μην
 * ειδοποιεί όταν δεν πρέπει.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const row = (over: Partial<ScratchTicketRow>): ScratchTicketRow => ({
  id: 'scr_7ari_5', name: '7ΑΡΙ 5€', category: 'Σκρατς', price: 5,
  startNo: '1', endNo: '', backStartNo: '', backEndNo: '', ...over,
} as ScratchTicketRow);

describe('η γραμμή που έχει γράψει λιγότερα', () => {
  /** Στυλίδα, 2/11: η πρωινή τελείωσε στο 3, η βραδινή στο 2, και τα δύο από το αρχικό 1. */
  it('πραγματική περίπτωση: 7ΑΡΙ 5 €, πρωί 3, βράδυ 2', () => {
    const issues = earlierShiftIssues(
      [row({ endNo: '2' })],
      [row({ endNo: '3' })],
      'FRONT_ONLY'
    );
    expect(issues.length).toBe(1);
    expect(issues[0].now).toBe(1);
    expect(issues[0].earlier).toBe(2);
    expect(issues[0].message).toContain('γράφεις 1 τεμ.');
  });

  /** Λαμία, 12/11: η πρωινή πούλησε 2 πεντάδες, η βραδινή έγραψε 0 και 0. */
  it('πραγματική περίπτωση: Λαϊκό, πρωί 2 πεντάδες, βράδυ μηδέν', () => {
    const laiko = (over: Partial<ScratchTicketRow>) => row({
      id: 'scr_laiko', name: 'Λαϊκό Λαχείο', category: 'Λαχεία', kind: 'LOTTERY',
      price: 1, bundleSize: 5, startNo: '200', ...over,
    });
    const issues = earlierShiftIssues(
      [laiko({ endNo: '200', saleBundles: '0', salePieces: '0' })],
      [laiko({ endNo: '190', saleBundles: '2', salePieces: '0' })],
      'FRONT_ONLY'
    );
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('γράφεις 0 τεμ.');
    // Οι 2 πεντάδες της πρωινής δεν φαίνονται στον υπάλληλο.
    expect(issues[0].message).not.toContain('10');
    expect(issues[0].message).not.toContain('πεντάδες');
  });

  it('το μήνυμα λέει ότι δεν γίνεται και γιατί: η προηγούμενη βάρδια έχει ήδη πουλήσει περισσότερα', () => {
    const [i] = earlierShiftIssues([row({ endNo: '2' })], [row({ endNo: '5' })], 'FRONT_ONLY');
    expect(i.message).toContain('Δεν γίνεται');
    expect(i.message).toContain('η προηγούμενη βάρδια έχει ήδη πουλήσει περισσότερα');
    // Και το πώς δουλεύει: ξεκινά από της προηγούμενης, ό,τι πουλήσει προστίθεται.
    expect(i.message).toContain('ξεκινά από τις πωλήσεις της προηγούμενης');
    expect(i.message).toContain('προστίθεται από πάνω');
  });

  /**
   * Ο υπάλληλος δεν χρειάζεται να δει τι πούλησε ο προηγούμενος. Ειδικά ένα
   * νούμερο που δεν υπάρχει αλλού στο μήνυμα, για να μη μπερδευτεί με άλλο.
   */
  it('το μήνυμα ΔΕΝ γράφει πόσα είχε πουλήσει η προηγούμενη βάρδια', () => {
    const [i] = earlierShiftIssues([row({ endNo: '2' })], [row({ endNo: '16' })], 'FRONT_ONLY');   // πρωί: 15
    expect(i.message).not.toContain('15');
    expect(i.message).not.toContain('16');
    // Μόνο ό,τι έγραψε ο ίδιος: 2 − 1 = 1.
    expect(i.message).toContain('γράφεις 1 τεμ.');
  });
});

describe('δεν ειδοποιεί όταν δεν πρέπει', () => {
  it('ίσα ή περισσότερα πουλημένα είναι εντάξει', () => {
    expect(earlierShiftIssues([row({ endNo: '3' })], [row({ endNo: '3' })], 'FRONT_ONLY')).toEqual([]);
    expect(earlierShiftIssues([row({ endNo: '9' })], [row({ endNo: '3' })], 'FRONT_ONLY')).toEqual([]);
  });

  /**
   * Η βραδινή που μόλις άνοιξε έχει κενά τελικά παντού. Δεν «έγραψε λιγότερα»:
   * δεν έχει μετρήσει ακόμα. Στα δεδομένα αυτό ήταν 17 από τις 19 πρώτες
   * «παραβάσεις» - όλες ψεύτικες.
   */
  it('κενό τελικό σημαίνει «δεν μετρήθηκε ακόμα», όχι «πούλησα μηδέν»', () => {
    expect(earlierShiftIssues([row({ endNo: '' })], [row({ endNo: '9' })], 'FRONT_ONLY')).toEqual([]);
  });

  it('το κενό στα λαχεία με πεντάδες (τίποτα δεν γράφτηκε) δεν ειδοποιεί', () => {
    const laiko = (over: Partial<ScratchTicketRow>) => row({
      id: 'scr_laiko', name: 'Λαϊκό', kind: 'LOTTERY', price: 1, bundleSize: 5, startNo: '35', ...over,
    });
    expect(
      earlierShiftIssues(
        [laiko({ endNo: '', saleBundles: '', salePieces: '' })],
        [laiko({ endNo: '25', saleBundles: '2', salePieces: '0' })],
        'FRONT_ONLY'
      )
    ).toEqual([]);
  });

  /**
   * Άλλο αρχικό = άλλο μέτρημα: άνοιξε καινούριο πακέτο, ή ήταν βάρδια από
   * πριν το σωρευτικό (Λαϊκό 15/10: 255→195 και μετά 200→190).
   */
  it('άλλο αρχικό σημαίνει άλλο μέτρημα και δεν συγκρίνεται', () => {
    const laiko = (over: Partial<ScratchTicketRow>) => row({
      id: 'scr_laiko', name: 'Λαϊκό', kind: 'LOTTERY', price: 1, bundleSize: 5, ...over,
    });
    expect(
      earlierShiftIssues(
        [laiko({ startNo: '200', endNo: '190' })],
        [laiko({ startNo: '255', endNo: '195' })],
        'FRONT_ONLY'
      )
    ).toEqual([]);
  });

  it('το «035» και το «35» είναι το ίδιο αρχικό', () => {
    expect(
      earlierShiftIssues([row({ startNo: '035', endNo: '36' })], [row({ startNo: '35', endNo: '40' })], 'FRONT_ONLY').length
    ).toBe(1);
  });

  it('χωρίς προηγούμενη βάρδια δεν υπάρχει τίποτα να συγκριθεί', () => {
    expect(earlierShiftIssues([row({ endNo: '2' })], null, 'FRONT_ONLY')).toEqual([]);
    expect(earlierShiftIssues([row({ endNo: '2' })], [], 'FRONT_ONLY')).toEqual([]);
    expect(earlierShiftIssues([row({ endNo: '2' })], undefined, 'FRONT_ONLY')).toEqual([]);
  });

  it('γραμμή που δεν υπήρχε στην προηγούμενη βάρδια δεν συγκρίνεται', () => {
    expect(
      earlierShiftIssues([row({ id: 'νέο', name: 'Νέο παιχνίδι', endNo: '2' })], [row({ endNo: '9' })], 'FRONT_ONLY')
    ).toEqual([]);
  });

  /** Η ποσότητα ενός χειροκίνητου προϊόντος γράφεται ανά βάρδια και δεν μεταφέρεται. */
  it('τα χειροκίνητα προϊόντα δεν συγκρίνονται', () => {
    // Με γραμμένο τελικό και ίδιο αρχικό: μόνο ο έλεγχος του χειροκίνητου τρόπου τα αφήνει έξω.
    const manual = (qty: string) => row({ id: 'scr_manual', name: 'e-Λαϊκό', countingMode: 'manual', manualQty: qty, startNo: '0', endNo: '1' });
    expect(earlierShiftIssues([manual('4')], [manual('9')], 'FRONT_ONLY')).toEqual([]);
  });

  /** Οι αδιάθετες πεντάδες δεν μεταφέρονται: η σύγκριση μετράει πριν από αυτές. */
  it('οι αδιάθετες που ξαναγράφει η βραδινή δεν φαίνονται ως λιγότερες πωλήσεις', () => {
    const laiko = (over: Partial<ScratchTicketRow>) => row({
      id: 'scr_laiko', name: 'Λαϊκό', kind: 'LOTTERY', price: 1, bundleSize: 5, startNo: '200', ...over,
    });
    expect(
      earlierShiftIssues(
        [laiko({ endNo: '180', cancelledBundles: '2' })],  // 20 πουλημένα, 2 πεντάδες γύρισαν
        [laiko({ endNo: '185' })],                           // η πρωινή: 15
        'FRONT_ONLY'
      )
    ).toEqual([]);
  });
});

describe('Μπροστά και Πίσω ξεχωριστά', () => {
  const both = (over: Partial<ScratchTicketRow>) => row({
    startNo: '0', backEndNo: '60', backSideEnabled: true, ...over,
  });

  it('το Πίσω που έπεσε φαίνεται ακόμα κι αν το Μπροστά ανέβηκε', () => {
    const issues = earlierShiftIssues(
      [both({ endNo: '10', backStartNo: '58' })],     // Μπροστά 10, Πίσω 2
      [both({ endNo: '3', backStartNo: '55' })],      // Μπροστά 3,  Πίσω 5
      'FRONT_AND_BACK'
    );
    expect(issues.length).toBe(1);
    expect(issues[0].side).toBe('back');
    expect(issues[0].message).toContain('Πίσω');
  });

  it('όταν η γραμμή έχει δύο πλευρές το μήνυμα λέει ποια', () => {
    const [i] = earlierShiftIssues(
      [both({ endNo: '1', backStartNo: '59' })],
      [both({ endNo: '3', backStartNo: '59' })],
      'FRONT_AND_BACK'
    );
    expect(i.message).toContain('Μπροστά');
  });

  it('αν η πίσω πλευρά δεν έχει γραφτεί ακόμα δεν ειδοποιεί γι' + "' αυτήν", () => {
    expect(
      earlierShiftIssues(
        [both({ endNo: '10', backStartNo: '' })],
        [both({ endNo: '3', backStartNo: '55' })],
        'FRONT_AND_BACK'
      )
    ).toEqual([]);
  });
});

describe('η λογική χωρίς τον πίνακα', () => {
  const reading = (over: Partial<FloorReading> = {}): FloorReading => ({
    front: 0, back: 0, frontEntered: true, backEntered: false,
    frontOrigin: '0', backOrigin: '', hasBack: false, ...over,
  });

  it('βρίσκει την ίδια γραμμή με id, αλλιώς με όνομα ΚΑΙ κατηγορία', () => {
    const a: Array<{ id: string; name: string; category?: string }> = [{ id: 'x', name: '7ΑΡΙ', category: '2€' }, { id: 'y', name: '7ΑΡΙ', category: '5€' }];
    expect(matchingRow({ id: 'x', name: 'άλλο' }, a)?.id).toBe('x');
    expect(matchingRow({ id: 'z', name: '7ΑΡΙ', category: '5€' }, a)?.id).toBe('y');
    expect(matchingRow({ id: 'z', name: '7ΑΡΙ', category: '10€' }, a)).toBeUndefined();
  });

  it('η σύγκριση γίνεται στο πλήθος που δίνει ο αναγνώστης', () => {
    const rows = [{ id: 'a', name: 'Α' }];
    const out = belowEarlierShift(rows, rows, (_r) => reading());
    expect(out).toEqual([]);
    let n = 0;
    const lower = belowEarlierShift(rows, rows, () => reading({ front: n++ === 0 ? 1 : 5 }));
    expect(lower.length).toBe(1);
  });
});

describe('ποια βάρδια είναι η «προηγούμενη»', () => {
  const rows = [{ id: 'a', endNo: '3' }];
  const base = {
    handoverRows: rows, handoverShiftId: 'morning', currentShiftId: 'evening',
    dayFirstOpenedAt: '2026-11-13T06:03:00+00:00', openedAt: '2026-11-13T14:07:00+00:00',
  };

  it('η δεύτερη βάρδια της ημέρας συγκρίνεται με την πρώτη', () => {
    expect(earlierRowsForFloor(base)).toEqual(rows);
  });

  /** Η προηγούμενη της πρώτης είναι το χθεσινό βράδυ· το νέο μέτρημα δεν του χρωστά τίποτα. */
  it('η ΠΡΩΤΗ βάρδια της ημέρας δεν συγκρίνεται με το χθεσινό βράδυ', () => {
    expect(earlierRowsForFloor({ ...base, openedAt: base.dayFirstOpenedAt })).toBeNull();
  });

  it('χωρίς γνωστό άνοιγμα ημέρας δεν υποθέτει τίποτα', () => {
    expect(earlierRowsForFloor({ ...base, dayFirstOpenedAt: null })).toBeNull();
  });

  it('η ίδια η βάρδια δεν είναι δική της προηγούμενη', () => {
    expect(earlierRowsForFloor({ ...base, handoverShiftId: 'evening' })).toBeNull();
  });

  it('ανάγνωση που απέτυχε ή άδεια δεν δίνει τίποτα', () => {
    expect(earlierRowsForFloor({ ...base, handoverRows: null })).toBeNull();
    expect(earlierRowsForFloor({ ...base, handoverRows: [] })).toBeNull();
    expect(earlierRowsForFloor({ ...base, handoverRows: 'x' })).toBeNull();
  });
});

describe('η οθόνη', () => {
  const table = read('src/components/shifts/ScratchCalculatorTable.tsx');
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');

  it('ο οδηγός περνά στον πίνακα τις γραμμές της προηγούμενης βάρδιας', () => {
    expect(wizard).toContain('earlierShiftRows={earlierShiftRows}');
    expect(wizard).toContain('earlierRowsForFloor({');
    // Από το ίδιο handover που ήδη φορτώνει, όχι από δεύτερο αίτημα.
    expect(wizard).toContain('handoverRows: handover?.scratch_ticket_items');
  });

  it('το μήνυμα μπαίνει στη γραμμή ως σφάλμα, όχι ως φραγή', () => {
    expect(table).toContain('earlierShiftIssues(rows, earlierShiftRows, sellingMode)');
    expect(table).toMatch(/list\.push\(\{ message: issue\.message, severity: 'error' \}\)/);
  });

  it('υπάρχει και ειδοποίηση πάνω από τον πίνακα, για όσα παιχνίδια δεν φαίνονται', () => {
    expect(table).toContain('Λιγότερες πωλήσεις από την προηγούμενη βάρδια');
  });
});
