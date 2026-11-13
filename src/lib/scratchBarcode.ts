/**
 * Ο κωδικός ενός σκρατς, και τα τρία του κομμάτια.
 *
 *   0157  3301482  014
 *   └─┬─┘ └──┬──┘ └┬─┘
 *     │      │     └── αριθμός δελτίου μέσα στο πακέτο (000 έως N-1)
 *     │      └──────── μοναδικός κωδικός πακέτου
 *     └─────────────── αριθμός παιχνιδιού, σταθερός πανελλαδικά
 *
 * Δεκατέσσερα ψηφία συνολικά. Ο σαρωτής τα δίνει μαζεμένα· ο χειριστής τα
 * γράφει σε δύο βήματα, πρώτα το παιχνίδι και μετά το πακέτο.
 *
 * Στο ίδιο το εισιτήριο όμως το τυπωμένο κείμενο έχει ΔΕΚΑΕΞΙ:
 *
 *   0153-0067248-033-92
 *
 * με δύο ψηφία στο τέλος που ο παλιός κανόνας δεν γνώριζε. Το πρώτο ζωντανό
 * σκανάρισμα (Λαμία, 13/11/2026) έδωσε ΔΕΚΑΠΕΝΤΕ: `016200307410593` - παιχνίδι
 * 0162, πακέτο 0030741 (υπήρχε ήδη στη βάση, άρα τα πρώτα 11 ήταν σωστά),
 * δελτίο 059, και ένα ψηφίο μετά. Δεν ξέρουμε αν το barcode κωδικοποιεί ένα
 * ψηφίο ελέγχου και όχι δύο, ή αν ο σαρωτής χάνει το τελευταίο· και τα δύο
 * δίνουν τα ίδια πρώτα 14. Γι' αυτό δέχεται 14 έως 16 και όχι μόνο ένα μήκος -
 * ο κανόνας που περίμενε ακριβώς 16 απέρριπτε το πρώτο πραγματικό σκανάρισμα.
 * Τα ψηφία μετά το δελτίο ΔΕΝ ελέγχονται: δεν γνωρίζουμε τον αλγόριθμό τους,
 * και ένας επινοημένος θα απέρριπτε σωστά πακέτα. Και οι δύο
 * δρόμοι περνούν από εδώ, ώστε να μην υπάρχουν δύο αναγνώσεις του ίδιου
 * κωδικού που μπορούν να διαφωνήσουν.
 *
 * Το δελτίο δεν αποθηκεύεται. Είναι το σημείο μέσα στο πακέτο και το
 * μετράει ήδη το ταμείο· κρατώντας το εδώ θα υπήρχαν δύο απαντήσεις στο
 * «πόσα πουλήθηκαν», που είναι ακριβώς ο τρόπος που δύο σημαίες για την
 * ίδια ερώτηση καταλήγουν να διαφωνούν.
 */

export const GAME_NO_LENGTH = 4;
export const PACK_CODE_LENGTH = 7;
export const TICKET_NO_LENGTH = 3;
export const BARCODE_LENGTH = GAME_NO_LENGTH + PACK_CODE_LENGTH + TICKET_NO_LENGTH;
/**
 * Τα ψηφία στο τέλος του τυπωμένου κωδικού του εισιτηρίου (δες πάνω): έως δύο.
 * Ο σαρωτής της Λαμίας έδωσε ένα.
 */
export const CHECK_DIGITS_LENGTH = 2;
export const PRINTED_BARCODE_LENGTH = BARCODE_LENGTH + CHECK_DIGITS_LENGTH;

export interface ScannedBarcode {
  gameNo: string;
  packCode: string;
  /** null όταν σκαναρίστηκε μόνο το παιχνίδι και το πακέτο, χωρίς δελτίο. */
  ticketNo: string | null;
  /**
   * Τα ψηφία μετά το δελτίο (ένα ή δύο) - ΜΟΝΟ όταν ο κωδικός ήρθε με 15 ή 16.
   * Απουσιάζει (όχι null) στα 11 και 14, ώστε ό,τι είχε γραφτεί πριν να
   * συγκρίνεται ίδιο.
   */
  check?: string;
}

export interface BarcodeReading {
  parts: ScannedBarcode | null;
  /** Τι λείπει ή τι περισσεύει, στα ελληνικά. null όταν διαβάστηκε. */
  problem: string | null;
}

