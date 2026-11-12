/**
 * Οι κατηγορίες εξόδων, όπως τις ορίζει ο ιδιοκτήτης.
 *
 * Ήταν επτά σταθερές μέσα στον κώδικα. Τώρα ζουν σε πίνακα ανά οργανισμό
 * (0074) και ο ιδιοκτήτης προσθέτει όσες θέλει.
 *
 * ΓΙΑΤΙ ΚΑΘΕ ΚΑΤΗΓΟΡΙΑ ΔΗΛΩΝΕΙ ΠΛΕΥΡΑ: η κατηγορία είναι αυτή που αποφασίζει
 * αν ένα έξοδο βαραίνει το πρακτορείο ή τον καφέ. Όσο οι κατηγορίες ήταν
 * επτά και γνωστές, η ερώτηση «είναι του καφέ;» απαντιόταν με μία σύγκριση
 * με το EXPENSES_FNB. Με ελεύθερες κατηγορίες αυτή η σύγκριση θα έστελνε
 * ΚΑΘΕ νέα κατηγορία στο πρακτορείο - σιωπηλά, και το περιθώριο του καφέ θα
 * γινόταν λάθος χωρίς κανένα μήνυμα. Οπότε η πλευρά είναι ιδιότητα της
 * κατηγορίας, και το isFnbCategory παρακάτω είναι ο ΜΟΝΟΣ τρόπος να
 * απαντηθεί η ερώτηση σε όλο το έργο.
 */

import { isElevatedRole } from './authCircles.ts';
import { stripGreekAccents } from './greekTypography.ts';

/**
 * Ποιος πληρώνει.
 *
 * COMPANY δεν είναι τρίτη «δουλειά» - είναι η παραδοχή ότι κάποια έξοδα δεν
 * ανήκουν σε κανένα μαγαζί: ΕΦΚΑ, ΙΚΑ, εφορία. Χωρίς αυτό, ένα τέτοιο
 * έξοδο καταχωρημένο από την οθόνη εξόδων θα φόρτωνε τα «Έξοδα Ημέρας» του
 * καταστήματος που έτυχε να είναι επιλεγμένο, ενώ το ίδιο έξοδο γραμμένο
 * στο tab «Έξοδα Εταιρίας» θα πήγαινε αλλού. Ίδια ερώτηση, δύο απαντήσεις,
 * ανάλογα με το πού στεκόταν κανείς όταν το έγραψε.
 */
export type ExpenseSide = 'AGENCY' | 'FNB' | 'COMPANY';

/**
 * Η πλευρά μιας κατηγορίας, όπως τη γράφει η βάση.
 *
 * Υπήρχε ως ένα ternary δύο δρόμων μέσα στον mapper - `side === 'FNB' ? 'FNB'
 * : 'AGENCY'` - γραμμένο όταν οι πλευρές ήταν όντως δύο. Το 0075 πρόσθεσε
 * την τρίτη στη ΒΑΣΗ και το ternary την ισοπέδωσε: κάθε «Έξοδο Εταιρίας»
 * γύριζε ως AGENCY, οπότε το isCompanyCategory έλεγε ΟΧΙ για τη μοναδική
 * κατηγορία που υπάρχει γι' αυτό, το P&L δεν το έβγαζε ποτέ από το μαγαζί,
 * και ο ΕΦΚΑ χρεωνόταν στο πρακτορείο που έτυχε να είναι επιλεγμένο.
 *
 * Μία συνάρτηση, ώστε μια τέταρτη πλευρά να έχει ένα σημείο να προστεθεί
 * αντί για ένα ternary να ξεχαστεί.
 */
export function normalizeExpenseSide(value: unknown): ExpenseSide {
  return value === 'FNB' || value === 'COMPANY' ? value : 'AGENCY';
}

export interface ExpenseCategoryDef {
  id?: string;
  /** Ό,τι αποθηκεύεται στο shift_expenses.category. Δεν αλλάζει ποτέ. */
  key: string;
  label: string;
  side: ExpenseSide;
  sortOrder: number;
  isActive: boolean;
  isBuiltin: boolean;
}

/**
 * Οι επτά αρχικές - ο σπόρος του 0074 και το δίχτυ ασφαλείας.
 *
 * Χρησιμοποιούνται μόνο όσο δεν έχει φορτώσει ο πίνακας (πρώτο render,
 * αποτυχημένο fetch). Η αληθινή λίστα έρχεται πάντα από τη βάση· αν αυτές
 * εδώ άρχιζαν να διαφωνούν με τον πίνακα, θα είχαμε πάλι δύο απαντήσεις
 * στην ίδια ερώτηση.
 */
