import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Η φόρμα «Καταχώρηση Νέου Εξόδου Ταμείου» έλεγε δύο αντίθετα πράγματα.
 *
 * Για έξοδο εταιρίας (ΕΦΚΑ, ΙΚΑ, εφορία) το γαλάζιο πλαίσιο έγραφε «δεν
 * περνάει σε καμία βάρδια», και ακριβώς από κάτω το μωβ έγραφε «Ενεργή
 * Βάρδια … θα μεταφερθεί αυτόματα στο κλείσιμο της βάρδιας». Ισχύει το
 * πρώτο: το έξοδο εταιρίας γράφεται στον πίνακα της εταιρίας και δεν παίρνει
 * ποτέ βάρδια.
 *
 * Μετά ο πράκτορας: «ας βάλει στο έξοδο μία επιλογή να το χρεώνουμε εμείς
 * κατά βούληση· αν δεν την πατάμε, να μη χρεώνεται σε κανένα ταμείο, απλά να
 * καταχωρείται στα έξοδα». Το μωβ πλαίσιο έγινε αυτή η επιλογή.
 */

const src = fs.readFileSync(path.join(process.cwd(), 'src/components/modules/ExpensesManager.tsx'), 'utf8');

/** Το πλαίσιο της επιλογής: από το άνοιγμα του label μέχρι το κλείσιμο του. */
const checkbox = (): string => {
  const at = src.indexOf('htmlFor="expense-charge-till"');
  expect(at, 'λείπει το τσεκ χρέωσης').toBeGreaterThan(0);
  return src.slice(at, src.indexOf('</label>', at));
};

describe('το τσεκ «Χρέωση στο ταμείο της βάρδιας που τρέχει»', () => {
  it('υπάρχει μόνο για έξοδο καταστήματος', () => {
    const at = src.indexOf('htmlFor="expense-charge-till"');
    const before = src.slice(src.lastIndexOf('{!isCompanyEntry && (', at), at);
    expect(before.length).toBeLessThan(200);          // ο όρος είναι ακριβώς πριν το label
    expect(src.indexOf('expense-category')).toBeGreaterThan(at);   // και δεν παρασύρει τα επόμενα πεδία
  });

  it('ξεκινά ΑΤΣΕΚΑΡΙΣΤΟ: ό,τι δεν πατιέται δεν χρεώνεται πουθενά', () => {
    expect(src).toContain('const [chargeToTill, setChargeToTill] = useState(false);');
  });

  it('κάθε νέο άνοιγμα και κάθε κλείσιμο της φόρμας το ξαναβάζουν ατσεκάριστο', () => {
    expect(src.slice(src.indexOf('const closeForm'), src.indexOf('const openEdit'))).toContain('setChargeToTill(false);');
    const opener = src.slice(src.indexOf('// «νέο έξοδο» πρέπει να είναι νέο έξοδο.'), src.indexOf('<Plus className="w-4 h-4" />'));
    expect(opener).toContain('setChargeToTill(false);');
  });

  it('χωρίς ανοιχτή βάρδια δεν τσεκάρεται, και το λέει', () => {
    const b = checkbox();
    expect(b).toContain('disabled={!canCharge}');
    expect(b).toContain('Δεν υπάρχει ανοιχτή βάρδια αυτή τη στιγμή.');
    expect(src).toContain('const canCharge = !!activeShift || wasCharged;');
  });

  it('λέει καθαρά τι θα γίνει και στις δύο περιπτώσεις', () => {
    const b = checkbox();
    expect(b).toContain('Το έξοδο αφαιρείται από το ταμείο και μεταφέρεται αυτόματα στο κλείσιμο της βάρδιας.');
    expect(b).toContain('Δεν χρεώνεται σε κανένα ταμείο· καταχωρείται μόνο στα έξοδα.');
  });

  it('το αντιφατικό πλαίσιο «Ενεργή Βάρδια» δεν υπάρχει πια', () => {
    expect(src).not.toContain('⚡ Ενεργή Βάρδια');
    expect(src).not.toContain('Δεν υπάρχει ανοιχτή βάρδια αυτή τη στιγμή. Το έξοδο θα καταγραφεί στο γενικό αρχείο εξόδων.');
  });
});

describe('τι γράφεται όταν πατηθεί η Καταχώρηση', () => {
  it('δένεται στη βάρδια που τρέχει ΜΟΝΟ αν τσεκαρίστηκε, αλλιώς δεν δένεται πουθενά', () => {
    expect(src).toContain('effectiveCharge && activeShift ? activeShift : null');
    expect(src).toContain('charged_to_till: !!(effectiveCharge && activeShift),');
  });

  it('το έξοδο εταιρίας δεν παίρνει ποτέ βάρδια', () => {
    const company = src.slice(src.indexOf('await addCompanyDailyExpense({'), src.indexOf('} else {', src.indexOf('await addCompanyDailyExpense({')));
    expect(company).not.toContain('activeShift');
    expect(company).not.toContain('shift_id');
    expect(company).not.toContain('charged_to_till');
  });

  it('το γαλάζιο πλαίσιο εταιρίας υπάρχει ακόμα και λέει ότι δεν περνάει σε βάρδια', () => {
    expect(src).toContain('Έξοδο εταιρίας — χωρίς κατάστημα');
    expect(src).toContain('δεν περνάει σε καμία βάρδια');
  });
});

describe('η διόρθωση ενός εξόδου', () => {
  const from = src.indexOf('// Κατάστημα → κατάστημα.');
  const edit = src.slice(from, src.indexOf('await loadExpenses();', from));

  it('κρίνεται από τη βάρδια ΠΡΙΝ γραφτεί οτιδήποτε', () => {
    expect(from).toBeGreaterThan(0);
    expect(edit.indexOf('chargeChangeBlock(')).toBeGreaterThan(-1);
    expect(edit.indexOf('if (blocked)')).toBeLessThan(edit.indexOf('await updateAndSyncShiftExpense('));
  });

  it('το ξετσεκάρισμα ξεδένει το έξοδο και το σημαδεύει «δεν χρεώνεται»', () => {
    expect(edit).toContain('const unCharge = wasCharged && !effectiveCharge;');
    expect(edit).toContain('...(unCharge ? { charged_to_till: false, shift_id: null } : {})');
  });

  it('το τσεκάρισμα το δένει στη βάρδια που τρέχει και τη ξαναμετράει', () => {
    expect(edit).toContain('const newlyCharged = !wasCharged && effectiveCharge && !!activeShift;');
    expect(edit).toContain('...(newlyCharged ? { charged_to_till: true, shift_id: activeShift!.id } : {})');
    expect(edit).toContain('await syncShiftExpensesCashTotal(orgId, editing.store_id, activeShift!.id)');
  });

  it('η κατηγορία πια δεν αγγίζει το ταμείο', () => {
    expect(edit).not.toContain('categoryChanged');
    expect(edit).not.toContain('countsInTill');
  });
});
