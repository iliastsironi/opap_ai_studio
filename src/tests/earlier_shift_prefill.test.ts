import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  holdToEarlierShift, prefillFromEarlierShift, restoredFigure, rowsHeldToEarlierShift,
  type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';
import { restoreEarlierFinals, type FloorReading } from '../lib/earlierShiftFloor.ts';

/**
 * Η βραδινή ξεκινά με τα τελικά της πρωινής γραμμένα, και δεν γίνεται να
 * γράψει μικρότερο νούμερο από αυτά.
 *
 * Μέσα στην ημέρα τα νούμερα είναι σωρευτικά: η βραδινή μετράει από το ίδιο
 * αρχικό με την πρωινή. Ό,τι έκλεισε η πρωινή είναι το πάτωμα· ό,τι πουλήσει
 * η βραδινή το γράφει από πάνω.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const none = new Set<string>();

const scratch = (over: Partial<ScratchTicketRow> = {}): ScratchTicketRow => ({
  id: 'scr_7ari_5', name: '7ΑΡΙ 5€', category: 'Σκρατς 5€', kind: 'SCRATCH', price: 5,
  startNo: '148', endNo: '', backStartNo: '', backEndNo: '', ...over,
} as ScratchTicketRow);

const laiko = (over: Partial<ScratchTicketRow> = {}): ScratchTicketRow => ({
  id: 'scr_laiko', name: 'Λαϊκό Λαχείο', category: 'Λαχεία', kind: 'LOTTERY', price: 1,
  bundleSize: 5, startNo: '200', endNo: '', saleBundles: '', salePieces: '', ...over,
} as ScratchTicketRow);

const lottery = (over: Partial<ScratchTicketRow> = {}): ScratchTicketRow => ({
  id: 'lot_1', name: 'Πρωτοχρονιάτικο', category: 'Λαχεία', kind: 'LOTTERY', price: 2,
  startNo: '15', endNo: '', ...over,
} as ScratchTicketRow);

describe('το άνοιγμα της βραδινής: τα τελικά της πρωινής γραμμένα', () => {
  it('σκρατς: το κενό τελικό παίρνει το τελικό της πρωινής', () => {
    const out = prefillFromEarlierShift([scratch()], [scratch({ endNo: '153' })], 'FRONT_ONLY', none);
    expect(out.changed).toBe(true);
    expect(out.rows[0].endNo).toBe('153');
    expect(out.held).toEqual(['scr_7ari_5:front']);
  });

  it('ό,τι έχει ήδη γράψει ο υπάλληλος δεν αγγίζεται - ούτε αν είναι μικρότερο', () => {
    const typed = scratch({ endNo: '150' });
    const out = prefillFromEarlierShift([typed], [scratch({ endNo: '153' })], 'FRONT_ONLY', none);
    expect(out.changed).toBe(false);
    expect(out.rows[0].endNo).toBe('150');
    // Κρίνεται όμως ως «ήδη κριθεί», ώστε να μην ξαναγεμίσει αργότερα.
    expect(out.held).toEqual(['scr_7ari_5:front']);
  });

  it('πεντάδες: γράφονται μαζί το τελικό και οι πουλημένες, όχι το ένα μόνο', () => {
    const morning = laiko({ endNo: '190', saleBundles: '2', salePieces: '0' });
    const out = prefillFromEarlierShift([laiko()], [morning], 'FRONT_ONLY', none);
    expect(out.rows[0]).toMatchObject({ endNo: '190', saleBundles: '2', salePieces: '0' });
  });

  it('λαχείο: το τελικό είναι ό,τι απομένει, και αντιγράφεται όπως είναι', () => {
    const out = prefillFromEarlierShift([lottery()], [lottery({ endNo: '12' })], 'FRONT_ONLY', none);
    expect(out.rows[0].endNo).toBe('12');
  });

  it('Πίσω: το ενδιάμεσο νούμερο της πρωινής γράφεται στο Πίσω-Αρχικό', () => {
    const base = { backEndNo: '299' };
    const morning = scratch({ ...base, endNo: '153', backStartNo: '290' });
    const out = prefillFromEarlierShift([scratch(base)], [morning], 'FRONT_AND_BACK', none);
    expect(out.rows[0]).toMatchObject({ endNo: '153', backStartNo: '290', backEndNo: '299' });
    expect(out.held.sort()).toEqual(['scr_7ari_5:back', 'scr_7ari_5:front']);
  });

  it('«Μόνο Μπροστά»: το Πίσω δεν αγγίζεται', () => {
    const morning = scratch({ backEndNo: '299', endNo: '153', backStartNo: '290' });
    const out = prefillFromEarlierShift([scratch({ backEndNo: '299' })], [morning], 'FRONT_ONLY', none);
    expect(out.rows[0].backStartNo).toBe('');
  });

  it('πρωινή που δεν μέτρησε το παιχνίδι (κενό τελικό): δεν υπάρχει τίποτα να γραφτεί', () => {
    const out = prefillFromEarlierShift([scratch()], [scratch({ endNo: '' })], 'FRONT_ONLY', none);
    expect(out.changed).toBe(false);
    expect(out.held).toEqual([]);
  });

  /** Η βραδινή άνοιξε καινούριο πακέτο ή το αρχικό άλλαξε: τα δύο νούμερα δεν είναι συγκρίσιμα. */
  it('άλλο αρχικό από την πρωινή: τίποτα δεν γράφεται', () => {
    const out = prefillFromEarlierShift([scratch({ startNo: '0' })], [scratch({ endNo: '153' })], 'FRONT_ONLY', none);
    expect(out.changed).toBe(false);
    expect(out.held).toEqual([]);
  });

  it('άλλο Πίσω-Τελικό (κλειδωμένη βάση) από την πρωινή: το Πίσω δεν γράφεται', () => {
    const morning = scratch({ backEndNo: '299', endNo: '153', backStartNo: '290' });
    const out = prefillFromEarlierShift([scratch({ backEndNo: '120' })], [morning], 'FRONT_AND_BACK', none);
    expect(out.rows[0].endNo).toBe('153');
    expect(out.rows[0].backStartNo).toBe('');
  });

  it('χειροκίνητα προϊόντα (ποσότητα ανά βάρδια): δεν γράφεται τίποτα', () => {
    const manual = (over: object) => scratch({ countingMode: 'manual', ...over } as never);
    const out = prefillFromEarlierShift([manual({ startNo: '0' })], [manual({ startNo: '0', endNo: '1', manualQty: '4' })], 'FRONT_ONLY', none);
    expect(out.changed).toBe(false);
    expect(out.held).toEqual([]);
  });

  it('γραμμή που η προηγούμενη μετρούσε αλλιώς (πεντάδες εδώ, σειρά εκεί): δεν συγκρίνεται', () => {
    const asRange = laiko({ bundleSize: undefined, endNo: '190' });
    const out = prefillFromEarlierShift([laiko()], [asRange], 'FRONT_ONLY', none);
    expect(out.changed).toBe(false);
    expect(out.held).toEqual([]);
  });

  it('γραμμή χωρίς αντίστοιχη στην προηγούμενη βάρδια μένει όπως είναι', () => {
    const fresh = scratch({ id: 'scr_new', name: 'ΝΕΟ 5€' });
    const out = prefillFromEarlierShift([fresh], [scratch({ endNo: '153' })], 'FRONT_ONLY', none);
    expect(out.changed).toBe(false);
  });

  it('χωρίς προηγούμενη βάρδια (πρώτη της ημέρας): τίποτα', () => {
    expect(prefillFromEarlierShift([scratch()], null, 'FRONT_ONLY', none).changed).toBe(false);
    expect(prefillFromEarlierShift([scratch()], [], 'FRONT_ONLY', none).changed).toBe(false);
  });

  /** Ένα τελικό που σβήνεται για να ξαναγραφτεί δεν πρέπει να ξαναγεμίζει κάτω από τα δάχτυλα. */
  it('πλευρά που έχει ήδη κριθεί δεν ξαναγεμίζει', () => {
    const out = prefillFromEarlierShift(
      [scratch()], [scratch({ endNo: '153' })], 'FRONT_ONLY', new Set(['scr_7ari_5:front'])
    );
    expect(out.changed).toBe(false);
  });

  it('δεν αλλάζει τις γραμμές που του δίνονται', () => {
    const rows = [scratch()];
    const earlier = [scratch({ endNo: '153' })];
    const frozen = JSON.stringify([rows, earlier]);
    prefillFromEarlierShift(rows, earlier, 'FRONT_ONLY', none);
    expect(JSON.stringify([rows, earlier])).toBe(frozen);
  });

  it('η γραμμή βρίσκεται και χωρίς id, με όνομα και κατηγορία', () => {
    const out = prefillFromEarlierShift(
      [scratch({ id: 'x1' })], [scratch({ id: 'y9', endNo: '153' })], 'FRONT_ONLY', none
    );
    expect(out.rows[0].endNo).toBe('153');
  });
});