/** Μόνο ψηφία. Ο σαρωτής βάζει κενά και παύλες, το χέρι επίσης. */
export function digitsOnly(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * Διαβάζει ό,τι μπήκε στο πεδίο.
 *
 * Δέχεται 11 ψηφία (παιχνίδι + πακέτο) ή 14 έως 16 (με το δελτίο και τα ψηφία
 * στο τέλος του εισιτηρίου). Τα 11 είναι ό,τι γράφει ο χειριστής στα δύο
 * βήματα· τα 14 έως 16 είναι ό,τι δίνει ο σαρωτής.
 */
export function readBarcode(raw: unknown): BarcodeReading {
  const digits = digitsOnly(raw);
  if (digits === '') return { parts: null, problem: 'Γράψτε ή σκανάρετε τον κωδικό.' };

  const short = GAME_NO_LENGTH + PACK_CODE_LENGTH;
  if (
    digits.length !== short &&
    (digits.length < BARCODE_LENGTH || digits.length > PRINTED_BARCODE_LENGTH)
  ) {
    return {
      parts: null,
      problem:
        `Χρειάζονται ${short} ψηφία (παιχνίδι + πακέτο) ή ${BARCODE_LENGTH} έως ` +
        `${PRINTED_BARCODE_LENGTH} με τον αριθμό δελτίου, όπως τυπώνεται στο εισιτήριο — έχετε ${digits.length}.`,
    };
  }

  const parts: ScannedBarcode = {
    gameNo: digits.slice(0, GAME_NO_LENGTH),
    packCode: digits.slice(GAME_NO_LENGTH, short),
    ticketNo: digits.length >= BARCODE_LENGTH ? digits.slice(short, BARCODE_LENGTH) : null,
  };
  if (digits.length > BARCODE_LENGTH) parts.check = digits.slice(BARCODE_LENGTH);
  return { parts, problem: null };
}

export function isValidGameNo(value: unknown): boolean {
  return new RegExp(`^\\d{${GAME_NO_LENGTH}}$`).test(digitsOnly(value));
}

export function isValidPackCode(value: unknown): boolean {
  return new RegExp(`^\\d{${PACK_CODE_LENGTH}}$`).test(digitsOnly(value));
}

/**
 * Πόσα δελτία έχει ένα πακέτο.
 *
 * Ο κανόνας είναι 300 € η ονομαστική αξία, άρα 300/τιμή δελτία - αλλά ΔΕΝ
 * ισχύει παντού. Το 7ΑΡΙ Χ50 έχει 15 δελτία και αξία 750 €, και ο κανόνας
 * θα έδινε 6. Γι' αυτό ο κατάλογος κρατάει pack_pieces: όπου υπάρχει,
 * νικάει, και ο κανόνας μένει για τα υπόλοιπα.
 *
 * null όταν η τιμή δεν διαιρεί τα 300 και δεν έχει δηλωθεί μέγεθος: δεν
 * ορίζεται πακέτο, και ένα επινοημένο θα χρέωνε δελτία που δεν υπήρξαν.
 */
export const PACKAGE_FACE_VALUE = 300;

export function packPieces(price: unknown, declaredPieces?: unknown): number | null {
  const declared = Number(declaredPieces);
  if (Number.isFinite(declared) && declared > 0) return Math.floor(declared);

  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;
  const pieces = PACKAGE_FACE_VALUE / p;
  return Number.isInteger(pieces) ? pieces : null;
}

/** Τι αξίζει ένα πακέτο. Δελτία × τιμή - όχι σταθερά 300 €. */
export function packValue(price: unknown, declaredPieces?: unknown): number {
  const pieces = packPieces(price, declaredPieces);
  const p = Number(price);
  if (pieces === null || !Number.isFinite(p)) return 0;
  return Math.round(pieces * p * 100) / 100;
}

/**
 * Γιατί αυτή η γραμμή καταλόγου δεν στέκει, ή null αν στέκει.
 *
 * Υπάρχει για ένα λάθος που έγινε στα αλήθεια: στον κατάλογο, η στήλη
 * «Τεμάχια ανά πακέτο» κάθεται ακριβώς πριν από τον «Αριθμό παιχνιδιού», και
 * δύο στενά αριθμητικά κουτάκια δίπλα-δίπλα γεμίζουν ανάποδα. Τα «Δώρο 5€»
 * και «Δώρο 10€» αποθηκεύτηκαν με bundleSize 168 και 169 - τους αριθμούς
 * παιχνιδιού τους.
 *
 * Το κακό δεν ήταν ότι ο αριθμός ήταν λάθος· ήταν ότι ΔΟΥΛΕΨΕ. Ένα σκρατς με
 * bundleSize > 0 μετριέται σε πακέτα αντί για αύξοντες αριθμούς - δηλαδή
 * ακριβώς όπως ένα λαχείο - οπότε το παιχνίδι άλλαξε τρόπο καταμέτρησης
 * χωρίς να το πει πουθενά. Ο ιδιοκτήτης το είδε ως «μου το εμφάνισε ως
 * λαχείο και όχι ως σκρατς».
 *
 * Ο κανόνας είναι ο απλούστερος που πιάνει το λάθος: μια πεντάδα δεν γίνεται
 * να έχει περισσότερα δελτία από ολόκληρο το πακέτο. Σε ένα σκρατς 5 € το
 * πακέτο έχει 60 δελτία, οπότε το 168 είναι αδύνατο και όχι απλώς ασυνήθιστο.
 */
export function bundleSizeProblem(
  price: unknown,
  bundleSize: unknown,
  declaredPieces?: unknown
): string | null {
  const bundle = Number(bundleSize);
  if (!Number.isFinite(bundle) || bundle <= 0) return null;  // κενό: μεμονωμένα

  if (!Number.isInteger(bundle)) return 'Τα τεμάχια ανά πακέτο είναι ακέραιος αριθμός.';

  const pieces = packPieces(price, declaredPieces);
  // Χωρίς γνωστό μέγεθος πακέτου δεν υπάρχει όριο να ελεγχθεί - και ένα
  // επινοημένο θα απέρριπτε σωστές γραμμές.
  if (pieces === null) return null;

  if (bundle > pieces) {
    return `Τα τεμάχια ανά πακέτο (${bundle}) δεν γίνεται να ξεπερνούν τα δελτία ενός πακέτου (${pieces}). Μήπως γράφτηκε εδώ ο αριθμός παιχνιδιού;`;
  }
  return null;
}
