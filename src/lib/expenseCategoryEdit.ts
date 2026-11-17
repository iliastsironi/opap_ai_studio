/**
 * Η επεξεργασία των κατηγοριών εξόδων: όνομα, σειρά, ορατότητα, και (μόνο στις δικές σου) η πλευρά.
 *
 * «Να επεξεργάζεσαι τις κατηγορίες εξόδων, όνομα κλπ.»
 *
 * ΤΙ ΔΕΝ ΑΛΛΑΖΕΙ ΠΟΤΕ: το `key`. Ζει μέσα σε κάθε γραμμή shift_expenses.category - χιλιάδες -
 * και η μετονομασία αλλάζει μόνο το `label`, που διαβάζεται από τον πίνακα παντού. Γι' αυτό
 * ένα νέο όνομα φαίνεται αμέσως και στα παλιά έξοδα, χωρίς να ξαναγραφτεί κανένα.
 *
 * Η ΠΛΕΥΡΑ (πρακτορείο / καφές / εταιρία) αποφασίζει πού πέφτει το έξοδο στο P&L, και αν
 * μετράει στο ταμείο. Αλλάζοντάς την, αλλάζει ΚΑΙ ΤΟ ΠΑΡΕΛΘΟΝ της κατηγορίας στο P&L. Γι' αυτό:
 *   - οι ενσωματωμένες την έχουν κλειδωμένη (ο καφές είναι πάντα καφές, η εταιρία εταιρία)·
 *   - στις δικές σου αλλάζει, με προειδοποίηση.
 *
 * ΟΡΑΤΟΤΗΤΑ: μια κρυμμένη κατηγορία δεν προτείνεται για νέα έξοδα, αλλά εξακολουθεί να
 * διαβάζεται στα παλιά. Δεν σβήνεται ποτέ - γι' αυτό «κρύβεται» και δεν «διαγράφεται».
 */

import { MAX_LABEL_LENGTH } from './limits.ts';
import { sortCategories, type ExpenseCategoryDef } from './expenseCategories.ts';

const norm = (s: string) => s.trim().toLocaleLowerCase('el-GR');

/** Ένα μήνυμα προς τον χρήστη, ή null αν το όνομα στέκει. */
export function categoryLabelProblem(
  label: string,
  id: string | undefined,
  categories: ReadonlyArray<ExpenseCategoryDef>
): string | null {
  const trimmed = label.trim();
  if (trimmed === '') return 'Γράψτε ένα όνομα.';
  if (trimmed.length > MAX_LABEL_LENGTH) return `Το όνομα χωράει έως ${MAX_LABEL_LENGTH} χαρακτήρες.`;
  const clash = categories.some((c) => c.id !== id && norm(c.label) === norm(trimmed));
  return clash ? 'Υπάρχει ήδη κατηγορία με αυτό το όνομα.' : null;
}

/** Η πλευρά αλλάζει μόνο σε δικές σου κατηγορίες. */
export function canChangeSide(category: Pick<ExpenseCategoryDef, 'isBuiltin'>): boolean {
  return !category.isBuiltin;
}

/**
 * Μπορεί να κρυφτεί; Όχι αν είναι η τελευταία ορατή: μια φόρμα εξόδου χωρίς καμία κατηγορία
 * δεν αποθηκεύει τίποτα, και ο χρήστης δεν έχει τρόπο να καταλάβει γιατί.
 */
export function canHideCategory(categories: ReadonlyArray<ExpenseCategoryDef>, id: string | undefined): boolean {
  const others = categories.filter((c) => c.id !== id && c.isActive);
  return others.length > 0;
}

export interface SortChange {
  id: string;
  sortOrder: number;
}

/**
 * Η νέα σειρά όταν μια κατηγορία ανεβαίνει (delta −1) ή κατεβαίνει (+1), ως ΜΟΝΟ οι γραμμές που
 * αλλάζουν. Οι αριθμοί ξαναμοιράζονται ανά 10 (10, 20, 30...): οι δικές σου κατηγορίες γεννιούνται
 * όλες με 500, και η ανταλλαγή δύο ίδιων αριθμών δεν θα μετακινούσε τίποτα.
 */
export function moveCategory(
  categories: ReadonlyArray<ExpenseCategoryDef>,
  id: string,
  delta: -1 | 1
): SortChange[] {
  const ordered = sortCategories(categories);
  const from = ordered.findIndex((c) => c.id === id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= ordered.length) return [];
  const next = [...ordered];
  [next[from], next[to]] = [next[to], next[from]];
  const changes: SortChange[] = [];
  next.forEach((c, i) => {
    const sortOrder = (i + 1) * 10;
    if (c.id && c.sortOrder !== sortOrder) changes.push({ id: c.id, sortOrder });
  });
  return changes;
}
