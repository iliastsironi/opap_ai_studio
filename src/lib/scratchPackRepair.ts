/**
 * Το πακέτο που παραλήφθηκε, και η γραμμή που το ξέχασε.
 *
 * Μια παραλαβή γράφει ΔΥΟ πράγματα σε ΔΥΟ μέρη: η αποθήκη βάζει το πακέτο
 * «στο μαγαζί» (με τη βάρδια που το άνοιξε), και η γραμμή της βάρδιας γράφει τον
 * κωδικό του. Η δεύτερη εγγραφή ζει στο πρόχειρο της βάρδιας, που αποθηκεύεται
 * από την οθόνη του χρήστη και μπορεί να γραφτεί ξανά από ένα ΠΑΛΙΟ αντίγραφο
 * (οθόνη ανοιχτή από νωρίς, λίστα βαρδιών που δεν πρόλαβε να ανανεωθεί).
 *
 * Έτσι έφτασε η Στυλίδα σε μια κατάσταση που ο κώδικας δεν είχε προβλέψει: το
 * πακέτο «Δώρο 5€» 0018479 ήταν στο μαγαζί για αυτή τη βάρδια, αλλά η γραμμή του
 * δεν είχε κωδικό. Η γραμμή φαινόταν «ποτέ δεν μετρήθηκε», άρα η οθόνη έγραφε
 * «περιμένει παράδοση» και την έκρυβε, με κουμπί «Ανανέωση» που δεν μπορούσε να
 * κάνει τίποτα - δεν έλειπε παράδοση, έλειπε η σύνδεση πακέτου και γραμμής.
 *
 * Η αποθήκη είναι η καταγραφή που δεν χάνεται από παλιά αντίγραφα. Οπότε:
 *   - ένα παιχνίδι με πακέτο στον πάγκο δεν «περιμένει παράδοση» ποτέ,
 *   - και αν το πακέτο το άνοιξε ΑΥΤΗ η βάρδια και η γραμμή δεν το ξέρει, η
 *     γραμμή ξαναγράφεται όπως θα την έγραφε το άνοιγμα (με ίχνος αναίρεσης).
 *
 * Ξαναγράφεται ΜΟΝΟ γραμμή που δεν έχει μετρηθεί ποτέ. Μια γραμμή με αριθμούς
 * και χωρίς κωδικό δεν ξέρουμε τι πούλησε πριν και τι μετά το πακέτο, και ένα
 * επινοημένο νούμερο εκεί θα ήταν χειρότερο από το κενό.
 */

import { everCounted, type CounterRow } from './scratchOnTheCounter.ts';
import { openPack } from './scratchPackHistory.ts';

/** Ό,τι χρειαζόμαστε από ένα πακέτο που είναι «στο μαγαζί». */
export interface PackAtCounter {
  catalog_code: string;
  pack_code: string;
  moved_shift_id?: string | null;
}

/** Πόσα πακέτα αυτού του παιχνιδιού είναι ήδη στον πάγκο, από οποιαδήποτε βάρδια. */
export function openedPackCount(
  packs: ReadonlyArray<PackAtCounter> | null | undefined,
  catalogCode: unknown
): number {
  const code = String(catalogCode ?? '');
  return (packs ?? []).filter((p) => p.catalog_code === code).length;
}

export interface RepairableRow extends CounterRow {
  id?: unknown;
}

/**
 * Οι γραμμές που η αποθήκη λέει ότι άνοιξαν πακέτο σε αυτή τη βάρδια και η
 * γραμμή δεν το γράφει, ξαναγραμμένες. Η ΙΔΙΑ λίστα αν δεν υπάρχει τίποτα να
 * γίνει - από αυτό εξαρτάται ο καλών για να μη ζητήσει δεύτερο render.
 */
export function restoreForgottenPacks<T extends RepairableRow>(
  rows: ReadonlyArray<T>,
  packsAtCounter: ReadonlyArray<PackAtCounter> | null | undefined,
  shiftId: string,
  options: {
    isLottery: (row: T) => boolean;
    /** Τα νούμερα που θα έδινε το άνοιγμα για μια γραμμή που δεν είχε πακέτο. */
    figuresFor: (row: T) => { startNo: string; backEndNo: string };
  }
): ReadonlyArray<T> {
  if (!shiftId || !packsAtCounter || packsAtCounter.length === 0) return rows;

  let changed = false;
  const next = rows.map((row) => {
    if (options.isLottery(row) || everCounted(row)) return row;
    const mine = packsAtCounter.filter(
      (p) => p.catalog_code === String(row.id ?? '') && p.moved_shift_id === shiftId
    );
    // Δύο πακέτα του ίδιου παιχνιδιού σε μία βάρδια: δεν ξέρουμε ποιο τρέχει.
    if (mine.length !== 1) return row;
    changed = true;
    return openPack(row as T & Record<string, unknown> as never, {
      code: mine[0].pack_code,
      soldOut: 0,
      ...options.figuresFor(row),
    }) as unknown as T;
  });
  return changed ? next : rows;
}
