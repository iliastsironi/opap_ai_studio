/**
 * Τα βήματα του κλεισίματος βάρδιας, όπως φαίνονται.
 *
 * «Στο ταμείο του Play, τα VLTs και τα έξοδα βάλτα μαζί.» Ένα ταμείο PLAY δεν
 * έχει πωλήσεις ΟΠΑΠ, οπότε το βήμα «ΟΠΑΠ & VLTs» έχει μόνο τις μηχανές, και τα
 * «Έξοδα» είναι ένα δεύτερο βήμα για λίγα πεδία. Για ένα PLAY είναι μία οθόνη.
 *
 * Τα εσωτερικά βήματα μένουν τα ίδια (1-5), γιατί σε αυτά στηρίζονται το
 * προσχέδιο και οι έλεγχοι· αλλάζει μόνο το τι δείχνει το πάνω μέρος και πώς
 * πηδάνε τα κουμπιά. Το βήμα 3 δεν χάνεται: ζωγραφίζεται κάτω από το 2.
 */

import type { StoreType } from '../types/index.ts';

/** Ενώνονται τα VLTs και τα έξοδα μόνο σε κατάστημα PLAY. */
export function mergesVltAndExpenses(storeType: StoreType | string | null | undefined): boolean {
  return storeType === 'PLAY_STORE';
}

export interface ClosingStep {
  num: number;
  name: string;
  icon: unknown;
}

/**
 * Τα βήματα που δείχνει το πάνω μέρος, με το `shown`: ο αριθμός που βλέπει ο
 * χρήστης (1, 2, 3, 4 όταν είναι ενωμένα· 1-5 αλλιώς).
 */
export function visibleSteps<T extends ClosingStep>(
  steps: ReadonlyArray<T>,
  merged: boolean
): Array<T & { shown: number }> {
  return steps
    .filter((step) => !(merged && step.num === 3))
    .map((step, index) => ({ ...step, shown: index + 1 }));
}
