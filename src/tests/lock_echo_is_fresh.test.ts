import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { lockScratchRowsForSave } from '../components/shifts/ScratchCalculatorTable.tsx';
import type { ScratchTicketRow } from '../components/shifts/ScratchCalculatorTable.tsx';
import { openPack, undoLastPack } from '../lib/scratchPackHistory.ts';
import { describeLockMismatch, isLockError } from '../lib/lockMismatch.ts';
import { isPackOpening } from '../lib/scratchPackOpening.ts';

/**
 * Ο φύλακας ηχεί πίσω ό,τι είναι γραμμένο ΤΩΡΑ, όχι ό,τι ήταν όταν άνοιξε η σελίδα.
 *
 * Η Κατερίνα στη Στυλίδα, 22:15: «με πέταξε ενώ έκανα υποβολή» και μετά «μου
 * τα μηδένισε σχεδόν όλα» - το κόκκινο «Το πεδίο ... είναι κλειδωμένο και
 * μπορεί να αλλάξει μόνο από Owner/Admin», που είχε ήδη δει η Λαμία.
 *
 * Η 0083 είχε κλείσει την ΑΛΛΗ αιτία του ίδιου μηνύματος («απόν» ≠ «κενό»).
 * Η αιτία εδώ είναι στον client: το `shift` που παίρνει το wizard φορτώνεται
 * μία φορά και δεν ανανεώνεται, και το lockScratchRowsForSave έστελνε πίσω
 * τα νούμερα ΑΥΤΟΥ του στιγμιοτύπου. Μόλις ένα άνοιγμα πακέτου γραφόταν στη
 * βάση, τα δύο δεν συμφωνούσαν πια: κάθε επόμενο σώσιμο έστελνε τα ΠΑΛΙΑ
 * νούμερα πάνω στα ΝΕΑ, και ο trigger απέρριπτε ολόκληρη τη βάρδια - το
 * αυτόματο πρόχειρο, το χειροκίνητο και την υποβολή. Μετρήθηκε στα
 * πραγματικά δεδομένα της Στυλίδας: 24 από 24 παιχνίδια.
 *
 * Δεν βρέθηκε αποθηκευμένο ίχνος ανοίγματος στη βάρδια της Κατερίνας, οπότε
 * δεν αποδεικνύεται ότι αυτό χτύπησε ακριβώς εκείνη. Αποδεικνύεται ότι είναι
 * προσιτό σε κάθε υπάλληλο, και ότι ταιριάζει σε όλα τα συμπτώματα: αποτυχία
 * σε ΚΑΘΕ σώσιμο, χαμένες καταχωρήσεις, και επιτυχία μετά από ανανέωση
 * σελίδας (που διαβάζει ξανά τη βάση).
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

type Item = Record<string, unknown>;

/**
 * Η σύγκριση του trigger 0083, μόνο για τα δύο πεδία: «απόν» = «κενό», και
 * αλλαγή σε οποιοδήποτε από τα δύο απορρίπτει ΟΛΟΚΛΗΡΗ τη βάρδια - εκτός αν
 * η αλλαγή είναι άνοιγμα πακέτου (0080/0081), που περνάει πριν από τη σύγκριση.
 * Καθρέφτης του SQL· τον κρατάει δεμένο το scratch_lock_absent_is_empty.test.ts.
 * Οι τιμές των ανοιγμάτων εδώ είναι νόμιμες (μηδέν μπροστά, η βάση πίσω δεν
 * κατεβαίνει), οπότε το σχήμα αρκεί.
 */
const c = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const refuses = (oldRows: Item[], sentRows: Item[]): string | null => {
  for (const sent of sentRows) {
    const old = oldRows.find((o) => o.id === sent.id);
    if (!old) continue; // καινούρια γραμμή - όχι παραβίαση
    if (isPackOpening(old as any, sent as any)) continue; // άνοιγμα πακέτου
    if (c(old.startNo) !== c(sent.startNo)) return `startNo ${c(old.startNo)}→${c(sent.startNo)}`;
    if (c(old.backEndNo) !== c(sent.backEndNo)) return `backEndNo ${c(old.backEndNo)}→${c(sent.backEndNo)}`;
  }
  return null;
};