describe('ο υπάλληλος φεύγει από το πεδίο', () => {
  const morning = [scratch({ endNo: '153' })];

  it('μικρότερο νούμερο από της πρωινής: ξαναμπαίνει της πρωινής', () => {
    const hit = holdToEarlierShift(scratch({ endNo: '150' }), 'front', morning, 'FRONT_ONLY');
    expect(hit?.row.endNo).toBe('153');
    expect(restoredFigure(hit!.earlier, 'front')).toBe('153');
  });

  it('κενό: ξαναμπαίνει κι αυτό - το κενό θα μετρούσε μηδέν πωλήσεις', () => {
    expect(holdToEarlierShift(scratch({ endNo: '' }), 'front', morning, 'FRONT_ONLY')?.row.endNo).toBe('153');
  });

  it('ίδιο ή μεγαλύτερο: μένει όπως το έγραψε', () => {
    expect(holdToEarlierShift(scratch({ endNo: '153' }), 'front', morning, 'FRONT_ONLY')).toBeNull();
    expect(holdToEarlierShift(scratch({ endNo: '160' }), 'front', morning, 'FRONT_ONLY')).toBeNull();
  });

  it('λαχείο: το τελικό είναι ό,τι απομένει, άρα ΜΕΓΑΛΥΤΕΡΟ σημαίνει λιγότερες πωλήσεις', () => {
    const was = [lottery({ endNo: '12' })];                       // πρωί: 15 → 12, πούλησε 3
    expect(holdToEarlierShift(lottery({ endNo: '13' }), 'front', was, 'FRONT_ONLY')?.row.endNo).toBe('12');
    expect(holdToEarlierShift(lottery({ endNo: '12' }), 'front', was, 'FRONT_ONLY')).toBeNull();
    expect(holdToEarlierShift(lottery({ endNo: '9' }), 'front', was, 'FRONT_ONLY')).toBeNull();
  });

  it('Λαϊκό με πεντάδες: ξαναμπαίνουν και τα τρία πεδία, και το νούμερο λέγεται σε πεντάδες', () => {
    const was = [laiko({ endNo: '190', saleBundles: '2', salePieces: '0' })];
    const typed = laiko({ endNo: '195', saleBundles: '1', salePieces: '0' });   // 195 απομένουν = 1 πεντάδα πουλημένη
    const hit = holdToEarlierShift(typed, 'front', was, 'FRONT_ONLY');
    expect(hit?.row).toMatchObject({ endNo: '190', saleBundles: '2', salePieces: '0' });
    expect(restoredFigure(hit!.earlier, 'front')).toBe('38 πεντ.');
  });

  it('Λαϊκό με πεντάδες και κομμάτια: το νούμερο λέγεται και στα δύο', () => {
    const was = [laiko({ endNo: '192', saleBundles: '1', salePieces: '3' })];
    const hit = holdToEarlierShift(laiko({ endNo: '199', saleBundles: '0', salePieces: '1' }), 'front', was, 'FRONT_ONLY');
    expect(restoredFigure(hit!.earlier, 'front')).toBe('38 πεντ. + 2 κομ.');
  });

  it('Πίσω: το Πίσω-Αρχικό πέφτει όσο πουλάς, άρα ΜΕΓΑΛΥΤΕΡΟ σημαίνει λιγότερες πωλήσεις', () => {
    const was = [scratch({ backEndNo: '299', endNo: '153', backStartNo: '290' })];
    const typed = (n: string) => scratch({ backEndNo: '299', endNo: '153', backStartNo: n });
    expect(holdToEarlierShift(typed('295'), 'back', was, 'FRONT_AND_BACK')?.row.backStartNo).toBe('290');
    expect(restoredFigure(was[0], 'back')).toBe('290');
    expect(holdToEarlierShift(typed('290'), 'back', was, 'FRONT_AND_BACK')).toBeNull();
    expect(holdToEarlierShift(typed('280'), 'back', was, 'FRONT_AND_BACK')).toBeNull();
  });

  it('η μία πλευρά δεν αγγίζει την άλλη', () => {
    const was = [scratch({ backEndNo: '299', endNo: '153', backStartNo: '290' })];
    const typed = scratch({ backEndNo: '299', endNo: '150', backStartNo: '280' });
    const front = holdToEarlierShift(typed, 'front', was, 'FRONT_AND_BACK');
    expect(front?.row.endNo).toBe('153');
    expect(front?.row.backStartNo).toBe('280');
    expect(holdToEarlierShift(typed, 'back', was, 'FRONT_AND_BACK')).toBeNull();
  });

  it('με άλλο αρχικό (νέο πακέτο, ή το άλλαξε ο υπεύθυνος) δεν κρατιέται τίποτα', () => {
    expect(holdToEarlierShift(scratch({ startNo: '0', endNo: '20' }), 'front', morning, 'FRONT_ONLY')).toBeNull();
  });

  it('χωρίς προηγούμενη βάρδια δεν κρατιέται τίποτα', () => {
    expect(holdToEarlierShift(scratch({ endNo: '1' }), 'front', null, 'FRONT_ONLY')).toBeNull();
  });
});

