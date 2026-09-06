import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  Hash,
  Edit2,
  ShieldCheck,
  Lock,
  Unlock,
  PackagePlus,
  Info,
  ArrowRight,
  Check,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatCurrency } from '../../lib/formatters.ts';

export interface ScratchTicketRow {
  id: string;
  name: string;
  category?: string;
  price: number;
  startNo: string; // Μπροστά - Αρχικό (locked, Owner/Admin only)
  endNo: string; // Μπροστά - Τελικό (User-editable) - for bundleSize rows, this is COMPUTED (startNo - sold pieces), never typed directly
  backStartNo?: string; // Πίσω - Αρχικό (User-editable)
  backEndNo?: string; // Πίσω - Τελικό (locked, Owner/Admin only)
  manualQty?: string;
  isNewPack?: boolean;
  packCode?: string;
  // Dual-unit (πεντάδες/κομμάτια) tracking, e.g. Λαϊκό Λαχείο. Presence of
  // bundleSize (pieces per bundle, e.g. 5) activates this mode for the row.
  // startNo/endNo keep their exact existing meaning (remaining piece count
  // before/after) - saleBundles/salePieces are just how the User expresses
  // THIS entry's sale, which the UI converts into that same endNo.
  bundleSize?: number;
  saleBundles?: string; // πεντάδες sold this entry (User-editable)
  salePieces?: string; // μεμονωμένα κομμάτια sold this entry, normalized 0..bundleSize-1 (User-editable)
  // Whether this row sells from both ends of the same stock (Πίσω side)
  // at all. Independent of bundleSize/isLotteryRow - a Λαχεία game can
  // opt into Πίσω selling same as Σκρατς, or a Σκρατς game could opt out.
  // Undefined means "use the historical default" (see hasBackSide below),
  // so every row that predates this toggle keeps behaving exactly as it
  // always did until an Owner/Admin explicitly changes it.
  backSideEnabled?: boolean;
}

export const DEFAULT_SCRATCH_PRESETS: ScratchTicketRow[] = [
  // Σκρατς 1 €
  { id: 'scr_1_seria', name: 'ΚΕΡΔΗ ΣΤΗ ΣΕΙΡΑ', category: 'Σκρατς 1€', price: 1, startNo: '', endNo: '' },

  // Σκρατς 2 €
  { id: 'scr_2_7ari', name: '7ΑΡΙ', category: 'Σκρατς 2€', price: 2, startNo: '', endNo: '' },
  { id: 'scr_2_gata', name: 'ΓΑΤΑ', category: 'Σκρατς 2€', price: 2, startNo: '', endNo: '' },
  { id: 'scr_2_24mines', name: '24 ΜΗΝΕΣ', category: 'Σκρατς 2€', price: 2, startNo: '', endNo: '' },

  // Σκρατς 3 €
  { id: 'scr_3_kerasia', name: 'ΜΑΓ ΚΕΡΑΣΙΑ', category: 'Σκρατς 3€', price: 3, startNo: '', endNo: '' },

  // Σκρατς 5 €
  { id: 'scr_5_7ari', name: '7ΑΡΙ', category: 'Σκρατς 5€', price: 5, startNo: '', endNo: '' },
  { id: 'scr_5_gata', name: 'ΓΑΤΑ', category: 'Σκρατς 5€', price: 5, startNo: '', endNo: '' },
  { id: 'scr_5_24mines', name: '24 ΜΗΝΕΣ', category: 'Σκρατς 5€', price: 5, startNo: '', endNo: '' },

  // Σκρατς 10 €
  { id: 'scr_10_x50', name: 'Χ50', category: 'Σκρατς 10€', price: 10, startNo: '', endNo: '' },
  { id: 'scr_10_7ari', name: '7ΑΡΙ', category: 'Σκρατς 10€', price: 10, startNo: '', endNo: '' },
  { id: 'scr_10_gata', name: 'ΓΑΤΑ', category: 'Σκρατς 10€', price: 10, startNo: '', endNo: '' },
  { id: 'scr_10_24mines', name: '24 ΜΗΝΕΣ', category: 'Σκρατς 10€', price: 10, startNo: '', endNo: '' },

  // Σκρατς 20 €
  { id: 'scr_20_7ari_x20', name: '7ΑΡΙ Χ20', category: 'Σκρατς 20€', price: 20, startNo: '', endNo: '' },
  { id: 'scr_20_gata_x20', name: 'ΓΑΤΑ Χ20', category: 'Σκρατς 20€', price: 20, startNo: '', endNo: '' },

  // Λαχεία & Ειδικές Εκδόσεις
  // price is PER PIECE for a bundle-tracked row (see isBundleTrackedRow) -
  // €2/piece x 5 pieces/bundle = €10/bundle, matching the real product.
  { id: 'scr_laiko', name: 'Λαϊκό Λαχείο', category: 'Λαχεία', price: 2, startNo: '', endNo: '', bundleSize: 5 },
  { id: 'scr_eidiki_x10', name: 'Ειδική Έκδοση χ10', category: 'Λαχεία', price: 10, startNo: '', endNo: '' },
  { id: 'scr_eidiki_x5', name: 'Ειδική Έκδοση χ5', category: 'Λαχεία', price: 5, startNo: '', endNo: '' },
  { id: 'scr_protochroniatiko', name: 'Πρωτοχρονιάτικο', category: 'Λαχεία', price: 5, startNo: '', endNo: '' },
  { id: 'scr_ethniko_x20', name: 'Εθνικό x 20€', category: 'Λαχεία', price: 20, startNo: '', endNo: '' },
];

export const SCRATCH_CATALOG_STORAGE_KEY = 'shiftledger_scratch_catalog_v2';
export const SCRATCH_STORE_INVENTORY_PREFIX = 'shiftledger_scratch_inv_';

export function getSavedScratchCatalog(): ScratchTicketRow[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(SCRATCH_CATALOG_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge with defaults in case defaults have keys not present. Two
        // cases: an entire preset missing from the cache (handled below by
        // appending it), AND a field added to an EXISTING preset after the
        // cache was written (e.g. bundleSize, added for scr_laiko by this
        // feature) - a cached row already has its own id/name match, so it
        // must be backfilled with any default fields it lacks, or a browser
        // with any pre-existing cached catalog would silently never see
        // bundleSize at all and the whole feature would look inert to them.
        // Cached values still win for fields both sides define (a user's
        // own name/price edits must survive).
        const merged = parsed.map((cached: any) => {
          const def = DEFAULT_SCRATCH_PRESETS.find(
            (d) => d.id === cached.id || (d.name === cached.name && d.category === cached.category)
          );
          return def ? { ...def, ...cached } : cached;
        });
        for (const def of DEFAULT_SCRATCH_PRESETS) {
          if (!merged.some((m) => m.id === def.id || (m.name === def.name && m.category === def.category))) {
            merged.push(def);
          }
        }
        return merged;
      }
    }
  } catch (e) {
    console.warn('Failed to parse scratch catalog from localStorage', e);
  }
  return DEFAULT_SCRATCH_PRESETS;
}

export function saveScratchCatalog(rows: ScratchTicketRow[]): void {
  try {
    if (typeof window === 'undefined') return;
    const cleanDefinitions = rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category || 'Άλλα Σκρατς',
      price: Number(r.price) || 0,
      startNo: '',
      endNo: '',
      backStartNo: '',
      backEndNo: '',
      bundleSize: r.bundleSize,
      backSideEnabled: r.backSideEnabled,
    }));
    localStorage.setItem(SCRATCH_CATALOG_STORAGE_KEY, JSON.stringify(cleanDefinitions));
  } catch (e) {
    console.warn('Failed to save scratch catalog to localStorage', e);
  }
}

/**
 * Creates carry-over scratch inventory from previous shift's ending numbers.
 * Μπροστά: previous shift's endNo -> next shift's (locked) startNo (endNo
 * cleared for the new shift, exactly as before this feature existed).
 * Πίσω: symmetric carry-over in the opposite direction - previous shift's
 * backStartNo -> next shift's (locked) backEndNo (backStartNo cleared).
 * For a fresh package with no prior back reading at all, suggests the
 * package's max ticket number as a starting point for Owner/Admin to
 * confirm - final control always stays with Owner/Admin either way.
 */