/** Μια γραμμή 2 € όπως τη βρίσκει η βάρδια: θέση 118, βάση πίσω 149. */
const mountRow = (): ScratchTicketRow => ({
  id: 'scr_2_gata',
  name: 'ΓΑΤΑ 2€',
  price: 2,
  startNo: '118',
  endNo: '',
  backEndNo: '149',
  backStartNo: '',
  packCode: '0000000',
});

describe('η αιτία: ηχώ από παλιό στιγμιότυπο', () => {
  const mount = mountRow();

  /** Το άνοιγμα πακέτου όπως το κάνει ο υπάλληλος: μηδέν μπροστά, η ίδια βάση πίσω. */
  const opened = () =>
    openPack({ ...mount }, { code: '0123456', soldOut: 0, startNo: '0', backEndNo: '149' } as any);

  it('το άνοιγμα γράφεται κανονικά (σχήμα ανοίγματος)', () => {
    const sent = lockScratchRowsForSave([opened() as any], [mount], false);
    expect(refuses([mount as any], sent as any)).toBeNull();
  });

  /**
   * ΤΟ ΣΦΑΛΜΑ. Μετά το άνοιγμα γράφτηκε στη βάση (OLD: θέση 0). Ο υπάλληλος
   * γράφει τον τελικό αριθμό της πώλησης - άρα το endNo δεν είναι πια κενό,
   * και η γραμμή δεν έχει πια το σχήμα ανοίγματος. Με το στιγμιότυπο της
   * ώρας που άνοιξε η σελίδα, ο φύλακας στέλνει πίσω τη ΠΑΛΙΑ θέση (118).
   */
  it('με το παλιό στιγμιότυπο, μια πώληση μετά το άνοιγμα απορρίπτει τη βάρδια', () => {
    const dbAfterOpen = lockScratchRowsForSave([opened() as any], [mount], false);
    const selling = { ...(opened() as any), endNo: '3' };

    const stale = lockScratchRowsForSave([selling], [mount], false); // στιγμιότυπο φόρτωσης
    expect(refuses(dbAfterOpen as any, stale as any)).toBe('startNo 0→118');
  });

  it('με ό,τι είναι γραμμένο τώρα, η ίδια πώληση περνάει', () => {
    const dbAfterOpen = lockScratchRowsForSave([opened() as any], [mount], false);
    const selling = { ...(opened() as any), endNo: '3' };

    const fresh = lockScratchRowsForSave([selling], dbAfterOpen as any, false);
    expect(refuses(dbAfterOpen as any, fresh as any)).toBeNull();
    // και δεν χάνεται τίποτα που έγραψε ο υπάλληλος
    expect((fresh[0] as any).endNo).toBe('3');
    expect((fresh[0] as any).packCode).toBe('0123456');
  });

  it('δεύτερο άνοιγμα στην ίδια γραμμή περνάει και με φρέσκο στιγμιότυπο', () => {
    const dbAfterOpen = lockScratchRowsForSave([opened() as any], [mount], false);
    const second = openPack(opened() as any, { code: '0123457', soldOut: 0, startNo: '0', backEndNo: '149' } as any);
    const sent = lockScratchRowsForSave([second as any], dbAfterOpen as any, false);
    expect(refuses(dbAfterOpen as any, sent as any)).toBeNull();
    expect((sent[0] as any).packCode).toBe('0123457');
  });

  /**
   * Και η αναίρεση: επαναφέρει τα παλιά νούμερα. Με φρέσκο στιγμιότυπο ο
   * φύλακας θα τα γύριζε σιωπηλά πίσω στα νέα - ΜΙΣΗ αναίρεση: ο κωδικός
   * του παλιού πακέτου με τη θέση του καινούριου. Γι' αυτό ο υπάλληλος δεν
   * την έχει (βλ. παρακάτω) - η ορατή αποτυχία ήταν καλύτερη από αυτό.
   */
  it("η αναίρεση με φρέσκο στιγμιότυπο θα γινόταν μισή - γι' αυτό δεν προσφέρεται", () => {
    const dbAfterOpen = lockScratchRowsForSave([opened() as any], [mount], false);
    const undone = undoLastPack(opened() as any);
    const sent = lockScratchRowsForSave([undone as any], dbAfterOpen as any, false)[0] as any;
    expect(sent.packCode).toBe('0000000'); // ο κωδικός γύρισε
    expect(sent.startNo).toBe('0'); //          η θέση ΟΧΙ: μισή αναίρεση
  });
});