describe('η εξήγηση πάνω από τον πίνακα', () => {
  it('μετράει τις γραμμές που κρατούν το τελικό της προηγούμενης', () => {
    const rows = [scratch(), scratch({ id: 'other', name: 'ΑΛΛΟ 2€' })];
    const earlier = [scratch({ endNo: '153' })];
    expect(rowsHeldToEarlierShift(rows, earlier, 'FRONT_ONLY')).toBe(1);
    expect(rowsHeldToEarlierShift(rows, null, 'FRONT_ONLY')).toBe(0);
    expect(rowsHeldToEarlierShift(rows, [scratch({ endNo: '' })], 'FRONT_ONLY')).toBe(0);
  });
});

describe('το lib δεν ξέρει πώς είναι φτιαγμένη μια γραμμή', () => {
  const reading = (over: Partial<FloorReading>): FloorReading => ({
    front: 0, back: 0, frontEntered: true, backEntered: false,
    frontOrigin: '1', backOrigin: '', hasBack: false, ...over,
  });

  it('αντιγράφει ΜΟΝΟ τα πεδία που του δίνουν', () => {
    const r = (endNo: string, extra: string) => ({ id: 'a', name: 'Χ', category: 'Σ', endNo, extra });
    const hit = restoreEarlierFinals(
      r('', 'δικό μου'), [r('9', 'δικό τους')],
      (row) => reading({ front: row.endNo === '' ? 0 : 9, frontEntered: row.endNo !== '' || false }),
      { when: 'blank', frontFields: ['endNo'], backFields: [] }
    );
    expect(hit?.row).toMatchObject({ endNo: '9', extra: 'δικό μου' });
  });
});

