/**
 * Σε τι μονάδα ΔΕΙΧΝΕΤΑΙ ένα πλήθος λαχείων.
 *
 * «Στην επιθεώρηση την πρωινή τα λαχεία να τα εμφανίζει σαν πεντάδες και όχι
 * σαν κομμάτια, γιατί τα βλέπουν και μπερδεύονται. Το ίδιο και όταν κάνεις
 * επιθεώρηση ταμείου μετά σαν υπεύθυνος.»
 *
 * Η απάντηση υπήρχε ήδη: το κατάστημα έχει δηλώσει ανά λαχείο σε τι μετράει
 * (lottery_units, lib/lotteryUnits.ts) και το ταμείο τη σέβεται - και τα δύο
 * μαγαζιά του πρακτορείου έχουν δηλώσει ΠΕΝΤΑΔΕΣ σε όλα. Οι δύο
 * επιθεωρήσεις όμως δεν ρωτούσαν ποτέ: έγραφαν ό,τι κρατάει η γραμμή, που
 * είναι κομμάτια, και ο υπάλληλος έβλεπε «200» εκεί που μέτρησε 40.
 *
 * Η ΓΡΑΜΜΗ ΔΕΝ ΑΛΛΑΖΕΙ. Μέσα της το Λαϊκό μένει 200 κομμάτια, όπως το
 * κρατάει κάθε υπολογισμός και κάθε αποθηκευμένη βάρδια. Αυτό το αρχείο
 * αλλάζει μόνο το ΤΙ ΔΙΑΒΑΖΕΙ ο άνθρωπος, και το γυρίζει πίσω σε κομμάτια
 * όταν ο άνθρωπος γράψει.
 *
 * Η παγίδα του `|| 5` ζει και εδώ: πεντάδα 0 ΔΕΝ σημαίνει «δεν ορίστηκε»,
 * σημαίνει ότι η μονάδα ΕΙΝΑΙ η πεντάδα - το Εθνικό, του οποίου τα 20 €
 * είναι η πεντάδα. Διαιρώντας το, 337 πεντάδες έγιναν 67· πολλαπλασιάζοντας
 * την τιμή του, τα 20 € έγιναν 100.
 */

import { bundleSizeForUnit, isBundlesOnly, unitFor, type LegacyUnitSettings } from './lotteryUnits.ts';

export interface QuantityRow {
  id?: unknown;
  bundleSize?: unknown;
  price?: unknown;
}

export interface QuantityView {
  /** Πόσα κομμάτια έχει μία μονάδα. 0 = ο αριθμός ΕΙΝΑΙ ήδη σε μονάδες. */
  size: number;
  /** Μετριέται σε πεντάδες; */
  inBundles: boolean;
  /** Πληθυντικός, για κείμενο: «πεντάδες» / «κομμάτια». */
  noun: string;
  /** Ενικός, για τιμή ανά μονάδα: «πεντάδα» / «κομμάτι». */
  nounSingular: string;
  /** Σύντομο, για στήλες πίνακα: «πεντ.» / «τμχ». */
  short: string;
  /** Η τιμή ΜΙΑΣ μονάδας. */
  unitPrice: number;
}

const PIECES_NOUNS = { noun: 'κομμάτια', nounSingular: 'κομμάτι', short: 'τμχ' };
const BUNDLE_NOUNS = { noun: 'πεντάδες', nounSingular: 'πεντάδα', short: 'πεντ.' };

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Πώς δείχνεται αυτή η γραμμή σε αυτό το μαγαζί.
 *
 * Τα σκρατς μετριούνται πάντα σε κομμάτια: ένα δελτίο είναι ένα δελτίο.
 * Μόνο τα λαχεία έχουν μονάδα που τη διαλέγει το κατάστημα.
 */
