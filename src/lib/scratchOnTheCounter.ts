/**
 * Τι τρέχει πάνω στον πάγκο, και τι δεν έχει φτάσει ακόμα εκεί.
 *
 * Ο ιδιοκτήτης πέρασε δύο νέους κωδικούς - τα χριστουγεννιάτικα - και
 * εμφανίστηκαν αμέσως στο ταμείο σαν πωλήσιμες γραμμές, ενώ τα πακέτα τους
 * καθόντουσαν ακόμα στην αποθήκη. Τα ίδια δελτία βρέθηκαν σε δύο μέρη
 * ταυτόχρονα: στο ράφι της αποθήκης και στον πάγκο. Τα λόγια του: «όταν θα
 * περνάς ένα νέο κωδικό σκρατς θα πρέπει να μην είναι διαθέσιμο για πώληση,
 * έως ότου η αποθήκη παραδώσει πακέτο στο μαγαζί».
 *
 * Ο κατάλογος λέει ΤΙ ΥΠΑΡΧΕΙ ως παιχνίδι. Η αποθήκη λέει ΤΙ ΕΧΕΙ ΦΤΑΣΕΙ
 * στο μαγαζί. Μέχρι τώρα το ταμείο διάβαζε μόνο το πρώτο, οπότε ένας
 * κωδικός καταχωρημένος το πρωί γινόταν γραμμή για καταμέτρηση το βράδυ
 * χωρίς να έχει έρθει τίποτα στο χέρι κανενός.
 *
 * ΓΙΑΤΙ ΜΟΝΟ ΤΑ ΚΑΙΝΟΥΡΙΑ: ο κανόνας δεν μπορεί να είναι «δείξε ό,τι έχει
 * πακέτο στην αποθήκη», γιατί η αποθήκη ξεκίνησε να γεμίζει πριν λίγες
 * μέρες και τα περισσότερα παιχνίδια που πουλάνε σήμερα δεν έχουν
 * καταχωρημένο πακέτο καθόλου - θα έσβηνε ο μισός πάγκος. Ο κανόνας είναι
 * «ένα παιχνίδι που δεν έχει μετρηθεί ΠΟΤΕ και δεν του έχει παραδοθεί
 * τίποτα δεν είναι στον πάγκο». Ό,τι τρέχει, συνεχίζει να τρέχει.
 */

import { packsForGame, READY_FOR_TILL, type HandoverPack } from './warehouseHandover.ts';
import { deliveryIdLabel } from './lotteryDelivery.ts';

const str = (v: unknown): string => String(v ?? '').trim();

export interface CounterRow {
  id?: unknown;
  packCode?: unknown;
  startNo?: unknown;
  endNo?: unknown;
  backStartNo?: unknown;
  backEndNo?: unknown;
  saleBundles?: unknown;
  salePieces?: unknown;
  manualQty?: unknown;
  cancelledBundles?: unknown;
  closedPackQty?: unknown;
  packHistory?: unknown;
}

/**
 * Μπήκε ποτέ αυτό το παιχνίδι στο ταμείο;
 *
 * Οτιδήποτε γραμμένο μετράει - νούμερο, πώληση, κωδικός πακέτου, ιστορικό.
 * Ο λόγος είναι ότι η απάντηση χρησιμοποιείται για να ΚΡΥΦΤΕΙ μια γραμμή:
 * το λάθος που κοστίζει είναι να κρυφτεί κάτι που τρέχει, όχι να μείνει
 * ορατό κάτι που δεν τρέχει. Οπότε αρκεί μία ένδειξη ζωής.
 */
export function everCounted(row: CounterRow | null | undefined): boolean {
  if (!row) return false;
  if (str(row.packCode) !== '') return true;
  const written = [
    row.startNo, row.endNo, row.backStartNo, row.backEndNo,
    row.saleBundles, row.salePieces, row.manualQty, row.cancelledBundles,
  ];
  if (written.some((v) => str(v) !== '')) return true;
  if ((Number(row.closedPackQty) || 0) > 0) return true;
  if (Array.isArray(row.packHistory) && row.packHistory.length > 0) return true;
  return false;
}

export interface AwaitingInput {
  row: CounterRow | null | undefined;
  /** Πόσα πακέτα αυτού του παιχνιδιού είναι «προς παράδοση» στο κατάστημα. */
  readyPacks: number;
  /** Αν το κατάστημα χρησιμοποιεί αποθήκη (0076). */
  warehouseInUse: boolean;
  isLottery: boolean;
}

/**
 * Περιμένει παράδοση - δηλαδή δεν είναι διαθέσιμο για πώληση.
 *
 * Τρεις φρουροί πριν τον κανόνα, και ο καθένας είναι ένα «δεν ξέρουμε» που
 * δεν επιτρέπεται να γίνει «δεν υπάρχει»:
 *
 *   - κατάστημα χωρίς αποθήκη: δεν υπάρχει παράδοση να περιμένεις,
 *   - λαχείο: δεν έρχεται σε πακέτα 300 €, έχει δική του παραλαβή ανά
 *     κλήρωση (lib/lotteryDelivery.ts),
 *   - παιχνίδι που έχει μετρηθεί: τρέχει, ό,τι κι αν λέει η αποθήκη.
 */
export function awaitingDelivery(input: AwaitingInput): boolean {
  if (!input.warehouseInUse) return false;
  if (input.isLottery) return false;
  if (everCounted(input.row)) return false;
  return input.readyPacks === 0;
}

/** Πόσα πακέτα αυτού του παιχνιδιού είναι παραδομένα και περιμένουν άνοιγμα. */
export function readyPackCount(
  packs: ReadonlyArray<HandoverPack> | null | undefined,
  catalogCode: unknown
): number {
  return packsForGame(packs, catalogCode).filter((p) => p.status === READY_FOR_TILL).length;
}

/**
 * Ο κωδικός του πακέτου που τρέχει τώρα σε αυτή τη γραμμή, με το όνομά του.
 *
 * «Θα πρέπει να καταχωρούμε κάπου και τους κωδικούς τους ώστε να ξέρουμε
 * ποια πακέτα είναι ενεργά πάνω». Καταχωρούνταν ήδη - το packCode γράφεται
 * σε κάθε άνοιγμα από το 0065 - αλλά δεν φαινόταν πουθενά: ούτε στο ταμείο
 * ούτε στην επιθεώρηση. Ένα νούμερο που υπάρχει και δεν διαβάζεται είναι το
 * ίδιο με ένα που δεν υπάρχει.
 *
 * Κενό όταν δεν έχει ανοίξει πακέτο από την εφαρμογή - τα περισσότερα
 * παιχνίδια έτρεχαν πριν μπει η αποθήκη, και ένα επινοημένο νούμερο εκεί
 * θα ήταν χειρότερο από το τίποτα.
 */
export function activePackLabel(
  row: CounterRow | null | undefined,
  isLottery: boolean
): string {
  const code = str(row?.packCode);
  if (code === '') return '';
  return `${isLottery ? 'κλήρωση' : 'πακέτο'} ${code}`;
}

/** Ο ίδιος κωδικός, σκέτος, για όπου χρειάζεται μόνο το νούμερο. */
export function activePackCode(row: CounterRow | null | undefined): string {
  return str(row?.packCode);
}

/** Το πλήρες όνομα του αριθμού, για τίτλους και κεφαλίδες. */
export function packCodeHeading(isLottery: boolean): string {
  return deliveryIdLabel(isLottery);
}
