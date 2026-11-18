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
 * ΑΝ ΔΕΝ ΣΥΜΦΩΝΟΥΝ: ο εισερχόμενος μπορεί να γράψει τι βρήκε πραγματικά. Ο ιδιοκτήτης: «δεν
 * έχεις τη δυνατότητα να διορθώσει ο άλλος κάτι, σε περίπτωση που βρει κάτι διαφορετικό».
 * Η διόρθωση ΔΕΝ είναι επιθεώρηση: δεν αλλάζει τα ποσά της βάρδιας (η μέρα συνεχίζει από το
 * αρχικό της), δεν χρεώνει κανέναν και δεν γράφει έλλειμμα στην προηγούμενη. Καταγράφει τι
 * δηλώθηκε, τι βρέθηκε και τη διαφορά, για να το δει ο υπεύθυνος και να αποφασίσει εκείνος.
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

/** Τα ποσά που βρήκε ο εισερχόμενος. */
export interface FoundFigures {
  notes: number;
  coins: number;
  safe: number;
  total: number;
}

/** Βρέθηκε μείον δηλώθηκε: αρνητικό = λείπει, θετικό = περισσεύει. */
export type HandoverDifference = FoundFigures;

/**
 * Ποσό όπως το γράφει ένας άνθρωπος: «1250», «1250.5», «1250,50». Κενό, γράμματα, αρνητικό, ή
 * περισσότερα από δύο δεκαδικά (π.χ. «1.250,50», που θα διαβαζόταν 1,25) → null: ένα ποσό που
 * δεν διαβάζεται σίγουρα δεν γίνεται εγγραφή.
 */
export function parseAmount(raw: unknown): number | null {
  const text = String(raw ?? '').trim();
  if (!/^\d+([.,]\d{1,2})?$/.test(text)) return null;
  return round2(Number(text.replace(',', '.')));
}

/**
 * Τι βρέθηκε, από ό,τι πληκτρολόγησε. null όταν κάποιο πεδίο που ζητείται δεν διαβάζεται:
 * ούτε μηδέν ούτε το δηλωμένο μπαίνει στη θέση του, γιατί ένα «αποδέχομαι» πάνω σε ποσό που
 * δεν γράφτηκε είναι ακριβώς ό,τι ήρθε να αποφύγει η διόρθωση.
 */
export function foundFigures(
  typed: { notes: unknown; coins: unknown; safe: unknown },
  options: { includeSafe: boolean }
): FoundFigures | null {
  const notes = parseAmount(typed.notes);
  const coins = parseAmount(typed.coins);
  const safe = options.includeSafe ? parseAmount(typed.safe) : 0;
  if (notes === null || coins === null || safe === null) return null;
  return { notes, coins, safe, total: round2(notes + coins + safe) };
}

export function handoverDifference(declared: HandoverFigures, found: FoundFigures): HandoverDifference {
  return {
    notes: round2(found.notes - declared.notes),
    coins: round2(found.coins - declared.coins),
    safe: round2(found.safe - declared.safe),
    total: round2(found.total - declared.total),
  };
}

/** Διαφέρει έστω και ένα από τα τρία ποσά; (Το σύνολο μόνο του δεν αρκεί: +10 και −10.) */
export function hasDifference(diff: HandoverDifference): boolean {
  return [diff.notes, diff.coins, diff.safe].some((n) => Math.abs(n) >= 0.005);
}

/**
 * Ό,τι γράφεται πάνω στη νέα βάρδια όταν αποδεχτεί: ποιος, πότε, τι.
 *
 * Χωρίς διόρθωση (ή με διόρθωση που βγάζει τα ίδια ποσά) η εγγραφή είναι η απλή αποδοχή, όπως
 * πάντα: κανένα πεδίο «βρέθηκε», κανένα έλλειμμα. Με πραγματική διαφορά προστίθενται, ΜΟΝΟ τότε,
 * τι βρέθηκε, η διαφορά και η σημείωση. Τα `notes/coins/safe/total` μένουν πάντα αυτά που
 * ΔΗΛΩΘΗΚΑΝ, ώστε όποιος διαβάζει παλιές εγγραφές να βλέπει το ίδιο νόημα.
 */
export function acceptanceRecord(
  figures: HandoverFigures,
  by: { userId: string | null; name: string },
  at: Date,
  correction?: { found: FoundFigures; note?: string | null } | null
): Record<string, unknown> {
  const base: Record<string, unknown> = {
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
  if (!correction) return base;

  const difference = handoverDifference(figures, correction.found);
  if (!hasDifference(difference)) return base;

  const note = String(correction.note ?? '').trim().slice(0, HANDOVER_NOTE_MAX);
  return {
    ...base,
    disputed: true,
    found: correction.found,
    difference,
    note: note === '' ? null : note,
  };
}

export const HANDOVER_NOTE_MAX = 300;

/** Η διαφορά όπως τη διαβάζει ο υπεύθυνος από μια βάρδια, ή null όταν δεν υπάρχει. */
export interface HandoverDispute {
  acceptedByName: string | null;
  acceptedAt: string | null;
  fromOperatorName: string | null;
  declared: FoundFigures;
  found: FoundFigures;
  difference: HandoverDifference;
  note: string | null;
}

export function readHandoverDispute(customFieldValues: unknown): HandoverDispute | null {
  const record = (customFieldValues as { handover_acceptance?: Record<string, any> } | null | undefined)
    ?.handover_acceptance;
  if (!record || record.disputed !== true) return null;

  const read = (v: any): FoundFigures | null => {
    if (!v || typeof v !== 'object') return null;
    const n = Number(v.notes), c = Number(v.coins), s = Number(v.safe ?? 0);
    if (![n, c, s].every(Number.isFinite)) return null;
    return { notes: round2(n), coins: round2(c), safe: round2(s), total: round2(n + c + s) };
  };
  const declared = read(record);
  const found = read(record.found);
  if (!declared || !found) return null;

  const note = String(record.note ?? '').trim();
  return {
    acceptedByName: record.accepted_by_name ? String(record.accepted_by_name) : null,
    acceptedAt: record.accepted_at ? String(record.accepted_at) : null,
    fromOperatorName: record.from_operator_name ? String(record.from_operator_name) : null,
    declared,
    found,
    // Ξαναϋπολογίζεται και δεν διαβάζεται από την εγγραφή: ό,τι εμφανίζεται πρέπει να βγαίνει
    // από τα δύο ποσά που φαίνονται δίπλα του.
    difference: handoverDifference({ ...declared, fromShiftId: '', fromOperatorName: null }, found),
    note: note === '' ? null : note,
  };
}
