/**
 * Πώς έρχεται κάθε λαχείο, και τι γίνεται με όσα δεν πουληθούν.
 *
 * Ένα λαχείο δεν έχει πακέτο 300 € που τελειώνει. Έχει παραλαβή ανά
 * κλήρωση, και η εφαρμογή το χειριζόταν σαν σκρατς: υπολόγιζε «μέγεθος
 * πακέτου − αρχικό» ως ουρά πωλήσεων, που στα λαχεία βγαίνει ανάποδα - ο
 * αριθμός τους ΕΙΝΑΙ το υπόλοιπο, όχι θέση μέσα σε πακέτο.
 *
 * Οι τέσσερις απαντήσεις του Owner, σε δύο ερωτήσεις ανά λαχείο:
 *
 *   Εθνικό            πάγια ποσότητα, αλλάζει     αδιάθετα: τα χρεώνεται
 *   Λαϊκό             πάγια 40 πεντάδες           αδιάθετα: επιστρέφονται
 *   Πρωτοχρονιάτικο   γράφεται κάθε φορά          αδιάθετα: τα χρεώνεται
 *   Ειδική χ5 / χ10   γράφεται κάθε φορά          αδιάθετα: επιστρέφονται
 *
 * Οι δύο διαστάσεις είναι ανεξάρτητες - πάγια ποσότητα δεν συνεπάγεται
 * επιστροφή, και το Εθνικό το αποδεικνύει - οπότε κρατιούνται χωριστά αντί
 * για έναν «τύπο λαχείου» που θα τις έδενε.
 *
 * Καμία από τις δύο πολιτικές δεν κάνει τα αδιάθετα είσπραξη: είτε γυρίζουν
 * πίσω, είτε τα πληρώνει το πρακτορείο στον ΟΠΑΠ, που είναι κόστος και όχι
 * μετρητά στο συρτάρι. Γι' αυτό το tailSoldOnNewPack είναι μηδέν παντού.
 */

export type UnsoldPolicy = 'RETURNED' | 'CHARGED';

export interface LotteryDelivery {
  rowId: string;
  label: string;
  /**
   * Το κλειδί της πάγιας ποσότητας στο πρότυπο, ή null όταν η ποσότητα
   * γράφεται σε κάθε παραλαβή.
   */
  standingKey: string | null;
  unsold: UnsoldPolicy;
}

export const LOTTERY_DELIVERIES: ReadonlyArray<LotteryDelivery> = [
  {
    rowId: 'scr_ethniko_x20',
    label: 'Εθνικό',
    standingKey: 'ethniko_standing_order_bundles',
    unsold: 'CHARGED',
  },
  {
    rowId: 'scr_laiko',
    label: 'Λαϊκό',
    standingKey: 'laiko_standing_order_bundles',
    unsold: 'RETURNED',
  },
  { rowId: 'scr_protochroniatiko', label: 'Πρωτοχρονιάτικο', standingKey: null, unsold: 'CHARGED' },
  { rowId: 'scr_eidiki_x5', label: 'Ειδική Έκδοση χ5', standingKey: null, unsold: 'RETURNED' },
  { rowId: 'scr_eidiki_x10', label: 'Ειδική Έκδοση χ10', standingKey: null, unsold: 'RETURNED' },
];

const BY_ROW = new Map(LOTTERY_DELIVERIES.map((d) => [d.rowId, d]));

export function deliveryFor(rowId: unknown): LotteryDelivery | undefined {
  return BY_ROW.get(String(rowId ?? ''));
}

/**
 * Αν προσφέρεται η καταχώρηση αδιάθετων λαχνών.
 *
 * Μόνο όπου επιστρέφονται. Σε Εθνικό και Πρωτοχρονιάτικο το πρακτορείο
 * πληρώνει ό,τι παρέλαβε, οπότε μια δήλωση επιστροφής θα έλεγε ψέματα: θα
 * αφαιρούσε από τη χρέωση της βάρδιας λαχνούς που κανείς δεν πήρε πίσω.
 *
 * Ένα λαχείο που δεν ξέρουμε - το κατάστημα μπορεί να προσθέσει δικό του -
 * κρατά το κουμπί. Το να μην μπορείς να δηλώσεις επιστροφή που έγινε
 * χρεώνει τον υπάλληλο· το αντίστροφο απλώς δεν πατιέται.
 */
export function canReturnUnsold(rowId: unknown): boolean {
  return (deliveryFor(rowId)?.unsold ?? 'RETURNED') === 'RETURNED';
}

export function hasStandingQuantity(rowId: unknown): boolean {
  return deliveryFor(rowId)?.standingKey != null;
}

/**
 * Η πάγια ποσότητα του καταστήματος για αυτό το λαχείο, σε πεντάδες.
 *
 * null όταν το λαχείο δεν έχει πάγια - τότε τη γράφει ο χειριστής - ή όταν
 * το κατάστημα δεν την έχει ορίσει ακόμα. Το μηδέν ΔΕΝ είναι «δεν ορίστηκε»:
 * ένα κατάστημα που δεν παίρνει καθόλου Εθνικό το λέει γράφοντας μηδέν.
 */
export function standingQuantityFor(
  rowId: unknown,
  config: Record<string, unknown> | null | undefined
): number | null {
  const key = deliveryFor(rowId)?.standingKey;
  if (!key) return null;
  const raw = config?.[key];
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Πώς λέγεται ο αριθμός που ταυτοποιεί την παραλαβή.
 *
 * Τα σκρατς έχουν επταψήφιο κωδικό πακέτου, που τα δένει με την αποθήκη.
 * Τα λαχεία έχουν αριθμό κλήρωσης - δεν υπάρχει πακέτο να κωδικοποιηθεί,
 * υπάρχει η κλήρωση για την οποία ήρθαν.
 */
export function deliveryIdLabel(isLottery: boolean): string {
  return isLottery ? 'Αριθμός κλήρωσης' : 'Κωδικός πακέτου';
}

/**
 * Αν ο αριθμός που γράφτηκε στέκει.
 *
 * Επταψήφιος για σκρατς, όπως πάντα. Για λαχεία μόνο «να υπάρχει και να
 * είναι αριθμός»: δεν ξέρουμε πόσα ψηφία έχει μια κλήρωση, και ένας
 * επινοημένος κανόνας θα εμπόδιζε καταχωρήσεις που είναι σωστές.
 */
export function isValidDeliveryId(isLottery: boolean, value: unknown): boolean {
  const s = String(value ?? '').trim();
  return isLottery ? /^\d+$/.test(s) : /^\d{7}$/.test(s);
}

/**
 * Ο αριθμός καθώς γράφεται, μόνο ψηφία.
 *
 * Το όριο των 7 ψηφίων είναι κανόνας του κωδικού πακέτου, όχι της κλήρωσης,
 * και κόβοντας στα 7 παντού θα ακρωτηρίαζε σιωπηλά έναν μεγαλύτερο αριθμό
 * κλήρωσης. Τα 12 είναι όριο ασφαλείας για να μην γεμίσει το πεδίο, όχι
 * προδιαγραφή.
 */
export function normalizeDeliveryId(isLottery: boolean, value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.slice(0, isLottery ? 12 : 7);
}
