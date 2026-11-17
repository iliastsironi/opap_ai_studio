/**
 * Η παραλαβή που αποδέχεται ο επόμενος, χωρίς μέτρημα.
 *
 * Ο ιδιοκτήτης για το Play: «να βάλουμε επιθεώρηση και στις δύο βάρδιες επειδή
 * είναι μεγάλα τα χρηματικά, να βλέπουν τι παραλαμβάνουν στην απογευματινή. Αλλά θα
 * είναι μόνο για να το αποδεχτούν, όχι κάτι άλλο.»
 *
 * Η επιθεώρηση του πρωινού ΜΕΤΡΑΕΙ το συρτάρι και το συγκρίνει με τη δήλωση, και
 * μια διαφορά γράφεται ως έλλειμμα. Αυτό εδώ δεν μετράει τίποτα και δεν γράφει
 * έλλειμμα: δείχνει στον εισερχόμενο τι άφησε η προηγούμενη βάρδια (όπως το
 * μέτρησε εκείνη στο κλείσιμο) και κρατάει ότι το αποδέχτηκε. Ό,τι δεν είναι
 * ακριβές το βρίσκει το κλείσιμο, με τον κανονικό υπολογισμό.
 *
 * Σε φύλλο χωρίς React ώστε να δοκιμάζεται χωρίς οθόνη.
 */

import { calculateBanknotesAndCoins } from '../services/financialCalculator.ts';

/** Ό,τι χρειαζόμαστε από το στιγμιότυπο παράδοσης της προηγούμενης βάρδιας. */
export interface PreviousShiftCount {
  shift_id?: string | null;
  shift_status?: string | null;
  previous_operator_name?: string | null;
  counted_cash?: number | string | null;
  counted_denominations?: Record<string, unknown> | null;
  safe_count?: { total?: number | string | null } | null;
}

export interface HandoverFigures {
  fromShiftId: string;
  fromOperatorName: string | null;
  notes: number;
  coins: number;
  /** Οι δεσμίδες του χρηματοκιβωτίου, όταν το κατάστημα τις μετράει. */
  safe: number;
  /** Όλα μαζί: ό,τι παραλαμβάνεται. */
  total: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

/**
 * Τι παραλαμβάνεται, ή null όταν δεν υπάρχει τίποτα να αποδεχτεί κανείς.
 *
 * Μόνο από βάρδια που έχει κλείσει (υποβληθεί ή εγκριθεί): μια ανοιχτή δεν έχει
 * δηλωμένα νούμερα, και ένα ποσό που δεν έχει μετρηθεί δεν αποδέχεται κανείς.
 * Και μόνο όταν η βάρδια όντως μέτρησε κάτι: ένα κλείσιμο χωρίς καταμέτρηση δεν
 * είναι παράδοση 0 €, είναι παράδοση χωρίς νούμερα.
 */
export function handoverFigures(
  previous: PreviousShiftCount | null | undefined,
  options: { safeEnabled: boolean }
): HandoverFigures | null {
  if (!previous?.shift_id) return null;
  if (previous.shift_status !== 'SUBMITTED' && previous.shift_status !== 'APPROVED') return null;

  const split = calculateBanknotesAndCoins((previous.counted_denominations ?? {}) as Record<string, number>);
  const hasBreakdown = split.banknotes > 0 || split.coins > 0;
  const counted = num(previous.counted_cash);

  // Χωρίς ανάλυση σε κοψίματα, το σύνολο μένει στα χαρτονομίσματα: δεν
  // επινοούμε κέρματα.
  const notes = hasBreakdown ? split.banknotes : counted;
  const coins = hasBreakdown ? split.coins : 0;
  const safe = options.safeEnabled ? Math.max(0, num(previous.safe_count?.total)) : 0;

  if (notes <= 0 && coins <= 0 && safe <= 0) return null;

  return {
    fromShiftId: previous.shift_id,
    fromOperatorName: previous.previous_operator_name ?? null,
    notes: round2(notes),
    coins: round2(coins),
    safe: round2(safe),
    total: round2(notes + coins + safe),
  };
}

/**
 * Ζητείται αποδοχή σε αυτό το άνοιγμα;
 *
 * Μόνο σε κατάστημα που το ζητά (=== true: ό,τι δεν είναι ρητά ανοιχτό μένει
 * όπως ήταν), και μόνο στις βάρδιες ΜΕΤΑ την πρώτη της ημέρας. Η πρώτη της
 * ημέρας έχει την επιθεώρησή της, που μετράει.
 */
export function shouldAskAcceptance(input: {
  enabled: unknown;
  continuingDay: boolean;
  figures: HandoverFigures | null;
}): boolean {
  return input.enabled === true && input.continuingDay && input.figures !== null;
}

/** Ό,τι γράφεται πάνω στη νέα βάρδια όταν αποδεχτεί: ποιος, πότε, τι. */
export function acceptanceRecord(
  figures: HandoverFigures,
  by: { userId: string | null; name: string },
  at: Date
): Record<string, unknown> {
  return {
    accepted: true,
    accepted_at: at.toISOString(),
    accepted_by_user_id: by.userId,
    accepted_by_name: by.name,
    from_shift_id: figures.fromShiftId,
    from_operator_name: figures.fromOperatorName,
    notes: figures.notes,
    coins: figures.coins,
    safe: figures.safe,
    total: figures.total,
  };
}
