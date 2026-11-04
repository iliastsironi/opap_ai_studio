/**
 * Πού βρίσκεται ένα πακέτο που τρέχει στον πάγκο.
 *
 * Το ταμείο το ξέρει ήδη και δεν χρειάζεται τίποτα καινούριο να γραφτεί:
 * σε ένα σκρατς ο αριθμός είναι ΘΕΣΗ μέσα στο πακέτο, και κάθε βάρδια
 * ξεκινάει από εκεί που τελείωσε η προηγούμενη (carryOverScratchInventory:
 * nextStart = prev.endNo). Άρα το τελικό της τελευταίας βάρδιας ΕΙΝΑΙ η
 * απόλυτη θέση μέσα στο πακέτο.
 *
 * Προσοχή στη διαφορά από τα λαχεία, που έχει κοστίσει ήδη σήμερα: εκεί ο
 * αριθμός είναι το ΥΠΟΛΟΙΠΟ και μικραίνει. Εδώ είναι θέση και μεγαλώνει.
 * Γι' αυτό αυτό το αρχείο δουλεύει μόνο για σκρατς.
 *
 * Η πίσω πλευρά μετράει ανάποδα από το ψηλό άκρο, οπότε όσα πουλήθηκαν από
 * εκεί είναι backEndNo − backStartNo.
 */

const whole = (v: unknown): number => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const isBlank = (v: unknown): boolean => String(v ?? '').trim() === '';

export interface ProgressRow {
  startNo?: string;
  endNo?: string;
  backStartNo?: string;
  backEndNo?: string;
}

export interface PackProgress {
  /** Σε ποιο νούμερο βρίσκεται η μπροστινή πλευρά. */
  position: number;
  /** Δελτία που έχουν φύγει, μπροστά και πίσω μαζί. */
  sold: number;
  pieces: number;
  /** 0 έως 100. */
  percent: number;
  /** Πόσα απομένουν. */
  remaining: number;
}

/**
 * Η πρόοδος ενός πακέτου από τη γραμμή της πιο πρόσφατης βάρδιας.
 *
 * Το ποσοστό κόβεται στο 100: ένα πακέτο δεν πουλιέται 110% και ένα
 * νούμερο πάνω από το μέγεθος είναι λάθος καταχώρηση, όχι υπερπώληση. Το
 * να φαίνεται 110% θα έκανε την μπάρα να λέει ψέματα για όλα τα υπόλοιπα.
 */
export function packProgress(row: ProgressRow | null | undefined, pieces: unknown): PackProgress {
  const total = Math.max(0, whole(pieces));
  if (!row || total === 0) {
    return { position: 0, sold: 0, pieces: total, percent: 0, remaining: total };
  }

  // Το τελικό, ή το αρχικό όταν η βάρδια δεν έχει γράψει ακόμα τελικό.
  const position = isBlank(row.endNo) ? whole(row.startNo) : whole(row.endNo);

  // Η πίσω πλευρά μόνο όταν έχει αρχίσει να πουλάει: χωρίς backStartNo δεν
  // έχει φύγει τίποτα από εκεί, και το backEndNo είναι απλώς η βάση.
  const backSold = isBlank(row.backStartNo)
    ? 0
    : Math.max(0, whole(row.backEndNo) - whole(row.backStartNo));

  const sold = Math.min(total, position + backSold);
  return {
    position,
    sold,
    pieces: total,
    percent: Math.min(100, Math.round((sold / total) * 100)),
    remaining: Math.max(0, total - sold),
  };
}

/** Το χρώμα της μπάρας: όσο αδειάζει, τόσο πιο επείγον. */
export function progressTone(percent: number): 'LOW' | 'MID' | 'HIGH' {
  if (percent >= 85) return 'HIGH';
  if (percent >= 50) return 'MID';
  return 'LOW';
}