describe('το καλώδιο στον πίνακα', () => {
  const table = read('src/components/shifts/ScratchCalculatorTable.tsx');
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');

  /** Το κάθε πεδίο τελικού κρίνεται όταν ο υπάλληλος φεύγει από αυτό. */
  it('τα πεδία τελικού (Μπροστά, δύο πεντάδες/κομμάτια, Πίσω) κρίνονται στο blur', () => {
    expect(table.match(/holdFinalToEarlier\(row, 'front'\)/g)?.length).toBe(3);
    expect(table.match(/holdFinalToEarlier\(row, 'back'\)/g)?.length).toBe(1);
  });

  /**
   * Βρέθηκε δοκιμάζοντας στον browser: στο Λαϊκό το Tab πάει στο διπλανό
   * κουτάκι της ίδιας γραμμής, και το μήνυμα που έσβηνε με το focus χανόταν
   * πριν το διαβάσει κανείς - το νούμερο άλλαζε χωρίς εξήγηση.
   */
  it('το μήνυμα φεύγει όταν ΑΛΛΑΞΕΙ το νούμερο, όχι όταν μπει ο δείκτης στο πεδίο', () => {
    const focus = table.slice(table.indexOf('const startTypingFinal'), table.indexOf('const forgetHeldNote'));
    expect(focus).not.toContain('setHeldNotes');
    expect(table.match(/forgetHeldNote\(row\.id, 'front'\)/g)?.length).toBe(3);   // Μπροστά + δύο κουτάκια πεντάδων
    expect(table.match(/forgetHeldNote\(row\.id, 'back'\)/g)?.length).toBe(1);
  });

  it('η κρίση προηγείται του παλιού κλειδώματος «τελικό < αρχικό»', () => {
    const blur = table.slice(table.indexOf("if (holdFinalToEarlier(row, 'front')) return;"));
    expect(blur.indexOf("holdFinalToEarlier(row, 'front')")).toBeLessThan(blur.indexOf('Στα Σκρατς κλείδωμα'));
  });

  it('το γέμισμα τρέχει από την οθόνη και θυμάται τι έχει κριθεί', () => {
    expect(table).toContain('prefillFromEarlierShift(rows, earlierShiftRows, sellingMode, earlierFill.current.done)');
    expect(table).toContain('earlierFill.current.done.add(key)');
  });

  it('ο μηδενισμός γεμίζει ξανά με της προηγούμενης', () => {
    const reset = table.slice(table.indexOf('const handleReset'), table.indexOf('const handleReset') + 700);
    expect(reset).toContain('earlierFill.current.done.clear()');
  });

  it('όσο πληκτρολογεί, η γραμμή δεν παίρνει το κόκκινο «γράφεις λιγότερα»', () => {
    expect(table).toContain('issue.rowId !== typingRowId');
  });

  it('ο πίνακας δεν γεμίζει όταν είναι μόνο για ανάγνωση', () => {
    expect(table).toMatch(/if \(readOnly \|\| !Array\.isArray\(earlierShiftRows\)/);
    expect(table).toContain('if (readOnly) return false;');
  });

  /** Δεν γράφεται τίποτα που να είναι κλειδωμένο (0006): ούτε το αρχικό ούτε το Πίσω-Τελικό. */
  it('δεν αντιγράφει κλειδωμένα πεδία', () => {
    const fields = table.slice(table.indexOf('const frontFinalFields'), table.indexOf('export function prefillFromEarlierShift'));
    expect(fields).not.toMatch(/startNo|backEndNo/);
  });

  it('η οθόνη κλεισίματος περνάει στον πίνακα τις ίδιες γραμμές που ελέγχει', () => {
    expect(wizard).toContain('earlierShiftRows={earlierShiftRows}');
  });
});