export function carryOverScratchInventory(
  previousRows?: ScratchTicketRow[] | any[],
  baseCatalog: ScratchTicketRow[] = getSavedScratchCatalog()
): ScratchTicketRow[] {
  const suggestedBackEnd = (price: number): string => {
    const maxNo = getPackageMaxNumber(price);
    return maxNo === null ? '' : formatTicketNumber(maxNo);
  };

  if (!previousRows || !Array.isArray(previousRows) || previousRows.length === 0) {
    return baseCatalog.map((r) => ({
      ...r,
      startNo: r.startNo || '',
      endNo: '',
      backEndNo: r.backEndNo || suggestedBackEnd(r.price),
      backStartNo: '',
      saleBundles: '',
      salePieces: '',
    }));
  }

  const result: ScratchTicketRow[] = [];

  for (const base of baseCatalog) {
    const prev = previousRows.find((p: any) => p.id === base.id || (p.name === base.name && p.category === base.category));
    if (prev) {
      // If previous had an end number, that becomes the start number for this shift!
      const nextStart = prev.endNo && String(prev.endNo).trim() !== ''
        ? String(prev.endNo).trim()
        : prev.startNo && String(prev.startNo).trim() !== ''
        ? String(prev.startNo).trim()
        : '';
      // Mirror for the back side: previous backStartNo becomes this shift's
      // locked backEndNo baseline.
      const nextBackEnd = prev.backStartNo && String(prev.backStartNo).trim() !== ''
        ? String(prev.backStartNo).trim()
        : prev.backEndNo && String(prev.backEndNo).trim() !== ''
        ? String(prev.backEndNo).trim()
        : suggestedBackEnd(Number(prev.price) || base.price);

      result.push({
        ...base,
        price: Number(prev.price) || base.price,
        startNo: nextStart,
        endNo: '',
        backEndNo: nextBackEnd,
        backStartNo: '',
        manualQty: '',
        saleBundles: '',
        salePieces: '',
      });
    } else {
      result.push({ ...base, endNo: '', backEndNo: base.backEndNo || suggestedBackEnd(base.price), backStartNo: '', saleBundles: '', salePieces: '' });
    }
  }

  // Include any custom items added in the previous shift
  for (const prev of previousRows) {
    if (!result.some((r) => r.id === prev.id || (r.name === prev.name && r.category === prev.category))) {
      const nextStart = prev.endNo && String(prev.endNo).trim() !== ''
        ? String(prev.endNo).trim()
        : prev.startNo && String(prev.startNo).trim() !== ''
        ? String(prev.startNo).trim()
        : '';
      const nextBackEnd = prev.backStartNo && String(prev.backStartNo).trim() !== ''
        ? String(prev.backStartNo).trim()
        : prev.backEndNo && String(prev.backEndNo).trim() !== ''
        ? String(prev.backEndNo).trim()
        : suggestedBackEnd(Number(prev.price) || 5);
      result.push({
        id: prev.id,
        name: prev.name,
        category: prev.category || 'Άλλα Σκρατς',
        price: Number(prev.price) || 5,
        startNo: nextStart,
        endNo: '',
        backEndNo: nextBackEnd,
        backStartNo: '',
        manualQty: '',
        bundleSize: prev.bundleSize,
        backSideEnabled: prev.backSideEnabled,
        saleBundles: '',
        salePieces: '',
      });
    }
  }

  return result;
}

export function saveLatestStoreScratchInventory(storeId: string, rows: ScratchTicketRow[]): void {
  try {
    if (typeof window === 'undefined' || !storeId) return;
    localStorage.setItem(`${SCRATCH_STORE_INVENTORY_PREFIX}${storeId}`, JSON.stringify(rows));
  } catch (e) {
    console.warn('Failed to save store scratch inventory to localStorage', e);
  }
}

