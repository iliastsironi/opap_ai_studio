/**
 * Η σειρά του καταλόγου σκρατς: ομάδες ανά τιμή.
 *
 * Ο ιδιοκτήτης: «στα σκρατς, ανάλογα με την τιμή να κατηγοριοποιούνται σωστά,
 * τα 1 € μαζί, τα 2 € μαζί, σαν ομάδα· και η κατηγορία να επιλέγεται έτσι.
 * Όταν προσθέτουμε ένα νέο σκρατς, π.χ. 5 €, να πηγαίνει στο τέλος αυτής της
 * ομάδας».
 *
 * Η σειρά του καταλόγου είναι η σειρά που μετράει το ταμείο, οπότε τίποτα εδώ
 * δεν ανακατεύει μόνο του μια λίστα που ήδη έχει αποθηκευτεί: οι συναρτήσεις
 * δουλεύουν πάνω σε ό,τι τους δοθεί και επιστρέφουν νέα λίστα. Η ομαδοποίηση
 * μιας ήδη ανακατεμένης λίστας γίνεται μόνο όταν την ζητήσει ο χρήστης.
 *
 * Η ΟΜΑΔΑ. Τα σκρατς ομαδοποιούνται ανά τιμή. Όλα τα λαχεία είναι μία ομάδα,
 * ό,τι τιμή κι αν έχουν: η τιμή τους είναι ανά κομμάτι και μια πεντάδα των 2 €
 * δεν «ανήκει» στα 2 € των σκρατς. Τα σκρατς μπαίνουν πάντα πριν από τα λαχεία.
 *
 * Σε λεπτά με ακέραιους, όπως παντού όπου συγκρίνεται τιμή: το 0,1 + 0,2 δεν
 * πρέπει να βγάζει «άλλη» τιμή από το 0,3.
 */

import { isLotteryRow, type ScratchTicketRow } from '../components/shifts/ScratchCalculatorTable.tsx';
import { priceLabel } from './priceLabel.ts';

export { priceLabel };

/** Η ομάδα μιας γραμμής: `L` για τα λαχεία, `S:<λεπτά>` για τα σκρατς. */
export function groupKey(row: ScratchTicketRow): string {
  if (isLotteryRow(row)) return 'L';
  return `S:${Math.round((Number(row.price) || 0) * 100)}`;
}

/** Η κατηγορία που αντιστοιχεί στην τιμή: «Σκρατς 5€», ή «Λαχεία». */
export function categoryFor(row: ScratchTicketRow): string {
  if (isLotteryRow(row)) return 'Λαχεία';
  const price = Number(row.price) || 0;
  return price > 0 ? `Σκρατς ${priceLabel(price)}€` : 'Σκρατς';
}

/**
 * Το όνομα της ομάδας για την επικεφαλίδα της: ίδιο με την κατηγορία, ώστε αυτό
 * που γράφει η επικεφαλίδα να είναι ακριβώς αυτό που θα δει το ταμείο.
 */
export function groupTitle(row: ScratchTicketRow): string {
  return categoryFor(row);
}

/**
 * Πού μπαίνει μια ΝΕΑ γραμμή: στο τέλος της ομάδας της. Αν δεν υπάρχει ακόμα
 * ομάδα με αυτή την τιμή, στη θέση που της ανήκει με βάση την τιμή (πριν από την
 * πρώτη ακριβότερη ομάδα σκρατς, ή μετά την τελευταία φθηνότερη)· τα σκρατς
 * δεν περνάνε ποτέ μετά τα λαχεία, και τα λαχεία πάνε στο τέλος της λίστας.
 */
export function insertionIndex(rows: ReadonlyArray<ScratchTicketRow>, row: ScratchTicketRow): number {
  const key = groupKey(row);

  // 1. Υπάρχει η ομάδα: αμέσως μετά την τελευταία της γραμμή.
  let lastInGroup = -1;
  rows.forEach((r, i) => {
    if (groupKey(r) === key) lastInGroup = i;
  });
  if (lastInGroup !== -1) return lastInGroup + 1;

  // 2. Λαχείο χωρίς άλλα λαχεία: στο τέλος.
  if (key === 'L') return rows.length;

  // 3. Σκρατς σε τιμή που δεν υπάρχει: πριν από το πρώτο ακριβότερο σκρατς,
  //    αλλιώς μετά το τελευταίο φθηνότερο, αλλιώς πριν από τα λαχεία.
  const cents = Math.round((Number(row.price) || 0) * 100);
  const firstDearer = rows.findIndex((r) => !isLotteryRow(r) && Math.round((Number(r.price) || 0) * 100) > cents);
  if (firstDearer !== -1) return firstDearer;
  let lastScratch = -1;
  rows.forEach((r, i) => {
    if (!isLotteryRow(r)) lastScratch = i;
  });
  if (lastScratch !== -1) return lastScratch + 1;
  const firstLottery = rows.findIndex((r) => isLotteryRow(r));
  return firstLottery !== -1 ? firstLottery : rows.length;
}