describe('το wizard διαβάζει τη βάση πριν από κάθε σώσιμο', () => {
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');

  it('ο φύλακας δεν τροφοδοτείται πια από το στιγμιότυπο φόρτωσης', () => {
    const at = wizard.indexOf('scratch_ticket_items: lockScratchRowsForSave(');
    expect(at).toBeGreaterThan(-1);
    const call = wizard.slice(at, wizard.indexOf(')', at + 60) + 40);
    expect(call).toContain('storedScratchRef.current');
    expect(call).not.toContain('shift.custom_field_values');
  });

  it('και οι τρεις εγγραφές διαβάζουν πρώτα τη βάση', () => {
    const builds = [...wizard.matchAll(/buildCurrentPayload\('(?:DRAFT_CLOSING|SUBMITTED)'\)/g)];
    expect(builds.length).toBe(3);
    for (const m of builds) {
      const before = wizard.slice(Math.max(0, (m.index ?? 0) - 400), m.index);
      expect(before, 'πριν το buildCurrentPayload').toContain('await refreshStoredScratch()');
    }
  });

  it('αφού γραφτεί με επιτυχία, το γραμμένο γίνεται το νέο στιγμιότυπο', () => {
    expect(wizard.match(/storedScratchRef\.current = sentRows;/g)?.length).toBe(3);
  });

  /**
   * Η ανάγνωση είναι αναμονή. Αν η υποβολή ξεκινήσει σε αυτό το διάστημα,
   * ένα πρόχειρο που ακολουθεί γράφει DRAFT_CLOSING πάνω στο SUBMITTED - το
   * λάθος που περιγράφει το σχόλιο του submitStarted.
   */
  it('το αυτόματο πρόχειρο ξαναελέγχει ότι δεν ξεκίνησε υποβολή μετά την ανάγνωση', () => {
    const timer = wizard.slice(wizard.indexOf('const timer = setTimeout(async () => {'));
    const afterRefresh = timer.slice(timer.indexOf('await refreshStoredScratch()'));
    const guard = afterRefresh.indexOf('if (submitStarted.current) return;');
    const write = afterRefresh.indexOf('await updateShiftInFirestore');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(write);
  });

  /** Όποιος μπορεί να αλλάξει τα πεδία δεν περνά από τον φύλακα: δεν χρειάζεται ανάγνωση. */
  it('δεν διαβάζει τη βάση για όποιον δικαιούται να αλλάξει τα κλειδωμένα', () => {
    const fn = wizard.slice(wizard.indexOf('const refreshStoredScratch = async () => {'));
    const body = fn.slice(0, fn.indexOf('};') + 2);
    expect(body).toContain('if (canEditScratchLockedFields) return;');
  });

  it('αν η ανάγνωση αποτύχει κρατάει ό,τι είχε και το σώσιμο συνεχίζει', () => {
    const fn = wizard.slice(wizard.indexOf('const refreshStoredScratch = async () => {'));
    const body = fn.slice(0, fn.indexOf('};') + 2);
    expect(body).toContain('if (fresh) storedScratchRef.current = fresh;');
    const service = read('src/services/shiftService.ts');
    const reader = service.slice(service.indexOf('export async function fetchStoredScratchRows'));
    const readerBody = reader.slice(0, reader.indexOf('\n}\n') + 3);
    expect(readerBody).toContain('return null;');
    expect(readerBody).toContain('catch');
  });

  it('και τα τρία σφάλματα περνούν από την εξήγηση', () => {
    // autosave, χειροκίνητο πρόχειρο, υποβολή - ο ορισμός δεν μετράει (`= (err`)
    expect(wizard.match(/explainSaveError\(/g)?.length).toBe(3);
  });
});

describe('η αναίρεση πακέτου δεν προσφέρεται σε όποιον η βάση δεν αφήνει', () => {
  const table = read('src/components/shifts/ScratchCalculatorTable.tsx');

  it('το κουμπί φαίνεται μόνο σε όποιον μπορεί να αλλάξει τα κλειδωμένα', () => {
    expect(table).toContain('{!readOnly && canEditLockedFields && canUndoPack(row) && (');
    expect(table).not.toContain('{!readOnly && canUndoPack(row) && (');
  });

  it('ο χειριστής αρνείται ό,τι κρύβει το κουμπί', () => {
    const fn = table.slice(table.indexOf('const handleUndoPack = async'));
    const head = fn.slice(0, 400);
    expect(head).toContain('if (!canEditLockedFields) return;');
  });
});

describe('η διάγνωση: τι ακριβώς διέφερε', () => {
  const MSG = 'Το πεδίο Πίσω - Τελικό είναι κλειδωμένο και μπορεί να αλλάξει μόνο από Owner/Admin (παιχνίδι: Δώρο 5€)';
  const stored = [{ id: 'scr_custom_x', name: 'Δώρο 5€', startNo: '', backEndNo: '059' }];
  const sent = [{ id: 'scr_custom_x', name: 'Δώρο 5€', startNo: '', backEndNo: '' }];

  it('αναγνωρίζει το μήνυμα της κλειδαριάς', () => {
    expect(isLockError(MSG)).toBe(true);
    expect(isLockError('Η αποθήκευση της βάρδιας απέτυχε.')).toBe(false);
    expect(isLockError(undefined)).toBe(false);
  });

  it('λέει παιχνίδι, πεδίο, και τις δύο τιμές', () => {
    expect(describeLockMismatch(MSG, sent, stored)).toBe('Δώρο 5€ · Πίσω - Τελικό: βάση «059», οθόνη «»');
  });

  it('το «Μπροστά - Αρχικό» διαβάζει το startNo, όχι το backEndNo', () => {
    const msg = MSG.replace('Πίσω - Τελικό', 'Μπροστά - Αρχικό');
    const out = describeLockMismatch(
      msg,
      [{ id: 'scr_custom_x', name: 'Δώρο 5€', startNo: '118', backEndNo: '059' }],
      [{ id: 'scr_custom_x', name: 'Δώρο 5€', startNo: '0', backEndNo: '059' }]
    );
    expect(out).toBe('Δώρο 5€ · Μπροστά - Αρχικό: βάση «0», οθόνη «118»');
  });

  it('βρίσκει τη γραμμή και από το id, όταν το μήνυμα έχει id αντί για όνομα', () => {
    const out = describeLockMismatch(MSG.replace('Δώρο 5€', 'scr_custom_x'), sent, stored);
    expect(out).toContain('βάση «059»');
  });

  it('το απόν και το κενό διαβάζονται ίδια, όπως στη βάση', () => {
    const out = describeLockMismatch(MSG, [{ id: 'scr_custom_x', name: 'Δώρο 5€' }], [{ id: 'scr_custom_x', name: 'Δώρο 5€', backEndNo: '059' }]);
    expect(out).toContain('οθόνη «»');
  });

  it('γραμμή που δεν υπάρχει στη βάση το λέει', () => {
    expect(describeLockMismatch(MSG, sent, [])).toContain('δεν υπάρχει στη βάση');
  });

  it('για κάθε άλλο σφάλμα, ή χωρίς γραμμή που ταιριάζει, δεν επινοεί τίποτα', () => {
    expect(describeLockMismatch('Η αποθήκευση της βάρδιας απέτυχε.', sent, stored)).toBeNull();
    expect(describeLockMismatch(MSG, [{ id: 'other', name: 'Άλλο' }], stored)).toBeNull();
    expect(describeLockMismatch(MSG, null, null)).toBeNull();
    expect(describeLockMismatch('Το πεδίο Πίσω - Τελικό είναι κλειδωμένο και μπορεί να αλλάξει μόνο από Owner/Admin', sent, stored)).toBeNull();
  });
});
