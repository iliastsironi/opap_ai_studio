/**
 * Το χρηματοκιβώτιο σε δεσμίδες.
 *
 * Στην καταμέτρηση της βάρδιας, η τρίτη στήλη μετράει τα χαρτονομίσματα του
 * χρηματοκιβωτίου σε δεσμίδες. Το μέγεθος της δεσμίδας είναι ρύθμιση του admin
 * (ανά κατάστημα), με προεπιλογή: 5, 10, 20 € σε δεσμίδες των 50, τα 50 € των
 * 20, και τα υπόλοιπα (100, 200, 500 €) των 10.
 *
 * ΞΕΧΩΡΙΣΤΗ ΚΑΤΑΜΕΤΡΗΣΗ. Δεν μπαίνει στο «Σύνολο Μετρητών» ούτε στην απόκλιση:
 * το χρηματοκιβώτιο δεν είναι το συρτάρι που κρίνεται η βάρδια, και προσθέτοντάς
 * το θα έβγαινε απόκλιση ίση με όσα έχει μέσα. Γράφεται πάνω στη βάρδια με τα
 * μεγέθη δεσμίδας εκείνης της στιγμής, ώστε μια αλλαγή ρύθμισης αύριο να μην
 * αλλάζει τι μετρήθηκε σήμερα.
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
