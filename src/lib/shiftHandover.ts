/**
 * Τι παραδίδει μια βάρδια όταν κλείνει, από τη γραμμή της όπως είναι
 * αποθηκευμένη.
 *
 * Ο υπεύθυνος περνάει το βράδυ. Πριν ανοίξει την επιθεώρηση θέλει να ξέρει
 * ένα πράγμα: πόσα μετρητά σηκώνει. Μέχρι τώρα το ταμπελάκι των εκκρεμών
 * βαρδιών έλεγε μόνο την απόκλιση - σωστό νούμερο, άλλη ερώτηση - και το
 * ποσό της παράδοσης φαινόταν μόνο ΜΕΣΑ στην επιθεώρηση, δηλαδή αφού είχε
 * ήδη μπει.
 *
 * Δύο πράγματα ταξιδεύουν, και είναι χωριστά επειδή μετριούνται χωριστά:
 *
 *   ο φάκελος    τα χαρτονομίσματα πάνω από το πάγιο
 *   το κύπελλο   τα κέρματα που δεν χώρεσαν στο συρτάρι
 *
 * Τίποτα δεν υπολογίζεται δεύτερη φορά εδώ: ο φάκελος βγαίνει από το ίδιο
 * calculateEnvelope που είδε ο υπάλληλος στο κλείσιμο, με τα ίδια πεδία που
 * δίνει και το shift_day_collection στην επιθεώρηση. Δύο ανεξάρτητοι
 * υπολογισμοί των ίδιων χρημάτων είναι ο τρόπος που καταλήγουν να
 * διαφωνούν.
 */

import { calculateEnvelope } from './shiftEnvelope.ts';
import { settleShift } from './shiftOwnDiscrepancy.ts';
import { calculateBanknotesAndCoins } from '../services/financialCalculator.ts';

/** Μια κλεισμένη βάρδια, με τα πεδία που χρειάζονται και μόνο αυτά. */
export interface ClosedShiftCash {
  shift_type?: string | null;
  counted_denominations?: Record<string, unknown> | null;
  /** Το χαρτονομισματικό μέρος του ΒΑΣΙΚΟΥ παγίου, χωρίς προσαυξήσεις. */
  opening_cash_notes?: number | string | null;
  coin_handover?: number | string | null;
  bank_deposits?: number | string | null;
  safe_drop?: number | string | null;
  discrepancy?: number | string | null;
  discrepancy_baseline?: number | string | null;
  discrepancy_threshold?: number | string | null;
  discrepancy_settlement?: string | null;
}

export interface ShiftHandover {
  /** Ο φάκελος: χαρτονομίσματα πάνω από το πάγιο. */
  envelope: number;
  /** Το κύπελλο κερμάτων αυτής της βάρδιας. 0 όταν δεν υπάρχει. */
  coins: number;
  /** Μετρητά που έβαλε ο χειριστής από την τσέπη του για να κλείσει έλλειμμα. */
  settlement: number;
  /** Τι πιάνει στο χέρι ο υπεύθυνος. */
  total: number;
  /** Το συρτάρι έχει λιγότερα χαρτονομίσματα από το πάγιο. */
  isShort: boolean;
}

/**
 * Ποια βάρδια παραδίδει.
 *
 * Μόνο η βραδινή, κατ' εντολή του ιδιοκτήτη: «στην πρωινή δεν μας
 * ενδιαφέρει». Και στα δεδομένα στέκει - το πρακτορείο δουλεύει δύο
 * βάρδιες την ημέρα, πρωινή και βραδινή, και η βραδινή είναι η τελευταία
 * και στις 43 ημέρες που έχουν καταγραφεί. Είναι αυτή που βρίσκει ο
 * υπεύθυνος όταν περνάει.
 *
 * Η απογευματινή μπαίνει μαζί της επειδή σε κατάστημα με τρεις βάρδιες
 * αυτή είναι που κλείνει τη μέρα, και ένα ταμπελάκι που δεν θα έλεγε
 * τίποτα εκεί θα ήταν σιωπή ακριβώς όπου χρειάζεται το νούμερο.
 */
export function handsOverCash(shiftType: unknown): boolean {
  return shiftType === 'NIGHT' || shiftType === 'AFTERNOON';
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

export function shiftHandover(shift: ClosedShiftCash | null | undefined): ShiftHandover {
  const s = shift ?? {};
  const split = calculateBanknotesAndCoins((s.counted_denominations ?? {}) as Record<string, number>);

  // Η άμεση εξόφληση ταξιδεύει μέσα στον ίδιο φάκελο, οπότε ο υπεύθυνος
  // πρέπει να τη δει - αλλά ΔΕΝ είναι είσπραξη. Υπολογίζεται από τα πεδία
  // της ίδιας γραμμής, χωρίς δεύτερο ερώτημα στη βάση.
  const charged =
    s.discrepancy_settlement === 'PAID_CASH'
      ? settleShift(s.discrepancy, s.discrepancy_baseline, s.discrepancy_threshold).charged
      : 0;

  const envelope = calculateEnvelope({
    countedNotes: split.banknotes,
    countedCoins: split.coins,
    floatNotes: num(s.opening_cash_notes),
    // Το bank_deposits πρώτο, όπως και στο shift_day_collection.
    safeDrops: s.bank_deposits ?? s.safe_drop,
    coinHandover: s.coin_handover,
    discrepancySettlement: charged,
  });

  return {
    envelope: envelope.amount,
    coins: envelope.coinHandover,
    settlement: envelope.settlement,
    // Ό,τι φεύγει στο χέρι: φάκελος + κύπελλο + εξόφληση. Το safe drop
    // λείπει επίτηδες - έφυγε ώρες πριν και είναι ήδη στο χρηματοκιβώτιο,
    // δεν το σηκώνει κανείς από το συρτάρι τώρα.
    total: round2(envelope.handedOver),
    isShort: envelope.isShort,
  };
}
