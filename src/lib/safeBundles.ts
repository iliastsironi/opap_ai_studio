/**
 * Το χρηματοκιβώτιο σε δεσμίδες.
 *
 * Στην καταμέτρηση της βάρδιας, η τρίτη στήλη μετράει τα χαρτονομίσματα του
 * χρηματοκιβωτίου σε δεσμίδες. Το μέγεθος της δεσμίδας είναι ρύθμιση του admin
 * (ανά κατάστημα), με προεπιλογή: 5, 10, 20 € σε δεσμίδες των 50, τα 50 € των
 * 20, και τα υπόλοιπα (100, 200, 500 €) των 10.
 *
 * ΜΕΤΡΑΝΕ ΩΣ ΜΕΤΡΗΤΑ. Οι δεσμίδες είναι μετρητά της βάρδιας, κανονικά: μπαίνουν
 * στο «Σύνολο Μετρητών» και άρα στην απόκλιση, όπως τα χαρτονομίσματα του συρταριού
 * (λόγια του ιδιοκτήτη: «οι δεσμίδες θέλουμε να μετράνε σαν μετρητά κανονικά»).
 * Αρχικά είχε ζητηθεί ξεχωριστή καταμέτρηση· η απόφαση άλλαξε.
 *
 * Γράφεται πάνω στη βάρδια με τα μεγέθη δεσμίδας εκείνης της στιγμής, ώστε μια
 * αλλαγή ρύθμισης αύριο να μην αλλάζει τι μετρήθηκε σήμερα.
 *
 * Σε λεπτά με ακέραιους, όπως κάθε άθροισμα χρημάτων εδώ.
 */

/** Οι ονομαστικές αξίες που μετριούνται σε δεσμίδες, από τη μικρότερη. */
export const SAFE_DENOMINATIONS: ReadonlyArray<{ key: string; value: number; label: string }> = [
  { key: '5', value: 5, label: '5 €' },
  { key: '10', value: 10, label: '10 €' },
  { key: '20', value: 20, label: '20 €' },
  { key: '50', value: 50, label: '50 €' },
  { key: '100', value: 100, label: '100 €' },
  { key: '200', value: 200, label: '200 €' },
  { key: '500', value: 500, label: '500 €' },
];

/** Τεμάχια ανά δεσμίδα, όταν ο admin δεν έχει ορίσει κάτι άλλο. */
export const DEFAULT_SAFE_BUNDLE_SIZES: Readonly<Record<string, number>> = {
  '5': 50,
  '10': 50,
  '20': 50,
  '50': 20,
  '100': 10,
  '200': 10,
  '500': 10,
};

/** Όριο λογικής: μια δεσμίδα με 100.000 τεμάχια είναι λάθος πληκτρολόγησης. */
export const MAX_BUNDLE_SIZE = 1000;
/** Πόσες δεσμίδες χωράνε σε ένα πεδίο. */
export const MAX_BUNDLES = 10000;

const toInt = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.floor(n) : NaN;
};

/**
 * Τα μεγέθη δεσμίδας όπως τα έδωσε η βάση, συμπληρωμένα με τις προεπιλογές.
 * Ένα κλειδί που λείπει ή δεν είναι έγκυρος ακέραιος 1..1000 παίρνει την
 * προεπιλογή του - ποτέ μηδέν, γιατί μηδέν τεμάχια ανά δεσμίδα θα μηδένιζε σιωπηλά
 * ό,τι μετρήθηκε.
 */
export function normalizeBundleSizes(raw: unknown): Record<string, number> {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const d of SAFE_DENOMINATIONS) {
    const n = toInt(source[d.key]);
    out[d.key] = Number.isFinite(n) && n >= 1 && n <= MAX_BUNDLE_SIZE ? n : DEFAULT_SAFE_BUNDLE_SIZES[d.key];
  }
  return out;
}

/** Οι δεσμίδες ανά αξία, καθαρισμένες σε ακέραιους 0..MAX_BUNDLES. */
export function normalizeBundles(raw: unknown): Record<string, number> {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const d of SAFE_DENOMINATIONS) {
    const n = toInt(source[d.key]);
    out[d.key] = Number.isFinite(n) && n > 0 ? Math.min(MAX_BUNDLES, n) : 0;
  }
  return out;
}

/** Η αξία μιας δεσμίδας, σε ευρώ: τεμάχια × ονομαστική. */
export function bundleValue(key: string, sizes: Record<string, number>): number {
  const denom = SAFE_DENOMINATIONS.find((d) => d.key === key);
  if (!denom) return 0;
  const size = normalizeBundleSizes(sizes)[key];
  return size * denom.value;
}

/** Το σύνολο του χρηματοκιβωτίου σε ευρώ. */
export function safeTotal(bundles: unknown, sizes: unknown): number {
  const b = normalizeBundles(bundles);
  const s = normalizeBundleSizes(sizes);
  let cents = 0;
  for (const d of SAFE_DENOMINATIONS) cents += b[d.key] * s[d.key] * d.value * 100;
  return cents / 100;
}