/** Η λίστα με τη γραμμή προστεθειμένη στο τέλος της ομάδας της. */
export function addToGroup(rows: ReadonlyArray<ScratchTicketRow>, row: ScratchTicketRow): ScratchTicketRow[] {
  const at = insertionIndex(rows, row);
  return [...rows.slice(0, at), row, ...rows.slice(at)];
}

/** Η γραμμή `id` μεταφερμένη στο τέλος της (πιθανώς νέας) ομάδας της. */
export function moveToGroupEnd(rows: ReadonlyArray<ScratchTicketRow>, id: string): ScratchTicketRow[] {
  const row = rows.find((r) => r.id === id);
  if (!row) return [...rows];
  return addToGroup(
    rows.filter((r) => r.id !== id),
    row
  );
}

/**
 * Στέκεται η γραμμή στη σωστή θέση για την ομάδα της; Ναι αν όλες οι γραμμές της
 * ομάδας είναι συνεχόμενες (και η ίδια ανάμεσά τους), ή, αν είναι μόνη της, αν
 * οι γείτονές της δεν τη βάζουν σε λάθος σειρά τιμών. Χρησιμεύει όταν αλλάζει η
 * τιμή μιας γραμμής: η γραμμή μετακινείται μόνο αν πράγματι βγήκε από την ομάδα
 * της, και όχι σε κάθε πάτημα, ώστε ένα απλό κλικ να μη μετακινεί τίποτα.
 */
export function isWellPlaced(rows: ReadonlyArray<ScratchTicketRow>, index: number): boolean {
  const row = rows[index];
  if (!row) return true;
  const key = groupKey(row);
  const members = rows.map((r, i) => (groupKey(r) === key ? i : -1)).filter((i) => i !== -1);
  if (members.length > 1) {
    return members[members.length - 1] - members[0] === members.length - 1;
  }
  // Μόνη της στην ομάδα: σε σειρά ως προς τους γείτονες.
  return orderRank(rows[index - 1], row) <= 0 && orderRank(row, rows[index + 1]) <= 0;
}

/** <0 αν η `a` πρέπει να προηγείται της `b`, 0 αν ίδια ομάδα, >0 αν ανάποδα. */
function orderRank(a: ScratchTicketRow | undefined, b: ScratchTicketRow | undefined): number {
  if (!a || !b) return 0;
  const al = isLotteryRow(a);
  const bl = isLotteryRow(b);
  if (al !== bl) return al ? 1 : -1;
  if (al && bl) return 0;
  return Math.round((Number(a.price) || 0) * 100) - Math.round((Number(b.price) || 0) * 100);
}

/**
 * Είναι η λίστα ομαδοποιημένη: κάθε ομάδα συνεχόμενη, οι ομάδες σκρατς σε αύξουσα
 * τιμή και τα λαχεία στο τέλος; Ο κατάλογος των προεπιλογών είναι. Ένας
 * κατάλογος που έχει μετακινηθεί με το χέρι ίσως δεν είναι.
 */
export function isGrouped(rows: ReadonlyArray<ScratchTicketRow>): boolean {
  for (let i = 1; i < rows.length; i++) {
    if (orderRank(rows[i - 1], rows[i]) > 0) return false;
  }
  return true;
}

/**
 * Η λίστα ταξινομημένη σε ομάδες: σκρατς σε αύξουσα τιμή, μετά λαχεία. Σταθερή:
 * μέσα σε κάθε ομάδα μένει η σειρά που είχε ο χρήστης.
 */
export function groupRows(rows: ReadonlyArray<ScratchTicketRow>): ScratchTicketRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => orderRank(x.r, y.r) || x.i - y.i)
    .map((x) => x.r);
}

/**
 * Οι ομάδες όπως εμφανίζονται: συνεχόμενα τμήματα της λίστας με την ίδια ομάδα.
 * Μια ομάδα που έχει σπάσει στα δύο εμφανίζεται δύο φορές, ώστε ό,τι δείχνει η
 * οθόνη να είναι ακριβώς η σειρά που μετράει το ταμείο.
 */
export interface CatalogRun {
  key: string;
  title: string;
  /** Η θέση της πρώτης και της τελευταίας γραμμής του τμήματος. */
  start: number;
  end: number;
}

export function runsOf(rows: ReadonlyArray<ScratchTicketRow>): CatalogRun[] {
  const runs: CatalogRun[] = [];
  rows.forEach((row, i) => {
    const key = groupKey(row);
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.end = i;
    else runs.push({ key, title: groupTitle(row), start: i, end: i });
  });
  return runs;
}

/** Οι τιμές που προσφέρονται όταν προστίθεται σκρατς: οι συνηθισμένες και όσες υπάρχουν ήδη. */
export const COMMON_SCRATCH_PRICES: ReadonlyArray<number> = [1, 2, 3, 5, 10, 20];

export function offeredPrices(rows: ReadonlyArray<ScratchTicketRow>): number[] {
  const set = new Set<number>(COMMON_SCRATCH_PRICES);
  for (const r of rows) if (!isLotteryRow(r) && Number(r.price) > 0) set.add(Math.round(Number(r.price) * 100) / 100);
  return [...set].sort((a, b) => a - b);
}