export const BUILTIN_EXPENSE_CATEGORIES: ExpenseCategoryDef[] = [
  { key: 'EXPENSES_GP', label: 'Έξοδα ΓΠ (Γενικά Πληρωμών)', side: 'AGENCY', sortOrder: 10, isActive: true, isBuiltin: true },
  { key: 'EXPENSES_FNB', label: 'Έξοδα FnB (Κυλικείο)', side: 'FNB', sortOrder: 20, isActive: true, isBuiltin: true },
  { key: 'SUPPLIES', label: 'Αναλώσιμα / Χαρτί (ΓΠ)', side: 'AGENCY', sortOrder: 30, isActive: true, isBuiltin: true },
  { key: 'UTILITIES', label: 'Λογαριασμοί / ΔΕΗ (ΓΠ)', side: 'AGENCY', sortOrder: 40, isActive: true, isBuiltin: true },
  { key: 'CLEANING', label: 'Καθαριότητα (ΓΠ)', side: 'AGENCY', sortOrder: 50, isActive: true, isBuiltin: true },
  { key: 'MAINTENANCE', label: 'Συντήρηση / Βλάβες (ΓΠ)', side: 'AGENCY', sortOrder: 60, isActive: true, isBuiltin: true },
  { key: 'OTHER', label: 'Λοιπά Έξοδα (ΓΠ)', side: 'AGENCY', sortOrder: 70, isActive: true, isBuiltin: true },
  { key: 'EXPENSES_COMPANY', label: 'Έξοδα Εταιρίας (ΕΦΚΑ, ΙΚΑ, εφορία)', side: 'COMPANY', sortOrder: 80, isActive: true, isBuiltin: true },
];

/** Η μία κατηγορία του καφέ που υπήρχε πριν τον πίνακα. */
export const FNB_EXPENSE_CATEGORY = 'EXPENSES_FNB';

/** Η ενσωματωμένη κατηγορία για ό,τι πληρώνει η εταιρία, όχι το μαγαζί. */
export const COMPANY_EXPENSE_CATEGORY = 'EXPENSES_COMPANY';

export const sortCategories = (list: readonly ExpenseCategoryDef[]): ExpenseCategoryDef[] =>
  [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'el'));

/**
 * Όσες προσφέρονται για νέα καταχώρηση.
 *
 * Μια αποσυρμένη κατηγορία εξακολουθεί να διαβάζεται στα παλιά έξοδα - απλώς
 * δεν προτείνεται πια. Γι' αυτό αποσύρεται αντί να σβήνεται.
 */
export const activeCategories = (list: readonly ExpenseCategoryDef[]): ExpenseCategoryDef[] =>
  sortCategories(list.filter((c) => c.isActive));

/**
 * Ανήκει αυτό το έξοδο στον καφέ;
 *
 * Η ΜΟΝΗ απάντηση στην ερώτηση. Το P&L, οι αναφορές και οι φόρμες περνάνε
 * όλα από εδώ.
 *
 * Χωρίς λίστα - ή με κατηγορία που δεν υπάρχει σε αυτήν, π.χ. έξοδο γραμμένο
 * με κατηγορία που αποσύρθηκε και διαγράφηκε - πέφτει πίσω στην ιστορική
 * σταθερά, που είναι ό,τι ίσχυε για κάθε γραμμή γραμμένη πριν το 0074.
 */
export function isFnbCategory(category: unknown, categories?: readonly ExpenseCategoryDef[]): boolean {
  const key = String(category ?? '');
  const match = categories?.find((c) => c.key === key);
  return match ? match.side === 'FNB' : key === FNB_EXPENSE_CATEGORY;
}

/**
 * Το πληρώνει η εταιρία, όχι το κατάστημα;
 *
 * Όπως και το isFnbCategory, η ΜΟΝΗ απάντηση. Ένα τέτοιο έξοδο φεύγει από
 * τα Έξοδα Ημέρας του μαγαζιού και προσγειώνεται στα Έξοδα Εταιρίας - που
 * χρεώνονται ολόκληρα στο πρακτορείο. Τα χρήματα δεν διπλομετρώνται και
 * δεν χάνονται· αλλάζουν κουβά.
 */
export function isCompanyCategory(category: unknown, categories?: readonly ExpenseCategoryDef[]): boolean {
  const key = String(category ?? '');
  const match = categories?.find((c) => c.key === key);
  return match ? match.side === 'COMPANY' : key === COMPANY_EXPENSE_CATEGORY;
}