/** Πόσες δεσμίδες συνολικά. */
export function safeBundleCount(bundles: unknown): number {
  const b = normalizeBundles(bundles);
  return SAFE_DENOMINATIONS.reduce((t, d) => t + b[d.key], 0);
}

/** Πόσα χαρτονομίσματα συνολικά (δεσμίδες × τεμάχια). */
export function safePieceCount(bundles: unknown, sizes: unknown): number {
  const b = normalizeBundles(bundles);
  const s = normalizeBundleSizes(sizes);
  return SAFE_DENOMINATIONS.reduce((t, d) => t + b[d.key] * s[d.key], 0);
}

export interface SafeCount {
  bundles: Record<string, number>;
  /** Τα μεγέθη δεσμίδας που ίσχυαν όταν μετρήθηκε. */
  sizes: Record<string, number>;
  total: number;
}

/**
 * Αυτό που γράφεται πάνω στη βάρδια, ή null όταν δεν μετρήθηκε τίποτα (μια
 * άδεια καταμέτρηση δεν αφήνει ίχνος).
 */
export function buildSafeCount(bundles: unknown, sizes: unknown): SafeCount | null {
  if (safeBundleCount(bundles) === 0) return null;
  const normalizedSizes = normalizeBundleSizes(sizes);
  return {
    bundles: normalizeBundles(bundles),
    sizes: normalizedSizes,
    total: safeTotal(bundles, normalizedSizes),
  };
}

/** Η καταμέτρηση χρηματοκιβωτίου μιας βάρδιας, όπως γράφτηκε, ή null. */
export function readSafeCount(customFieldValues: unknown): SafeCount | null {
  if (!customFieldValues || typeof customFieldValues !== 'object') return null;
  const raw = (customFieldValues as Record<string, unknown>).safe_count;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const built = buildSafeCount(r.bundles, r.sizes);
  return built;
}


/**
 * ΤΟ ΑΝΟΙΓΜΑ ΤΗΣ ΒΑΡΔΙΑΣ: «έχεις κέρματα τόσα, χαρτονομίσματα τόσα και χρηματοκιβώτιο τόσο».
 *
 * Οι δεσμίδες μετράνε ως μετρητά στο κλείσιμο, άρα το επόμενο άνοιγμα πρέπει να
 * τις περιέχει, αλλιώς κάθε βάρδια θα έδειχνε πλεόνασμα ίσο με όσα έχει το
 * χρηματοκιβώτιο. Ο κανόνας είναι ο ίδιος με των κερμάτων:
 *
 *   - συνέχεια ημέρας: ανοίγει με ό,τι άνοιξε η μέρα, δεν διαπραγματεύεται στις 15:00·
 *   - πρώτη βάρδια της ημέρας: με ό,τι μέτρησε το προηγούμενο βράδυ.
 *
 * Ό,τι δεν είναι γνωστό (δεν έτρεξε ακόμα το 0089, η προηγούμενη βάρδια δεν
 * μέτρησε χρηματοκιβώτιο, το κατάστημα δεν το έχει ανοιχτό) είναι μηδέν. Ποτέ
 * επινοημένο νούμερο.
 */
export function resolveOpeningSafe(input: {
  /** Το κατάστημα έχει τη στήλη του χρηματοκιβωτίου ανοιχτή. */
  enabled: boolean;
  /** Αυτή η βάρδια συνεχίζει μια μέρα που ήδη άνοιξε. */
  continuingDay: boolean;
  /** Το opening_safe της πρώτης βάρδιας της ημέρας (shift_day_opening). */
  dayOpeningSafe?: unknown;
  /** Το safe_count της προηγούμενης βάρδιας (shift_handover_snapshot): {total}. */
  previousSafeCount?: unknown;
}): number {
  if (!input.enabled) return 0;
  const money = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  };
  if (input.continuingDay) return money(input.dayOpeningSafe);
  const prev = input.previousSafeCount;
  if (prev && typeof prev === 'object') {
    const built = buildSafeCount(
      (prev as Record<string, unknown>).bundles,
      (prev as Record<string, unknown>).sizes
    );
    // Το σύνολο ξαναϋπολογίζεται από τις δεσμίδες· αν λείπουν, ισχύει το αποθηκευμένο.
    return built ? built.total : money((prev as Record<string, unknown>).total);
  }
  return 0;
}

/** Το χρηματοκιβώτιο με το οποίο άνοιξε μια βάρδια (custom_field_values.opening_safe). */
export function readOpeningSafe(customFieldValues: unknown): number {
  if (!customFieldValues || typeof customFieldValues !== 'object') return 0;
  const raw = (customFieldValues as Record<string, unknown>).opening_safe;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
