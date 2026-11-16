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
 * ποτέ βάρδια. Το δεύτερο πλαίσιο ήταν απλώς εκεί χωρίς όρο.
 */

const src = fs.readFileSync(path.join(process.cwd(), 'src/components/modules/ExpensesManager.tsx'), 'utf8');

/** Το πλαίσιο που αρχίζει με αυτό το άνοιγμα, μέχρι το δικό του κλείσιμο. */
const block = (opening: string): string => {
  const at = src.indexOf(opening);
  expect(at, `λείπει το πλαίσιο ${opening}`).toBeGreaterThan(0);
  const end = src.indexOf('\n              )}\n', at);
  expect(end).toBeGreaterThan(at);
  return src.slice(at, end);
};

describe('τα πλαίσια πάνω από τη φόρμα εξόδου', () => {
  const ACTIVE = '{!editing && !isCompanyEntry && categoryCountsInTill && (';
  const OUT_OF_TILL = '{!editing && !isCompanyEntry && !categoryCountsInTill && (';

  it('η ένδειξη «Ενεργή Βάρδια» εμφανίζεται μόνο σε ΝΕΟ έξοδο καταστήματος που πληρώνεται από το ταμείο', () => {
    expect(block(ACTIVE)).toContain('Ενεργή Βάρδια:');
  });

  it('κατηγορία εκτός ταμείου: λέει ότι ΔΕΝ χρεώνεται στο ταμείο, και δεν δείχνει βάρδια', () => {
    const b = block(OUT_OF_TILL);
    expect(b).toContain('Δεν χρεώνεται στο ταμείο της βάρδιας');
    expect(b).not.toContain('Ενεργή Βάρδια');
  });

  it('τα πλαίσια κλείνουν με τον δικό τους όρο, χωρίς να παρασύρουν τα επόμενα πεδία', () => {
    for (const opening of [ACTIVE, OUT_OF_TILL]) {
      expect(block(opening)).not.toContain('expense-category');
    }
    expect(src.indexOf('expense-category')).toBeGreaterThan(src.indexOf(OUT_OF_TILL));
  });

  it('το έξοδο εταιρίας δεν παίρνει ποτέ βάρδια', () => {
    const company = src.slice(src.indexOf('await addCompanyDailyExpense({'), src.indexOf('} else {', src.indexOf('await addCompanyDailyExpense({')));
    expect(company).not.toContain('activeShift');
    expect(company).not.toContain('shift_id');
  });

  it('το γαλάζιο πλαίσιο εταιρίας υπάρχει ακόμα και λέει ότι δεν περνάει σε βάρδια', () => {
    expect(src).toContain('Έξοδο εταιρίας — χωρίς κατάστημα');
    expect(src).toContain('δεν περνάει σε καμία βάρδια');
  });
});