export function quantityView(
  row: QuantityRow | null | undefined,
  isLottery: boolean,
  units?: Record<string, unknown> | null,
  legacy?: LegacyUnitSettings | null
): QuantityView {
  const price = num(row?.price);
  if (!isLottery) {
    return { size: 0, inBundles: false, ...PIECES_NOUNS, unitPrice: price };
  }

  const unit = unitFor(row?.id, units, legacy, row?.bundleSize);
  const bundles = isBundlesOnly(unit);
  // Η διαίρεση κρέμεται από το ΑΝ δείχνουμε πεντάδες, όχι από το αν το
  // παιχνίδι έχει πεντάδα. Το bundleSizeForUnit επιστρέφει 5 και για το
  // DUAL - που είναι η προεπιλογή του Λαϊκού - και χωρίς αυτή τη γραμμή ένα
  // μαγαζί που μετράει ΚΑΙ ΤΑ ΔΥΟ έβλεπε «40 κομμάτια» για 200 δελτία, με
  // τιμή 10 € το κομμάτι. Στο DUAL ο αριθμός της γραμμής είναι κομμάτια και
  // έτσι διαβάζεται.
  const size = bundles ? bundleSizeForUnit(unit, row?.bundleSize) : 0;
  return {
    size,
    inBundles: bundles,
    ...(bundles ? BUNDLE_NOUNS : PIECES_NOUNS),
    // Μια γραμμή κοστολογημένη ανά κομμάτι αξίζει επί πεντάδα· μια γραμμή
    // της οποίας η τιμή ΕΙΝΑΙ η πεντάδα δεν πολλαπλασιάζεται.
    unitPrice: size > 0 ? price * size : price,
  };
}

/**
 * Πόσες μονάδες δείχνει η στήλη του πλήθους.
 *
 * Ένα κατάστημα που μετράει ένα λαχείο σε πεντάδες θέλει το πλήθος σε
 * πεντάδες, οπότε μια γραμμή κοστολογημένη ανά κομμάτι διαιρείται. Μια
 * γραμμή της οποίας η τιμή ΕΙΝΑΙ η πεντάδα δεν έχει τι να διαιρέσει - το
 * πλήθος της είναι ήδη σε πεντάδες.
 *
 * Έμενε μέσα στον πίνακα του ταμείου, που δεν μπορεί να τον διαβάσει η
 * επιθεώρηση χωρίς να κουβαλήσει ολόκληρη την οθόνη καταμέτρησης. Εδώ τον
 * διαβάζουν και οι τρεις.
 */
export function displayedRowCount(
  totalQty: number,
  bundleSize: unknown,
  bundlesOnly: boolean
): number {
  const packed = Number(bundleSize);
  if (!bundlesOnly || !Number.isFinite(packed) || packed <= 0) return totalQty;
  return Math.floor(totalQty / packed);
}

/** Πόσες ολόκληρες μονάδες είναι αυτά τα κομμάτια. */
export function unitsOf(pieces: unknown, view: QuantityView): number {
  const n = Math.max(0, Math.floor(num(pieces)));
  return view.size > 0 ? Math.floor(n / view.size) : n;
}

/** Τι περισσεύει πάνω από ολόκληρες μονάδες. Πάντα 0 όταν δεν υπάρχει πεντάδα. */
export function looseOf(pieces: unknown, view: QuantityView): number {
  const n = Math.max(0, Math.floor(num(pieces)));
  return view.size > 0 ? n % view.size : 0;
}

/**
 * Πίσω σε κομμάτια - ό,τι γράφει ο άνθρωπος, όπως το κρατάει η γραμμή.
 *
 * Το σπασμένο υπόλοιπο ΔΕΝ χάνεται: μια πεντάδα που άνοιξε είναι τρία
 * δελτία στο ράφι, και μια μετατροπή που τα έκοβε θα τα χρέωνε ως
 * χαμένα σε όποιον παρέδωσε.
 */
export function toPieces(units: unknown, loose: unknown, view: QuantityView): number {
  const u = Math.max(0, Math.floor(num(units)));
  const l = Math.max(0, Math.floor(num(loose)));
  return view.size > 0 ? u * view.size + l : u;
}

/**
 * Το πλήθος όπως διαβάζεται: «40 πεντάδες», «40 πεντ. + 3 τμχ», «12 τμχ».
 *
 * Το υπόλοιπο γράφεται μόνο όταν υπάρχει. Ένα «+ 0 τμχ» σε κάθε γραμμή
 * είναι θόρυβος που μαθαίνει τον αναγνώστη να μη διαβάζει τη γραμμή.
 */
export function formatQuantity(pieces: unknown, view: QuantityView, short = true): string {
  const noun = short ? view.short : view.noun;
  const units = unitsOf(pieces, view);
  const loose = looseOf(pieces, view);
  if (loose === 0) return `${units} ${noun}`;
  return `${units} ${noun} + ${loose} ${PIECES_NOUNS.short}`;
}