export function getLatestStoreScratchInventory(storeId: string): ScratchTicketRow[] | null {
  try {
    if (typeof window === 'undefined' || !storeId) return null;
    const raw = localStorage.getItem(`${SCRATCH_STORE_INVENTORY_PREFIX}${storeId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load store scratch inventory from localStorage', e);
  }
  return null;
}

export function isLotteryRow(row: ScratchTicketRow): boolean {
  const cat = (row.category || '').toLowerCase();
  const name = (row.name || '').toLowerCase();
  return cat.includes('λαχεί') || cat.includes('λαχει') || name.includes('λαχεί') || name.includes('λαχει');
}

export function isBundleTrackedRow(row: ScratchTicketRow): boolean {
  return !!row.bundleSize && row.bundleSize > 0;
}

// Whether a row has a Πίσω (back) side to sell from at all. Falls back to
// the historical rule (Σκρατς: yes, Λαχεία: no) for any row that hasn't
// explicitly set backSideEnabled, so this stays a pure opt-in change.
export function hasBackSide(row: ScratchTicketRow): boolean {
  return row.backSideEnabled ?? !isLotteryRow(row);
}

// Parses a field as a non-negative integer. Empty/undefined -> 0 (no
// fabricated sale, matches every other empty-field convention in this
// file). Decimals, negatives, and non-numeric strings all report as
// invalid so the caller can surface a clear Greek validation error
// instead of silently coercing them.
export function parseNonNegativeInt(raw: string | number | undefined): { value: number; isValid: boolean } {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { value: 0, isValid: true };
  }
  const str = String(raw).trim();
  if (!/^\d+$/.test(str)) {
    return { value: 0, isValid: false };
  }
  const n = parseInt(str, 10);
  return { value: n, isValid: Number.isInteger(n) && n >= 0 };
}

// Normalizes a (bundles, pieces) pair so pieces always lands in
// [0, bundleSize). E.g. bundleSize=5, (1, 7) -> (2, 2).
export function normalizeBundleEntry(bundles: number, pieces: number, bundleSize: number): { bundles: number; pieces: number } {
  const totalPieces = bundles * bundleSize + pieces;
  return {
    bundles: Math.floor(totalPieces / bundleSize),
    pieces: totalPieces % bundleSize,
  };
}

// Αρχικό σύνολο σε πεντάδες - purely informational derived display, never
// a second stored/editable value (the piece count is the only source of
// truth, per spec).
export function splitPiecesIntoBundles(totalPieces: number, bundleSize: number): { bundles: number; pieces: number } {
  if (!bundleSize || bundleSize <= 0 || !Number.isFinite(totalPieces) || totalPieces < 0) {
    return { bundles: 0, pieces: 0 };
  }
  return { bundles: Math.floor(totalPieces / bundleSize), pieces: totalPieces % bundleSize };
}

export interface BundleSaleValidationResult {
  errors: string[];
  isValid: boolean;
  soldPieces: number;
}

// Validates one bundle-tracked row's CURRENT sale entry (saleBundles +
// salePieces) against its available stock (startNo, the remaining piece
// count carried into this shift). Pure, no I/O - used by both the UI
// (inline feedback) and as the model for the mirrored DB-side check.
export function validateBundleSaleEntry(row: ScratchTicketRow): BundleSaleValidationResult {
  const errors: string[] = [];
  const bundleSize = row.bundleSize || 5;

  const bundlesParsed = parseNonNegativeInt(row.saleBundles);
  const piecesParsed = parseNonNegativeInt(row.salePieces);

  if (!bundlesParsed.isValid) {
    errors.push(`Το πεδίο Πεντάδες (${row.saleBundles}) πρέπει να είναι μη αρνητικός ακέραιος αριθμός.`);
  }
  if (!piecesParsed.isValid) {
    errors.push(`Το πεδίο Κομμάτια (${row.salePieces}) πρέπει να είναι μη αρνητικός ακέραιος αριθμός.`);
  }
  if (!bundlesParsed.isValid || !piecesParsed.isValid) {
    return { errors, isValid: false, soldPieces: 0 };
  }

  const { bundles: normBundles, pieces: normPieces } = normalizeBundleEntry(bundlesParsed.value, piecesParsed.value, bundleSize);
  const soldPieces = normBundles * bundleSize + normPieces;

  const available = parseNonNegativeInt(row.startNo).value;
  if (soldPieces > available) {
    const availSplit = splitPiecesIntoBundles(available, bundleSize);
    errors.push(
      `Η πώληση (${normBundles} πεντάδες + ${normPieces} κομμάτια = ${soldPieces} κομμάτια) ξεπερνά το διαθέσιμο απόθεμα ` +
      `(${available} κομμάτια = ${availSplit.bundles} πεντάδες + ${availSplit.pieces} κομμάτια).`
    );
  }

  return { errors, isValid: errors.length === 0, soldPieces };
}

// 300 EUR total face value per full package (000-299 for a 1EUR game, etc.).
// Only meaningful for prices that divide 300 evenly - a custom/non-standard
// game price (e.g. 7EUR) has no defined package size, so bound-checking is
// skipped for it entirely, same as today's total absence of bound-checking.
const PACKAGE_FACE_VALUE = 300;

export function getPackagePieceCount(price: number): number | null {
  if (!price || price <= 0) return null;
  const pieces = PACKAGE_FACE_VALUE / price;
  return Number.isInteger(pieces) ? pieces : null;
}

export function getPackageMaxNumber(price: number): number | null {
  const pieces = getPackagePieceCount(price);
  return pieces === null ? null : pieces - 1;
}

export function formatTicketNumber(raw: string | number | undefined): string {
  const str = raw === undefined || raw === '' ? '0' : String(raw);
  const n = parseInt(str, 10);
  if (isNaN(n)) return '000';
  return String(Math.max(0, n)).padStart(3, '0');
}

// Μπροστά (Front) - unchanged from the original single-direction logic.
// qty = Τελικό - Αρχικό (exclusive "pointer to next ticket" counting,
// clamped to 0 if invalid/reversed). Empty Τελικό = no sale recorded yet,
// never a fabricated 0-turns-negative or phantom sale.
export function calculateRowQty(row: ScratchTicketRow): number {
  if (row.manualQty !== undefined && row.manualQty !== '') {
    const q = parseInt(row.manualQty, 10);
    return isNaN(q) || q < 0 ? 0 : q;
  }

  const startStr = row.startNo !== undefined ? String(row.startNo).trim() : '';
  const endStr = row.endNo !== undefined ? String(row.endNo).trim() : '';

  // Αν δεν έχει εισαχθεί τελικός αριθμός, 0 πωλήσεις
  if (endStr === '') {
    return 0;
  }

  // Αν το αρχικό είναι κενό, θεωρείται ότι ξεκινά από το δελτίο 0 (000)
  const start = startStr === '' ? 0 : parseInt(startStr, 10);
  const end = parseInt(endStr, 10);

  if (isNaN(start) || isNaN(end)) {
    return 0;
  }

  if (!isLotteryRow(row)) {
    // Στα Σκρατς το τελικό δεν γίνεται να είναι μικρότερο από το αρχικό
    if (end < start) {
      return 0;
    }
    return end - start;
  } else {
    // Στα Λαχεία
    if (end >= start) {
      return end - start;
    } else {
      return Math.abs(start - end);
    }
  }
}

// Πίσω (Back) - the exact mathematical mirror of calculateRowQty: same
// exclusive "Τελικό - Αρχικό" subtraction, clamped to 0. backEndNo is the
// locked baseline (near the package's high end, e.g. 299 for a fresh 1EUR
// pack); backStartNo is the moving, User-filled current reading (decreasing
// as more gets sold from the back). Empty backStartNo = no back-side sale
// recorded yet, mirroring endNo's empty-means-zero convention exactly.
// Rows without a back side (hasBackSide === false) contribute zero here.
export function calculateBackRowQty(row: ScratchTicketRow): number {
  if (!hasBackSide(row)) return 0;

  const backStartStr = row.backStartNo !== undefined ? String(row.backStartNo).trim() : '';
  const backEndStr = row.backEndNo !== undefined ? String(row.backEndNo).trim() : '';

  if (backStartStr === '') {
    return 0;
  }

  const backStart = parseInt(backStartStr, 10);
  const backEnd = backEndStr === '' ? backStart : parseInt(backEndStr, 10);

  if (isNaN(backStart) || isNaN(backEnd)) {
    return 0;
  }

  if (backEnd < backStart) {
    return 0;
  }
  return backEnd - backStart;
}

export function calculateCombinedRowQty(row: ScratchTicketRow): number {
  return calculateRowQty(row) + calculateBackRowQty(row);
}

export function calculateRowTotal(row: ScratchTicketRow): number {
  return calculateCombinedRowQty(row) * (row.price || 0);
}

export function calculateBackRowTotal(row: ScratchTicketRow): number {
  return calculateBackRowQty(row) * (row.price || 0);
}

export interface ScratchRowValidationResult {
  errors: string[];
  isValid: boolean;
}

// Validates a single row's Front/Back numbers against the package's real
// bounds and the non-crossing rule. Pure, no I/O - safe to call from both
// the UI (inline feedback) and before persisting (defense in depth).
export function validateScratchRow(row: ScratchTicketRow): ScratchRowValidationResult {
  const errors: string[] = [];
  if (isLotteryRow(row)) return { errors, isValid: true };

  const pieceCount = getPackagePieceCount(row.price);
  const frontStart = row.startNo?.trim() ? parseInt(row.startNo, 10) : 0;
  const frontEnd = row.endNo?.trim() ? parseInt(row.endNo, 10) : null;
  const backStart = row.backStartNo?.trim() ? parseInt(row.backStartNo, 10) : null;
  const backEnd = row.backEndNo?.trim() ? parseInt(row.backEndNo, 10) : (pieceCount ?? null);

  if (pieceCount !== null) {
    if (frontEnd !== null && (frontEnd < 0 || frontEnd > pieceCount)) {
      errors.push(`Το Μπροστά - Τελικό (${row.endNo}) πρέπει να είναι μεταξύ 000 και ${formatTicketNumber(pieceCount)} για παιχνίδι των ${row.price}€.`);
    }
    if (frontStart < 0 || frontStart > pieceCount) {
      errors.push(`Το Μπροστά - Αρχικό (${row.startNo || '000'}) πρέπει να είναι μεταξύ 000 και ${formatTicketNumber(pieceCount)} για παιχνίδι των ${row.price}€.`);
    }
    if (backStart !== null && (backStart < 0 || backStart > pieceCount)) {
      errors.push(`Το Πίσω - Αρχικό (${row.backStartNo}) πρέπει να είναι μεταξύ 000 και ${formatTicketNumber(pieceCount)} για παιχνίδι των ${row.price}€.`);
    }
    if (backEnd !== null && (backEnd < 0 || backEnd > pieceCount)) {
      errors.push(`Το Πίσω - Τελικό (${formatTicketNumber(backEnd)}) πρέπει να είναι μεταξύ 000 και ${formatTicketNumber(pieceCount)} για παιχνίδι των ${row.price}€.`);
    }
  }

  if (frontEnd !== null && frontEnd < frontStart) {
    errors.push(`Το Μπροστά - Τελικό (${row.endNo}) δεν μπορεί να είναι μικρότερο από το Μπροστά - Αρχικό (${formatTicketNumber(frontStart)}).`);
  }
  if (backStart !== null && backEnd !== null && backStart > backEnd) {
    errors.push(`Το Πίσω - Αρχικό (${row.backStartNo}) δεν μπορεί να είναι μεγαλύτερο από το Πίσω - Τελικό (${formatTicketNumber(backEnd)}).`);
  }

  // Non-crossing: the two directions consume the same shared inventory and
  // must not overlap or double-count the same physical tickets.
  if (frontEnd !== null && backStart !== null && frontEnd > backStart) {
    errors.push(
      `Οι μετρήσεις Μπροστά και Πίσω επικαλύπτονται (Μπροστά - Τελικό ${row.endNo} > Πίσω - Αρχικό ${row.backStartNo}). ` +
      `Οι δύο πλευρές δεν μπορούν να καταγράψουν τα ίδια δελτία.`
    );
  }

  if (pieceCount !== null) {
    const totalQty = calculateCombinedRowQty(row);
    if (totalQty > pieceCount) {
      errors.push(`Το συνολικό πλήθος πωλημένων τεμαχίων (${totalQty}) δεν μπορεί να ξεπεράσει τα ${pieceCount} τεμάχια του πακέτου.`);
    }
    const totalValue = totalQty * (row.price || 0);
    if (totalValue > PACKAGE_FACE_VALUE) {
      errors.push(`Η συνολική αξία πωλήσεων (${totalValue.toFixed(2)}€) δεν μπορεί να ξεπεράσει τα ${PACKAGE_FACE_VALUE}€ ανά πακέτο.`);
    }
  }

  return { errors, isValid: errors.length === 0 };
}

interface ScratchCalculatorTableProps {
  rows: ScratchTicketRow[];
  onChangeRows: (newRows: ScratchTicketRow[]) => void;
  readOnly?: boolean;
}

export const ScratchCalculatorTable: React.FC<ScratchCalculatorTableProps> = ({
  rows,
  onChangeRows,
  readOnly = false,
}) => {
  const { roles, permissions } = useAuth();
  const canManage =
    roles.some(
      (r) =>
        r.code === 'STORE_MANAGER' ||
        r.code === 'ORG_OWNER' ||
        r.code === 'PLATFORM_ADMIN' ||
        r.code === 'ORG_ADMIN'
    ) ||
    permissions.includes('*') ||
    permissions.includes('store.view');

  // Locked-field gate (Μπροστά-Αρχικό, Πίσω-Τελικό): must match exactly who
  // the DB trigger (enforce_scratch_field_locks, 0006 migration) actually
  // allows - ORG_OWNER/PLATFORM_ADMIN/AREA_MANAGER/STORE_MANAGER/ORG_ADMIN.
  // Deliberately NOT the same as canManage above: canManage also passes for
  // anyone with the 'store.view' permission, which EMPLOYEE has too (see
  // rbac.ts) - fine for showing/hiding the general management affordances,
  // but locked-field access needs the precise elevated-roles list so the UI
  // doesn't invite an employee to toggle a field the database will reject.
  const canEditLockedFields = roles.some((r) =>
    ['ORG_OWNER', 'PLATFORM_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER', 'ORG_ADMIN'].includes(r.code)
  ) || permissions.includes('*');

  const [editingRowId, setEditingRowId] = React.useState<string | null>(null);
  const [managerOverrideEnabled, setManagerOverrideEnabled] = useState(false);
  const [showRulesInfo, setShowRulesInfo] = useState(false);
  const [newPackModalRowId, setNewPackModalRowId] = useState<string | null>(null);
  const [newPackStartNo, setNewPackStartNo] = useState<string>('0');
  const [newPackBackEndNo, setNewPackBackEndNo] = useState<string>('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [rowToRemove, setRowToRemove] = useState<string | null>(null);

  useEffect(() => {
    if (!newPackModalRowId && !showResetConfirm && !rowToRemove) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNewPackModalRowId(null);
        setShowResetConfirm(false);
        setRowToRemove(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [newPackModalRowId, showResetConfirm, rowToRemove]);

  const handleUpdateRow = (id: string, field: keyof ScratchTicketRow, value: any) => {
    if (readOnly) return;
    const updated = rows.map((r) => {
      if (r.id !== id) return r;
      const nextRow = { ...r, [field]: value };
      // Admin editing the initial piece total (startNo) on a bundle-tracked
      // row must recompute endNo in the same update - endNo = startNo - sold
      // is an invariant the backend trigger enforces (0008), so leaving a
      // stale endNo here would make the very next save rejected server-side.
      if (field === 'startNo' && isBundleTrackedRow(nextRow)) {
        const bundleSize = nextRow.bundleSize || 5;
        const { bundles: normBundles, pieces: normPieces } = normalizeBundleEntry(
          parseNonNegativeInt(nextRow.saleBundles).value,
          parseNonNegativeInt(nextRow.salePieces).value,
          bundleSize
        );
        const soldPieces = normBundles * bundleSize + normPieces;
        const available = parseNonNegativeInt(nextRow.startNo).value;
        nextRow.endNo = soldPieces > 0 ? String(Math.max(0, available - soldPieces)) : '';
      }
      return nextRow;
    });
    onChangeRows(updated);
    if (field === 'name' || field === 'price' || field === 'category') {
      saveScratchCatalog(updated);
    }
  };

  // Updates a bundle-tracked row's sale entry (saleBundles/salePieces) and
  // recomputes endNo (startNo - sold pieces) in the same update, so endNo
  // keeps meaning exactly what it always has ("remaining after") without
  // the User ever typing it directly. Normalizes pieces >= bundleSize into
  // whole bundles before storing, per spec.
  const handleUpdateBundleSale = (id: string, field: 'saleBundles' | 'salePieces', rawValue: string) => {
    if (readOnly) return;
    const digitsOnly = rawValue.replace(/[^0-9]/g, '');
    const updated = rows.map((r) => {
      if (r.id !== id) return r;
      const bundleSize = r.bundleSize || 5;
      const nextRow = { ...r, [field]: digitsOnly };
      const bundlesParsed = parseNonNegativeInt(nextRow.saleBundles);
      const piecesParsed = parseNonNegativeInt(nextRow.salePieces);
      if (!bundlesParsed.isValid || !piecesParsed.isValid) {
        // Leave endNo untouched while the field holds a transiently
        // invalid value (e.g. mid-edit) - validateBundleSaleEntry will
        // surface the real error for display.
        return nextRow;
      }
      const { bundles: normBundles, pieces: normPieces } = normalizeBundleEntry(bundlesParsed.value, piecesParsed.value, bundleSize);
      const soldPieces = normBundles * bundleSize + normPieces;
      const available = parseNonNegativeInt(r.startNo).value;
      const remaining = Math.max(0, available - soldPieces);
      return {
        ...nextRow,
        saleBundles: String(normBundles),
        salePieces: String(normPieces),
        endNo: soldPieces > 0 ? String(remaining) : '',
      };
    });
    onChangeRows(updated);
  };

  // Owner/Admin-only config toggles for Λαχεία rows: whether the row uses
  // πεντάδα/κομμάτι dual tracking at all, and whether it also sells from
  // the Πίσω side. Both default off/historical for every row that hasn't
  // been explicitly configured (see isBundleTrackedRow/hasBackSide).
  const handleToggleBundleTracking = (id: string, enabled: boolean) => {
    if (readOnly) return;
    const updated = rows.map((r) => {
      if (r.id !== id) return r;
      if (enabled) return { ...r, bundleSize: r.bundleSize || 5 };
      // Turning it off: clear the sale-entry fields too, they're meaningless
      // without a bundle size to normalize against. endNo (the actual
      // remaining count) is left untouched - it's still valid as a plain reading.
      return { ...r, bundleSize: undefined, saleBundles: undefined, salePieces: undefined };
    });
    onChangeRows(updated);
    saveScratchCatalog(updated);
  };

  const handleSetBundleSize = (id: string, size: number) => {
    if (readOnly) return;
    const updated = rows.map((r) => (r.id === id ? { ...r, bundleSize: size } : r));
    onChangeRows(updated);
    saveScratchCatalog(updated);
  };

  const handleToggleBackSide = (id: string, enabled: boolean) => {
    if (readOnly) return;
    const updated = rows.map((r) => {
      if (r.id !== id) return r;
      if (enabled) return { ...r, backSideEnabled: true };
      // Disabling: clear any back-side data so it doesn't linger unused.
      return { ...r, backSideEnabled: false, backStartNo: '', backEndNo: '' };
    });
    onChangeRows(updated);
    saveScratchCatalog(updated);
  };

  const handleApplyNewPack = (rowId: string) => {
    const updated = rows.map((r) => {
      if (r.id === rowId) {
        return {
          ...r,
          startNo: newPackStartNo,
          endNo: '',
          backEndNo: newPackBackEndNo,
          backStartNo: '',
          saleBundles: '',
          salePieces: '',
          isNewPack: true,
        };
      }
      return r;
    });
    onChangeRows(updated);
    setNewPackModalRowId(null);
  };

  const handleAddRow = (categoryName = 'Σκρατς 5€') => {
    if (readOnly) return;
    const newRow: ScratchTicketRow = {
      id: `custom_scr_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: 'Νέο Παιχνίδι Σκρατς',
      category: categoryName,
      price: 5,
      startNo: '0',
      endNo: '',
    };
    const updated = [...rows, newRow];
    onChangeRows(updated);
    saveScratchCatalog(updated);
    setEditingRowId(newRow.id);
  };

  const handleRemoveRow = (id: string) => {
    if (readOnly) return;
    const updated = rows.filter((r) => r.id !== id);
    onChangeRows(updated);
    saveScratchCatalog(updated);
    setRowToRemove(null);
  };

  const handleReset = () => {
    if (readOnly) return;
    const reset = rows.map((r) => ({ ...r, endNo: '', backStartNo: '', manualQty: '' }));
    onChangeRows(reset);
    setShowResetConfirm(false);
  };

  // calculateCombinedRowQty (front+back) here, not calculateRowQty (front
  // only) - keeps "pieces sold" and "value sold" consistent with each other
  // and with calculateRowTotal, which already includes both sides.
  const scratchPieces = rows.filter((r) => !isLotteryRow(r)).reduce((acc, r) => acc + calculateCombinedRowQty(r), 0);
  const scratchFrontPieces = rows.filter((r) => !isLotteryRow(r)).reduce((acc, r) => acc + calculateRowQty(r), 0);
  const scratchBackPieces = rows.filter((r) => !isLotteryRow(r)).reduce((acc, r) => acc + calculateBackRowQty(r), 0);
  const scratchSales = rows.filter((r) => !isLotteryRow(r)).reduce((acc, r) => acc + calculateRowTotal(r), 0);
  // calculateCombinedRowQty (not calculateRowQty) - a Λαχεία row can now
  // opt into Πίσω selling too (hasBackSide), same reasoning as scratchPieces above.
  const lotteryPieces = rows.filter((r) => isLotteryRow(r)).reduce((acc, r) => acc + calculateCombinedRowQty(r), 0);
  const lotterySales = rows.filter((r) => isLotteryRow(r)).reduce((acc, r) => acc + calculateRowTotal(r), 0);
  const totalTicketsSold = scratchPieces + lotteryPieces;
  const grandTotalSales = scratchSales + lotterySales;
  const rowValidationErrors = new Map<string, string[]>();
  for (const r of rows) {
    const errors = isBundleTrackedRow(r) ? validateBundleSaleEntry(r).errors : validateScratchRow(r).errors;
    if (errors.length > 0) rowValidationErrors.set(r.id, errors);
  }

  // Helper for typing ticket numbers: strips leading zeros when typing new number over 000
  const handleTicketNumberChange = (
    rowId: string,
    field: 'startNo' | 'endNo' | 'backStartNo' | 'backEndNo',
    inputVal: string,
    previousVal: string
  ) => {
    let val = inputVal.replace(/[^0-9]/g, '');
    if (/^0+$/.test(previousVal) && val.length > previousVal.length) {
      val = val.replace(/^0+/, '');
    } else if (/^0+[1-9]/.test(val)) {
      val = val.replace(/^0+/, '');
    }
    handleUpdateRow(rowId, field, val);
  };

  // Group rows by category
  const categories = Array.from(
    new Set(rows.map((r) => r.category || 'Άλλα Σκρατς'))
  );

  return (
    <div className="space-y-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <Hash className="w-4 h-4 text-indigo-600" />
              <span>Έλληνικά Λαχεία & Σκρατς (Καταμέτρηση Τεμαχίων)</span>
            </h4>
            <button
              type="button"
              onClick={() => setShowRulesInfo(!showRulesInfo)}
              className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 cursor-pointer"
              title={showRulesInfo ? 'Απόκρυψη κανόνων καταμέτρησης' : 'Εμφάνιση κανόνων καταμέτρησης'}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            {canEditLockedFields && (
              <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-indigo-600" />
                Διαχειριστής (Πρόσβαση σε Αρχικό & Νέα Πακέτα)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Το <strong className="text-slate-700">Μπροστά-Αρχικό</strong> μεταφέρεται αυτόματα από το προηγούμενο <strong className="text-slate-700">Μπροστά-Τελικό</strong>, και το <strong className="text-slate-700">Πίσω-Τελικό</strong> από το προηγούμενο <strong className="text-slate-700">Πίσω-Αρχικό</strong>. Ο υπάλληλος συμπληρώνει μόνο το Μπροστά-Τελικό και το Πίσω-Αρχικό στο κλείσιμο.
          </p>
        </div>

        {!readOnly && (
          <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-1">
            {canEditLockedFields && (
              <button
                type="button"
                onClick={() => setManagerOverrideEnabled(!managerOverrideEnabled)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                  managerOverrideEnabled
                    ? 'bg-amber-500 text-slate-950 border border-amber-600 shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
                title="Επιτρέπει την τροποποίηση του αρχικού αριθμού ή άνοιγμα νέου πακέτου"
              >
                {managerOverrideEnabled ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{managerOverrideEnabled ? 'Αλλαγή Αρχικού (Ενεργή)' : 'Επεξεργασία Αρχικού / Νέο Πακέτο'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
              title="Καθαρισμός Μπροστά-Τελικό και Πίσω-Αρχικό (οι μετρήσεις πωλήσεων της βάρδιας)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Καθαρισμός Τελικών</span>
            </button>

            {canManage && (
              <button
                type="button"
                onClick={() => handleAddRow()}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs transition-all flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Προσθήκη Παιχνιδιού</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info notice about scratch vs lotteries calculation rules - collapsed by
          default so returning users reach the table immediately; still one click away. */}
      {showRulesInfo && (
        <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-start space-x-2 text-[11px] text-indigo-900">
          <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p>
              <strong>Κανόνες Καταμέτρησης:</strong> Κάθε πακέτο <strong>Σκρατς</strong> μπορεί να πουληθεί ταυτόχρονα και από τις δύο πλευρές του ίδιου αποθέματος -{' '}
              <strong className="text-indigo-700">Μπροστά</strong> (από την αρχή της αρίθμησης προς τα πάνω) και{' '}
              <strong className="text-purple-700">Πίσω</strong> (από το τέλος προς τα κάτω). Κάθε πλευρά υπολογίζεται ως{' '}
              <code className="font-mono bg-white px-1 py-0.5 rounded border border-indigo-200 font-bold">Τελικό - Αρχικό</code> (π.χ. από 000 σε 10 = 10 τεμάχια) και το <strong>Σύνολο</strong> είναι το άθροισμα των δύο πλευρών. Τα κλειδωμένα πεδία (🔒) διαχειρίζονται μόνο από Owner/Admin.
            </p>
          </div>
        </div>
      )}

      {/* Table grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-extrabold uppercase tracking-wider text-[10px]">
              <th className="p-2.5 min-w-[150px]" rowSpan={2} scope="col">Παιχνίδι / Κωδικός</th>
              <th className="p-2.5 w-16 text-right" rowSpan={2} scope="col">Τιμή (€)</th>
              <th className="p-2 text-center bg-indigo-50/70 border-l border-indigo-100" colSpan={2} scope="colgroup">
                <span className="text-indigo-700">Μπροστά</span>
                <span className="block text-[9px] font-medium normal-case text-indigo-500/80 tracking-normal mt-0.5">Πώληση από την αρχή του πακέτου</span>
              </th>
              <th className="p-2 text-center bg-purple-50/70 border-l border-purple-100" colSpan={2} scope="colgroup">
                <span className="text-purple-700">Πίσω</span>
                <span className="block text-[9px] font-medium normal-case text-purple-500/80 tracking-normal mt-0.5">Πώληση από το τέλος του πακέτου</span>
              </th>
              <th className="p-2.5 w-24 text-center border-l border-slate-200" colSpan={2} scope="colgroup">Σύνολο</th>
              {!readOnly && canManage && <th className="p-2.5 w-20 text-center" rowSpan={2} scope="col">Ενέργειες</th>}
            </tr>
            <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-extrabold uppercase tracking-wider text-[10px]">
              <th className="p-2 w-28 text-center bg-indigo-50/40" scope="col">
                <div className="flex items-center justify-center space-x-1">
                  <span>Αρχικό</span>
                  {!canEditLockedFields || !managerOverrideEnabled ? (
                    <span title="Κλειδωμένο - μόνο Owner/Admin (αυτόματη μεταφορά από προηγούμενη βάρδια)">
                      <Lock className="w-3 h-3 text-slate-400" />
                    </span>
                  ) : null}
                </div>
              </th>
              <th className="p-2 w-28 text-center bg-indigo-50/40" scope="col">Τελικό</th>
              <th className="p-2 w-28 text-center bg-purple-50/40" scope="col">Αρχικό</th>
              <th className="p-2 w-28 text-center bg-purple-50/40" scope="col">
                <div className="flex items-center justify-center space-x-1">
                  <span>Τελικό</span>
                  {!canEditLockedFields || !managerOverrideEnabled ? (
                    <span title="Κλειδωμένο - μόνο Owner/Admin">
                      <Lock className="w-3 h-3 text-slate-400" />
                    </span>
                  ) : null}
                </div>
              </th>
              <th className="p-2 w-20 text-center border-l border-slate-200" scope="col">Τμχ</th>
              <th className="p-2 w-24 text-right" scope="col">Αξία (€)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {categories.map((cat) => {
              const catRows = rows.filter((r) => (r.category || 'Άλλα Σκρατς') === cat);
              const catTotal = catRows.reduce((acc, r) => acc + calculateRowTotal(r), 0);
              // calculateCombinedRowQty (front+back), not calculateRowQty (front-only) -
              // matches catTotal above (calculateRowTotal already combines both sides),
              // and the per-row Σύνολο column. Pre-existing gap from the Front/Back
              // feature: this header badge undercounted any row with back-side sales.
              const catQty = catRows.reduce((acc, r) => acc + calculateCombinedRowQty(r), 0);
              const isCatLottery = cat.toLowerCase().includes('λαχεί') || cat.toLowerCase().includes('λαχει');

              return (
                <React.Fragment key={cat}>
                  {/* Category Header Row */}
                  <tr className="bg-slate-50/90 border-t border-b border-slate-200">
                    <td colSpan={readOnly || !canManage ? 8 : 9} className="px-3 py-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-800 text-xs tracking-wide uppercase flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block"></span>
                          {cat}
                        </span>
                        <span className="text-[11px] font-bold text-slate-700 font-mono bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                          {catQty} τμχ • <span className="text-emerald-700 font-black">{formatCurrency(catTotal)}</span>
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Category Items */}
                  {catRows.map((row) => {
                    const isLottery = isLotteryRow(row);
                    const isBundleTracked = isBundleTrackedRow(row);
                    const rowHasBackSide = hasBackSide(row);
                    const rowBundleSize = row.bundleSize || 5;
                    const startPiecesSplit = splitPiecesIntoBundles(parseNonNegativeInt(row.startNo).value, rowBundleSize);
                    const bundleSaleCheck = validateBundleSaleEntry(row);
                    const remainingPieces = Math.max(0, parseNonNegativeInt(row.startNo).value - bundleSaleCheck.soldPieces);
                    const remainingSplit = splitPiecesIntoBundles(remainingPieces, rowBundleSize);
                    const frontQty = calculateRowQty(row);
                    const backQty = calculateBackRowQty(row);
                    const totalQty = frontQty + backQty;
                    const total = calculateRowTotal(row);
                    const isEditing = editingRowId === row.id;
                    const canEditStart = !readOnly && canEditLockedFields && managerOverrideEnabled;
                    const canEditBackEnd = !readOnly && canEditLockedFields && managerOverrideEnabled;
                    const canEditBackStart = !readOnly && rowHasBackSide;
                    const startStr = (row.startNo !== undefined ? String(row.startNo) : '').trim();
                    const endStr = (row.endNo !== undefined ? String(row.endNo) : '').trim();
                    const backStartStr = (row.backStartNo !== undefined ? String(row.backStartNo) : '').trim();
                    const backEndStr = (row.backEndNo !== undefined ? String(row.backEndNo) : '').trim();
                    const startNum = startStr !== '' ? parseInt(startStr, 10) : 0;
                    const endNum = endStr !== '' ? parseInt(endStr, 10) : null;
                    const backStartNum = backStartStr !== '' ? parseInt(backStartStr, 10) : null;
                    const backEndNum = backEndStr !== '' ? parseInt(backEndStr, 10) : null;
                    const isInvalidScratchEnd =
                      !isLottery &&
                      endNum !== null &&
                      !isNaN(startNum) &&
                      !isNaN(endNum) &&
                      endNum < startNum;
                    const isInvalidBackStart =
                      !isLottery &&
                      backStartNum !== null &&
                      backEndNum !== null &&
                      !isNaN(backStartNum) &&
                      !isNaN(backEndNum) &&
                      backStartNum > backEndNum;
                    const rowErrors = rowValidationErrors.get(row.id) || [];
                    const hasCrossingError = rowErrors.some((e) => e.includes('επικαλύπτονται'));

                    return (
                      <React.Fragment key={row.id}>
                      <tr className="hover:bg-indigo-50/30 transition-colors">
                        {/* Name */}
                        <td className="p-2 font-bold text-slate-800">
                          {isEditing ? (
                            <div className="flex items-center space-x-1">
                              <input
                                type="text"
                                value={row.name}
                                onChange={(e) => handleUpdateRow(row.id, 'name', e.target.value)}
                                className="w-full px-2 py-1 border border-indigo-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-between group">
                              <div className="flex items-center space-x-1.5">
                                <span>{row.name}</span>
                                {row.isNewPack && (
                                  <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded-full border border-emerald-300">
                                    Νέο Πακέτο
                                  </span>
                                )}
                              </div>
                              {!readOnly && canManage && (
                                <button
                                  type="button"
                                  onClick={() => setEditingRowId(row.id)}
                                  className="text-slate-400 hover:text-indigo-600 transition-colors p-1.5 cursor-pointer"
                                  title="Επεξεργασία ονόματος/τιμής"
                                  aria-label="Επεξεργασία ονόματος/τιμής"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Price - PER PIECE for bundle-tracked rows (bundle price is derived: price x bundleSize) */}
                        <td className="p-2 text-right">
                          {isEditing ? (
                            <div>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={row.price}
                                onChange={(e) =>
                                  handleUpdateRow(row.id, 'price', parseFloat(e.target.value) || 0)
                                }
                                className="w-16 px-1.5 py-1 text-right border border-indigo-300 rounded-lg text-xs font-black text-slate-950 bg-white focus:ring-1 focus:ring-indigo-500"
                              />
                              {isBundleTracked && (
                                <p className="text-[9px] text-slate-500 mt-0.5 whitespace-nowrap">
                                  /κομμάτιο (≈{formatCurrency((Number(row.price) || 0) * rowBundleSize)}/{rowBundleSize}άδα)
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="font-extrabold text-slate-900 font-mono text-xs">
                              {formatCurrency(row.price)}
                              {isBundleTracked && (
                                <span className="block text-[9px] font-semibold text-slate-400">/κομμάτιο</span>
                              )}
                            </span>
                          )}
                        </td>

                        {/* Μπροστά - Αρχικό (Locked for regular employee, editable by Owner/Admin when override active) */}
                        <td className="p-2 text-center bg-indigo-50/20">
                          <div className="relative inline-block w-full max-w-[100px]">
                            <input
                              type="text"
                              inputMode="numeric"
                              disabled={!canEditStart}
                              value={row.startNo}
                              onFocus={(e) => {
                                e.currentTarget.select();
                                if (/^0+$/.test(row.startNo)) {
                                  handleUpdateRow(row.id, 'startNo', '');
                                }
                              }}
                              onClick={(e) => {
                                if (/^0+$/.test(row.startNo)) {
                                  handleUpdateRow(row.id, 'startNo', '');
                                } else {
                                  e.currentTarget.select();
                                }
                              }}
                              onBlur={() => {
                                if (row.startNo.trim() === '') {
                                  handleUpdateRow(row.id, 'startNo', '000');
                                }
                              }}
                              onChange={(e) => handleTicketNumberChange(row.id, 'startNo', e.target.value, row.startNo)}
                              placeholder="000"
                              className={`w-full text-center px-2 py-1.5 rounded-lg text-xs font-mono font-black shadow-2xs transition-colors ${
                                canEditStart
                                  ? 'bg-amber-50 text-amber-950 border-2 border-amber-400 focus:ring-2 focus:ring-amber-500'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200 cursor-not-allowed opacity-90'
                              }`}
                              title={
                                isBundleTracked
                                  ? canEditStart
                                    ? 'Διαχειριστής: Αρχικό σύνολο κομματιών (καταχωρίζεται αποκλειστικά σε μεμονωμένα κομμάτια)'
                                    : 'Κλειδωμένο: Αρχικό σύνολο κομματιών - Αυτόματη μεταφορά από την προηγούμενη βάρδια'
                                  : canEditStart
                                  ? 'Διαχειριστής: Μπορείτε να ορίσετε νέο αρχικό νούμερο'
                                  : 'Κλειδωμένο: Αυτόματη μεταφορά από την προηγούμενη βάρδια'
                              }
                            />
                            {!canEditStart && (
                              <div className="absolute right-1.5 top-2.5 pointer-events-none text-slate-400">
                                <Lock className="w-3 h-3" />
                              </div>
                            )}
                            {isBundleTracked && (
                              <span className="text-[10px] font-bold text-slate-500 block mt-0.5">
                                ≈ {startPiecesSplit.bundles} πεντ. + {startPiecesSplit.pieces} κομ.
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Μπροστά - Τελικό: for bundle-tracked rows (Λαϊκό Λαχείο), the User enters
                            the sale as πεντάδες + κομμάτια instead of typing a raw remaining count -
                            endNo gets computed automatically (handleUpdateBundleSale), keeping its
                            existing "remaining after" meaning unchanged. */}
                        <td className="p-2 text-center bg-indigo-50/20">
                          {isBundleTracked ? (
                            <div className="w-full max-w-[160px] mx-auto space-y-1">
                              {/* Was a single flex row with "×N +" squeezed between the two inputs -
                                  on a narrow rendered column that separator (shrink-0) took priority
                                  over the inputs, leaving them as little as 16px wide: less than their
                                  own padding+border, so a typed digit had zero room to actually render.
                                  A plain 2-column grid guarantees each input a real, equal share of the
                                  width; the ×N relationship is still taught by the label below instead
                                  of fighting for space on the same line. */}
                              <div className="grid grid-cols-2 gap-1">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  disabled={readOnly}
                                  value={row.saleBundles || ''}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => handleUpdateBundleSale(row.id, 'saleBundles', e.target.value)}
                                  placeholder="0"
                                  title="Πεντάδες που πωλήθηκαν"
                                  className={`w-full min-w-[34px] text-center px-0.5 py-2 rounded-lg text-sm font-mono font-black shadow-2xs transition-colors ${
                                    rowErrors.length > 0
                                      ? 'border-2 border-rose-500 bg-rose-50 text-rose-900 focus:ring-2 focus:ring-rose-500'
                                      : 'border-2 border-indigo-200 text-slate-950 bg-white focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-700'
                                  }`}
                                />
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  disabled={readOnly}
                                  value={row.salePieces || ''}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => handleUpdateBundleSale(row.id, 'salePieces', e.target.value)}
                                  placeholder="0"
                                  title="Μεμονωμένα κομμάτια που πωλήθηκαν"
                                  className={`w-full min-w-[34px] text-center px-0.5 py-2 rounded-lg text-sm font-mono font-black shadow-2xs transition-colors ${
                                    rowErrors.length > 0
                                      ? 'border-2 border-rose-500 bg-rose-50 text-rose-900 focus:ring-2 focus:ring-rose-500'
                                      : 'border-2 border-indigo-200 text-slate-950 bg-white focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-700'
                                  }`}
                                />
                              </div>
                              {/* No empty-state hint here - the two title tooltips on the inputs above,
                                  plus the ≈X πεντάδες + Y κομμάτια line in the Αρχικό cell, already say
                                  what these boxes are for. A "Πεντάδες + Κομμάτια" label wrapped to 3
                                  lines at this width, adding height to the single most common state
                                  (every row starts here) for information the row already conveys.
                                  Gated on soldPieces > 0, not on the raw strings being truthy - a row
                                  whose sale was entered and then cleared stores "0"/"0" (a non-empty,
                                  truthy string), which must display exactly like never-touched
                                  (undefined) rows, not show a stale "sale recorded" state. */}
                              {bundleSaleCheck.soldPieces > 0 && (
                                <span className="text-[10px] font-bold text-indigo-600 block">
                                  = {bundleSaleCheck.soldPieces} τμχ
                                </span>
                              )}
                              {bundleSaleCheck.soldPieces > 0 && rowErrors.length === 0 && (
                                <span className="text-[10px] font-semibold text-emerald-600 block">
                                  {/* "πεντ."/"κομ." abbreviations, not the earlier "A×B+C" notation -
                                      that read like an arithmetic formula rather than "A bundles + B
                                      pieces". Matches the same abbreviation used in the ≈X πεντ. + Y κομ.
                                      hint above, which needed it for the same reason: the full words
                                      ("πεντάδες"/"κομμάτια") wrapped to 3 lines at this column width. */}
                                  Μένουν: {remainingSplit.bundles} πεντ. + {remainingSplit.pieces} κομ.
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="relative inline-block w-full max-w-[100px]">
                            <input
                              type="text"
                              inputMode="numeric"
                              disabled={readOnly}
                              value={row.endNo}
                              onFocus={(e) => {
                                e.currentTarget.select();
                                if (/^0+$/.test(row.endNo)) {
                                  handleUpdateRow(row.id, 'endNo', '');
                                }
                              }}
                              onClick={(e) => {
                                if (/^0+$/.test(row.endNo)) {
                                  handleUpdateRow(row.id, 'endNo', '');
                                } else {
                                  e.currentTarget.select();
                                }
                              }}
                              onBlur={() => {
                                // Στα Σκρατς κλείδωμα: το τελικό δεν γίνεται να είναι μικρότερο από το αρχικό
                                if (!isLottery && startNum !== null && endNum !== null && endNum < startNum) {
                                  handleUpdateRow(row.id, 'endNo', row.startNo || '000');
                                }
                              }}
                              onChange={(e) => handleTicketNumberChange(row.id, 'endNo', e.target.value, row.endNo)}
                              placeholder="000"
                              className={`w-full text-center px-2 py-1.5 rounded-lg text-xs font-mono font-black shadow-2xs transition-colors ${
                                isInvalidScratchEnd || hasCrossingError
                                  ? 'border-2 border-rose-500 bg-rose-50 text-rose-900 focus:ring-2 focus:ring-rose-500'
                                  : 'border-2 border-indigo-200 text-slate-950 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-700'
                              }`}
                              title={
                                isInvalidScratchEnd
                                  ? `Σφάλμα: Στα Σκρατς το # Τελικό (${row.endNo}) δεν μπορεί να είναι μικρότερο από το # Αρχικό (${row.startNo || '000'}). Κλειδώνει σε ≥ ${row.startNo || '000'}.`
                                  : !isLottery
                                  ? `Στα Σκρατς το # Τελικό πρέπει να είναι ≥ ${startNum}`
                                  : undefined
                              }
                            />
                            {isInvalidScratchEnd && (
                              <span className="text-[10px] font-extrabold text-rose-600 block mt-0.5 whitespace-nowrap">
                                Τελικό &lt; Αρχικό
                              </span>
                            )}
                            {frontQty > 0 && !isInvalidScratchEnd && (
                              <span className="text-[10px] font-bold text-indigo-500 block mt-0.5">{frontQty} τμχ</span>
                            )}
                            </div>
                          )}
                        </td>

                        {/* Πίσω - Αρχικό (User-editable, mirrors Μπροστά-Τελικό) */}
                        <td className="p-2 text-center bg-purple-50/20">
                          {!rowHasBackSide ? (
                            <span className="text-slate-300 text-xs">—</span>
                          ) : (
                            <div className="relative inline-block w-full max-w-[100px]">
                              <input
                                type="text"
                                inputMode="numeric"
                                disabled={!canEditBackStart}
                                value={row.backStartNo || ''}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => handleTicketNumberChange(row.id, 'backStartNo', e.target.value, row.backStartNo || '')}
                                onBlur={() => {
                                  if (backStartNum !== null && backEndNum !== null && backStartNum > backEndNum) {
                                    handleUpdateRow(row.id, 'backStartNo', row.backEndNo || '000');
                                  }
                                }}
                                placeholder="---"
                                className={`w-full text-center px-2 py-1.5 rounded-lg text-xs font-mono font-black shadow-2xs transition-colors ${
                                  isInvalidBackStart || hasCrossingError
                                    ? 'border-2 border-rose-500 bg-rose-50 text-rose-900 focus:ring-2 focus:ring-rose-500'
                                    : 'border-2 border-purple-200 text-slate-950 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-100 disabled:text-slate-700'
                                }`}
                                title={
                                  isInvalidBackStart
                                    ? `Σφάλμα: Το Πίσω - Αρχικό (${row.backStartNo}) δεν μπορεί να είναι μεγαλύτερο από το Πίσω - Τελικό (${row.backEndNo}).`
                                    : 'Πώληση από το τέλος του πακέτου'
                                }
                              />
                              {isInvalidBackStart && (
                                <span className="text-[10px] font-extrabold text-rose-600 block mt-0.5 whitespace-nowrap">
                                  Αρχικό &gt; Τελικό
                                </span>
                              )}
                              {backQty > 0 && !isInvalidBackStart && (
                                <span className="text-[10px] font-bold text-purple-500 block mt-0.5">{backQty} τμχ</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Πίσω - Τελικό (Locked for regular employee, editable by Owner/Admin when override active) */}
                        <td className="p-2 text-center bg-purple-50/20">
                          {!rowHasBackSide ? (
                            <span className="text-slate-300 text-xs">—</span>
                          ) : (
                            <div className="relative inline-block w-full max-w-[100px]">
                              <input
                                type="text"
                                inputMode="numeric"
                                disabled={!canEditBackEnd}
                                value={row.backEndNo || ''}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => handleTicketNumberChange(row.id, 'backEndNo', e.target.value, row.backEndNo || '')}
                                placeholder="---"
                                className={`w-full text-center px-2 py-1.5 rounded-lg text-xs font-mono font-black shadow-2xs transition-colors ${
                                  canEditBackEnd
                                    ? 'bg-amber-50 text-amber-950 border-2 border-amber-400 focus:ring-2 focus:ring-amber-500'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200 cursor-not-allowed opacity-90'
                                }`}
                                title={
                                  canEditBackEnd
                                    ? 'Διαχειριστής: Μπορείτε να ορίσετε νέο τελικό νούμερο για την πίσω πλευρά'
                                    : 'Κλειδωμένο: Αυτόματη μεταφορά από την προηγούμενη βάρδια'
                                }
                              />
                              {!canEditBackEnd && (
                                <div className="absolute right-1.5 top-2.5 pointer-events-none text-slate-400">
                                  <Lock className="w-3 h-3" />
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Combined Quantity (Μπροστά + Πίσω) */}
                        <td className="p-2 text-center border-l border-slate-200">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black font-mono shadow-2xs ${
                              totalQty > 0
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                            title={rowHasBackSide ? `Μπροστά: ${frontQty} τμχ • Πίσω: ${backQty} τμχ` : undefined}
                          >
                            {totalQty}
                          </span>
                        </td>

                        {/* Combined Value */}
                        <td className="p-2 text-right font-black font-mono text-xs">
                          <span className={total > 0 ? 'text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 shadow-2xs' : 'text-slate-500'}>
                            {formatCurrency(total)}
                          </span>
                        </td>

                        {/* Actions (Manager features) */}
                        {!readOnly && canManage && (
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              {/* Open New Pack button - sets both locked baselines (Μπροστά-Αρχικό, Πίσω-Τελικό), Owner/Admin only */}
                              {canEditLockedFields && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewPackModalRowId(row.id);
                                    setNewPackStartNo('0');
                                    const maxNo = getPackageMaxNumber(row.price);
                                    setNewPackBackEndNo(maxNo === null ? '' : formatTicketNumber(maxNo));
                                  }}
                                  className="p-1.5 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 transition-colors cursor-pointer"
                                  title="Άνοιγμα Νέου Πακέτου (ορισμός Μπροστά-Αρχικό και Πίσω-Τελικό)"
                                  aria-label="Άνοιγμα Νέου Πακέτου"
                                >
                                  <PackagePlus className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() => setEditingRowId(null)}
                                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-1.5 py-1 cursor-pointer"
                                >
                                  OK
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setRowToRemove(row.id)}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 cursor-pointer"
                                title="Διαγραφή παιχνιδιού"
                                aria-label="Διαγραφή παιχνιδιού"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {isEditing && isLottery && canEditLockedFields && (
                        <tr>
                          <td colSpan={readOnly || !canManage ? 8 : 9} className="px-3 pb-3 pt-0">
                            <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-lg space-y-2.5">
                              <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">
                                Ρυθμίσεις Πώλησης Λαχείου
                              </p>
                              <div className="flex flex-wrap items-center gap-4">
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isBundleTracked}
                                    onChange={(e) => handleToggleBundleTracking(row.id, e.target.checked)}
                                    className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                                  />
                                  <span>Πώληση σε πεντάδες + κομμάτια</span>
                                </label>
                                {isBundleTracked && (
                                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <span>Τεμάχια ανά πεντάδα:</span>
                                    <input
                                      type="number"
                                      min={2}
                                      value={rowBundleSize}
                                      onChange={(e) => handleSetBundleSize(row.id, Math.max(2, parseInt(e.target.value, 10) || 5))}
                                      className="w-14 px-1.5 py-0.5 text-center border border-indigo-300 rounded text-xs font-mono font-bold"
                                    />
                                  </label>
                                )}
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={rowHasBackSide}
                                    onChange={(e) => handleToggleBackSide(row.id, e.target.checked)}
                                    className="w-3.5 h-3.5 accent-purple-600 cursor-pointer"
                                  />
                                  <span>Πώληση και από Πίσω πλευρά</span>
                                </label>
                              </div>
                              {isBundleTracked && (
                                <p className="text-[10px] text-slate-500">
                                  Τιμή ανά κομμάτι: {formatCurrency(row.price)} · Τιμή ανά πεντάδα: {formatCurrency((Number(row.price) || 0) * rowBundleSize)}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      {rowErrors.length > 0 && (
                        <tr>
                          <td colSpan={readOnly || !canManage ? 8 : 9} className="px-3 pb-2 pt-0">
                            <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 space-y-0.5">
                              {rowErrors.map((err, i) => (
                                <p key={i} className="flex items-start space-x-1.5">
                                  <AlertCircle className="w-3 h-3 text-rose-600 shrink-0 mt-0.5" />
                                  <span>{err}</span>
                                </p>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New Pack Modal for Managers */}
      {newPackModalRowId && (() => {
        const targetRow = rows.find((r) => r.id === newPackModalRowId);
        const targetIsBundleTracked = targetRow ? isBundleTrackedRow(targetRow) : false;
        const targetHasBackSide = targetRow ? hasBackSide(targetRow) : false;
        return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setNewPackModalRowId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-2 text-indigo-900 border-b border-slate-100 pb-3">
              <PackagePlus className="w-5 h-5 text-indigo-600" />
              <h4 className="font-extrabold text-sm">Άνοιγμα Νέου Πακέτου{targetIsBundleTracked ? '' : ' Σκρατς'}</h4>
            </div>

            <p className="text-xs text-slate-600">
              {targetIsBundleTracked
                ? 'Το προηγούμενο απόθεμα ολοκληρώθηκε. Ορίστε το αρχικό σύνολο του νέου αποθέματος:'
                : 'Το προηγούμενο πακέτο ολοκληρώθηκε. Ορίστε τα δύο κλειδωμένα σημεία εκκίνησης του νέου πακέτου - ένα για κάθε κατεύθυνση πώλησης:'}
            </p>

            <div>
              <label className="text-[11px] font-bold text-indigo-700 uppercase block mb-1">
                {targetIsBundleTracked ? 'Αρχικό σύνολο κομματιών:' : 'Μπροστά - Αρχικό (πώληση από την αρχή):'}
              </label>
              <input
                type="number"
                min="0"
                value={newPackStartNo}
                onChange={(e) => setNewPackStartNo(e.target.value)}
                className="w-full px-3 py-2 border-2 border-indigo-300 rounded-xl font-mono font-black text-center text-base focus:ring-2 focus:ring-indigo-500"
                placeholder="0"
                autoFocus
              />
              {targetIsBundleTracked && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Η τιμή καταχωρίζεται αποκλειστικά σε μεμονωμένα κομμάτια{' '}
                  {(() => {
                    const n = parseNonNegativeInt(newPackStartNo).value;
                    const split = splitPiecesIntoBundles(n, targetRow?.bundleSize || 5);
                    return n > 0 ? `(≈ ${split.bundles} πεντάδες + ${split.pieces} κομμάτια)` : '';
                  })()}
                </p>
              )}
            </div>

            {targetHasBackSide && (
              <div>
                <label className="text-[11px] font-bold text-purple-700 uppercase block mb-1">
                  Πίσω - Τελικό (πώληση από το τέλος):
                </label>
                <input
                  type="number"
                  min="0"
                  value={newPackBackEndNo}
                  onChange={(e) => setNewPackBackEndNo(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-purple-300 rounded-xl font-mono font-black text-center text-base focus:ring-2 focus:ring-purple-500"
                  placeholder="π.χ. 299"
                />
                <p className="text-[10px] text-slate-500 mt-1">Προτεινόμενο: ο μέγιστος αριθμός του πακέτου για την τιμή αυτή. Μπορείτε να το αλλάξετε.</p>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setNewPackModalRowId(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={() => handleApplyNewPack(newPackModalRowId)}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center space-x-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Εφαρμογή Νέου Πακέτου</span>
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Reset-All Confirmation Modal */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Καθαρισμός Όλων των Τελικών</h4>
            </div>
            <p className="text-xs text-slate-600">
              Αυτό θα διαγράψει το Μπροστά-Τελικό και το Πίσω-Αρχικό (τις μετρήσεις πωλήσεων της βάρδιας) από{' '}
              <strong>όλα</strong> τα παιχνίδια του πίνακα ταυτόχρονα. Η ενέργεια δεν αναιρείται.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ναι, Καθαρισμός Όλων</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Row Confirmation Modal */}
      {rowToRemove && (() => {
        const targetRow = rows.find((r) => r.id === rowToRemove);
        return (
          <div
            className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
            onClick={() => setRowToRemove(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center space-x-3 text-rose-600">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <h4 className="text-base font-extrabold text-slate-900">Διαγραφή Παιχνιδιού</h4>
              </div>
              <p className="text-xs text-slate-600">
                Θέλετε να διαγράψετε το «{targetRow?.name}» από τον πίνακα; Τυχόν καταχωρημένες τιμές αυτού του παιχνιδιού για τη βάρδια θα χαθούν.
              </p>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRowToRemove(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveRow(rowToRemove)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Ναι, Διαγραφή</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Footer Summary Card */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 flex items-center justify-between text-xs flex-wrap gap-2">
        <div className="flex items-center space-x-3 text-indigo-900 flex-wrap gap-y-1">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-bold">
              Σύνολο Πωληθέντων Τεμαχίων: <span className="font-black text-indigo-900 font-mono">{totalTicketsSold} τμχ</span>
            </span>
          </div>
          {scratchPieces > 0 && lotteryPieces > 0 && (
            <span className="text-slate-600 font-mono text-[11px]">
              (Σκρατς: {scratchPieces} τμχ • Λαχεία: {lotteryPieces} τμχ)
            </span>
          )}
          {(scratchFrontPieces > 0 || scratchBackPieces > 0) && (
            <span className="text-[11px] font-mono flex items-center gap-1.5">
              <span className="text-indigo-700 font-bold">Μπροστά: {scratchFrontPieces} τμχ</span>
              <span className="text-slate-300">•</span>
              <span className="text-purple-700 font-bold">Πίσω: {scratchBackPieces} τμχ</span>
            </span>
          )}
        </div>
        <div className="text-right flex items-center space-x-2">
          <span className="text-[11px] text-slate-600 font-semibold">Σύνολο Αξίας Πωλήσεων Σκρατς & Λαχείων:</span>
          <span className="text-sm font-black text-emerald-700 font-mono bg-white px-3 py-1 rounded-lg border border-emerald-200 shadow-2xs">
            {formatCurrency(grandTotalSales)}
          </span>
        </div>
      </div>
    </div>
  );
};