/**
 * Ποιος γράφει έξοδο που πληρώνει η εταιρία.
 *
 * Ο διευθυντής και πάνω - ίδιος κύκλος με το auth_is_elevated() της βάσης,
 * που είναι η πύλη που όντως φυλάει τον πίνακα (0082). Όχι ο υπάλληλος: ένα
 * ΕΦΚΑ δεν πληρώνεται από το συρτάρι του ταμείου, δεν περνάει σε βάρδια και
 * δεν βαραίνει μαγαζί· είναι δουλειά των βιβλίων.
 *
 * Μέχρι το 0082 η απάντηση ήταν «μόνο ο ιδιοκτήτης», και δεν ήταν γραμμένη
 * πουθενά στην οθόνη - ζούσε μόνο μέσα στο RLS. Η φόρμα πρόσφερε την
 * κατηγορία σε όλους, το ποσό γραφόταν, και το σφάλμα ερχόταν από τη βάση
 * στο τέλος.
 */
export function canRecordCompanyExpense(
  roleCodes: ReadonlyArray<string> | null | undefined,
  permissions?: ReadonlyArray<string> | null
): boolean {
  return isElevatedRole(roleCodes, permissions);
}

/**
 * Όσες κατηγορίες προσφέρονται σε ΑΥΤΟΝ τον χρήστη για νέα καταχώρηση.
 *
 * Το activeCategories απαντάει «τι υπάρχει»· αυτό απαντάει «τι μπορεί να
 * γραφτεί». Οι δύο ερωτήσεις ήταν μία, και γι' αυτό ο υπάλληλος έβλεπε στη
 * λίστα μια κατηγορία που η βάση δεν τον άφηνε ποτέ να χρησιμοποιήσει.
 */
export function offerableCategories(
  list: readonly ExpenseCategoryDef[],
  roleCodes: ReadonlyArray<string> | null | undefined,
  permissions?: ReadonlyArray<string> | null
): ExpenseCategoryDef[] {
  const active = activeCategories(list);
  if (canRecordCompanyExpense(roleCodes, permissions)) return active;
  return active.filter((c) => c.side !== 'COMPANY');
}

/** Τα keys που ανήκουν στον καφέ - η μορφή που θέλει η μηχανή του P&L. */
export const fnbCategoryKeys = (categories: readonly ExpenseCategoryDef[]): string[] =>
  categories.filter((c) => c.side === 'FNB').map((c) => c.key);

export const categoryLabel = (category: unknown, categories: readonly ExpenseCategoryDef[]): string => {
  const key = String(category ?? '');
  return categories.find((c) => c.key === key)?.label ?? key;
};

const MAX_KEY = 40;

/**
 * Το key μιας νέας κατηγορίας, από το όνομα που έγραψε ο χρήστης.
 *
 * Λατινικό και κεφαλαίο, γιατί κάθεται δίπλα στα EXPENSES_GP και UTILITIES
 * μέσα στην ίδια στήλη και κάποιος κάποτε θα το διαβάσει σε SQL. Το πρόθεμα
 * ξεχωρίζει τις δικές του από τις ενσωματωμένες, ώστε μια μελλοντική
 * ενσωματωμένη κατηγορία να μην μπορεί να συγκρουστεί με μια δική του.
 */
const GREEK_TO_LATIN: Record<string, string> = {
  Α: 'A', Β: 'V', Γ: 'G', Δ: 'D', Ε: 'E', Ζ: 'Z', Η: 'I', Θ: 'TH', Ι: 'I', Κ: 'K',
  Λ: 'L', Μ: 'M', Ν: 'N', Ξ: 'X', Ο: 'O', Π: 'P', Ρ: 'R', Σ: 'S', Τ: 'T', Υ: 'Y',
  Φ: 'F', Χ: 'CH', Ψ: 'PS', Ω: 'O',
};

export function expenseCategoryKey(label: string, taken: readonly string[] = []): string {
  const base =
    stripGreekAccents(label)
      .toLocaleUpperCase('el-GR')
      .split('')
      .map((ch) => GREEK_TO_LATIN[ch] ?? ch)
      .join('')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, MAX_KEY) || 'CATEGORY';
  const prefixed = `CUSTOM_${base}`.slice(0, MAX_KEY);
  if (!taken.includes(prefixed)) return prefixed;
  // Δύο κατηγορίες με το ίδιο όνομα δεν επιτρέπονται από τη φόρμα, αλλά μια
  // αποσυρμένη με το ίδιο όνομα μπορεί να υπάρχει ήδη στον πίνακα.
  for (let n = 2; n < 1000; n++) {
    const candidate = `${prefixed.slice(0, MAX_KEY - String(n).length - 1)}_${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `CUSTOM_${Date.now()}`;
}
