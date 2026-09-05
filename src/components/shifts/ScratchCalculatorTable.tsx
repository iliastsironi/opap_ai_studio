import React, { useState } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatCurrency } from '../../lib/formatters.ts';

export interface ScratchTicketRow {
  id: string;
  name: string;
  category?: string;
  price: number;
  startNo: string; // Μπροστά - Αρχικό (locked, Owner/Admin only)
  endNo: string; // Μπροστά - Τελικό (User-editable)
  backStartNo?: string; // Πίσω - Αρχικό (User-editable)
  backEndNo?: string; // Πίσω - Τελικό (locked, Owner/Admin only)
  manualQty?: string;
  isNewPack?: boolean;
  packCode?: string;
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
  { id: 'scr_laiko', name: 'Λαϊκό Λαχείο', category: 'Λαχεία', price: 10, startNo: '', endNo: '' },
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
        // Merge with defaults in case defaults have keys not present
        const merged = [...parsed];
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
      });
    } else {
      result.push({ ...base, endNo: '', backEndNo: base.backEndNo || suggestedBackEnd(base.price), backStartNo: '' });
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
// Lottery rows don't have a defined back side (no fixed package size).
export function calculateBackRowQty(row: ScratchTicketRow): number {
  if (isLotteryRow(row)) return 0;

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
  const [newPackModalRowId, setNewPackModalRowId] = useState<string | null>(null);
  const [newPackStartNo, setNewPackStartNo] = useState<string>('0');
  const [newPackBackEndNo, setNewPackBackEndNo] = useState<string>('');

  const handleUpdateRow = (id: string, field: keyof ScratchTicketRow, value: any) => {
    if (readOnly) return;
    const updated = rows.map((r) => (r.id === id ? { ...r, [field]: value } : r));
    onChangeRows(updated);
    if (field === 'name' || field === 'price' || field === 'category') {
      saveScratchCatalog(updated);
    }
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
  };

  const handleReset = () => {
    if (readOnly) return;
    const reset = rows.map((r) => ({ ...r, endNo: '', backStartNo: '', manualQty: '' }));
    onChangeRows(reset);
  };

  // calculateCombinedRowQty (front+back) here, not calculateRowQty (front
  // only) - keeps "pieces sold" and "value sold" consistent with each other
  // and with calculateRowTotal, which already includes both sides.
  const scratchPieces = rows.filter((r) => !isLotteryRow(r)).reduce((acc, r) => acc + calculateCombinedRowQty(r), 0);
  const scratchFrontPieces = rows.filter((r) => !isLotteryRow(r)).reduce((acc, r) => acc + calculateRowQty(r), 0);
  const scratchBackPieces = rows.filter((r) => !isLotteryRow(r)).reduce((acc, r) => acc + calculateBackRowQty(r), 0);
  const scratchSales = rows.filter((r) => !isLotteryRow(r)).reduce((acc, r) => acc + calculateRowTotal(r), 0);
  const lotteryPieces = rows.filter((r) => isLotteryRow(r)).reduce((acc, r) => acc + calculateRowQty(r), 0);
  const lotterySales = rows.filter((r) => isLotteryRow(r)).reduce((acc, r) => acc + calculateRowTotal(r), 0);
  const totalTicketsSold = scratchPieces + lotteryPieces;
  const grandTotalSales = scratchSales + lotterySales;
  const rowValidationErrors = new Map<string, string[]>();
  for (const r of rows) {
    const { errors } = validateScratchRow(r);
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
              onClick={handleReset}
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

      {/* Info notice about scratch vs lotteries calculation rules */}
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

      {/* Table grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-extrabold uppercase tracking-wider text-[10px]">
              <th className="p-2.5 min-w-[150px]" rowSpan={2}>Παιχνίδι / Κωδικός</th>
              <th className="p-2.5 w-16 text-right" rowSpan={2}>Τιμή (€)</th>
              <th className="p-2 text-center bg-indigo-50/70 border-l border-indigo-100" colSpan={2}>
                <span className="text-indigo-700">Μπροστά</span>
                <span className="block text-[9px] font-medium normal-case text-indigo-500/80 tracking-normal mt-0.5">Πώληση από την αρχή του πακέτου</span>
              </th>
              <th className="p-2 text-center bg-purple-50/70 border-l border-purple-100" colSpan={2}>
                <span className="text-purple-700">Πίσω</span>
                <span className="block text-[9px] font-medium normal-case text-purple-500/80 tracking-normal mt-0.5">Πώληση από το τέλος του πακέτου</span>
              </th>
              <th className="p-2.5 w-24 text-center border-l border-slate-200" colSpan={2}>Σύνολο</th>
              {!readOnly && canManage && <th className="p-2.5 w-20 text-center" rowSpan={2}>Ενέργειες</th>}
            </tr>
            <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-extrabold uppercase tracking-wider text-[10px]">
              <th className="p-2 w-28 text-center bg-indigo-50/40">
                <div className="flex items-center justify-center space-x-1">
                  <span>Αρχικό</span>
                  {!canEditLockedFields || !managerOverrideEnabled ? (
                    <span title="Κλειδωμένο - μόνο Owner/Admin (αυτόματη μεταφορά από προηγούμενη βάρδια)">
                      <Lock className="w-3 h-3 text-slate-400" />
                    </span>
                  ) : null}
                </div>
              </th>
              <th className="p-2 w-28 text-center bg-indigo-50/40">Τελικό</th>
              <th className="p-2 w-28 text-center bg-purple-50/40">Αρχικό</th>
              <th className="p-2 w-28 text-center bg-purple-50/40">
                <div className="flex items-center justify-center space-x-1">
                  <span>Τελικό</span>
                  {!canEditLockedFields || !managerOverrideEnabled ? (
                    <span title="Κλειδωμένο - μόνο Owner/Admin">
                      <Lock className="w-3 h-3 text-slate-400" />
                    </span>
                  ) : null}
                </div>
              </th>
              <th className="p-2 w-20 text-center border-l border-slate-200">Τμχ</th>
              <th className="p-2 w-24 text-right">Αξία (€)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {categories.map((cat) => {
              const catRows = rows.filter((r) => (r.category || 'Άλλα Σκρατς') === cat);
              const catTotal = catRows.reduce((acc, r) => acc + calculateRowTotal(r), 0);
              const catQty = catRows.reduce((acc, r) => acc + calculateRowQty(r), 0);
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
                    const frontQty = calculateRowQty(row);
                    const backQty = calculateBackRowQty(row);
                    const totalQty = frontQty + backQty;
                    const total = calculateRowTotal(row);
                    const isEditing = editingRowId === row.id;
                    const canEditStart = !readOnly && canEditLockedFields && managerOverrideEnabled;
                    const canEditBackEnd = !readOnly && canEditLockedFields && managerOverrideEnabled;
                    const canEditBackStart = !readOnly && !isLottery;
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
                                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity p-0.5 cursor-pointer"
                                  title="Επεξεργασία ονόματος/τιμής"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Price */}
                        <td className="p-2 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.5"
                              value={row.price}
                              onChange={(e) =>
                                handleUpdateRow(row.id, 'price', parseFloat(e.target.value) || 0)
                              }
                              className="w-16 px-1.5 py-1 text-right border border-indigo-300 rounded-lg text-xs font-black text-slate-950 bg-white focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            <span className="font-extrabold text-slate-900 font-mono text-xs">
                              {formatCurrency(row.price)}
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
                                canEditStart
                                  ? 'Διαχειριστής: Μπορείτε να ορίσετε νέο αρχικό νούμερο'
                                  : 'Κλειδωμένο: Αυτόματη μεταφορά από την προηγούμενη βάρδια'
                              }
                            />
                            {!canEditStart && (
                              <div className="absolute right-1.5 top-2.5 pointer-events-none text-slate-400">
                                <Lock className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Μπροστά - Τελικό (User-editable at shift close - locked to >= startNo for Scratch) */}
                        <td className="p-2 text-center bg-indigo-50/20">
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
                              <span className="text-[9px] font-extrabold text-rose-600 block mt-0.5 whitespace-nowrap">
                                Τελικό &lt; Αρχικό
                              </span>
                            )}
                            {frontQty > 0 && !isInvalidScratchEnd && (
                              <span className="text-[9px] font-bold text-indigo-500 block mt-0.5">{frontQty} τμχ</span>
                            )}
                          </div>
                        </td>

                        {/* Πίσω - Αρχικό (User-editable, mirrors Μπροστά-Τελικό) */}
                        <td className="p-2 text-center bg-purple-50/20">
                          {isLottery ? (
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
                                <span className="text-[9px] font-extrabold text-rose-600 block mt-0.5 whitespace-nowrap">
                                  Αρχικό &gt; Τελικό
                                </span>
                              )}
                              {backQty > 0 && !isInvalidBackStart && (
                                <span className="text-[9px] font-bold text-purple-500 block mt-0.5">{backQty} τμχ</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Πίσω - Τελικό (Locked for regular employee, editable by Owner/Admin when override active) */}
                        <td className="p-2 text-center bg-purple-50/20">
                          {isLottery ? (
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
                            title={!isLottery ? `Μπροστά: ${frontQty} τμχ • Πίσω: ${backQty} τμχ` : undefined}
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
                            <div className="flex items-center justify-center space-x-1">
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
                                  className="p-1 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 transition-colors cursor-pointer"
                                  title="Άνοιγμα Νέου Πακέτου (ορισμός Μπροστά-Αρχικό και Πίσω-Τελικό)"
                                >
                                  <PackagePlus className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() => setEditingRowId(null)}
                                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-1 py-0.5 cursor-pointer"
                                >
                                  OK
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleRemoveRow(row.id)}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                                title="Διαγραφή παιχνιδιού"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
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
      {newPackModalRowId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 border border-slate-200 space-y-4">
            <div className="flex items-center space-x-2 text-indigo-900 border-b border-slate-100 pb-3">
              <PackagePlus className="w-5 h-5 text-indigo-600" />
              <h4 className="font-extrabold text-sm">Άνοιγμα Νέου Πακέτου Σκρατς</h4>
            </div>

            <p className="text-xs text-slate-600">
              Το προηγούμενο πακέτο ολοκληρώθηκε. Ορίστε τα δύο κλειδωμένα σημεία εκκίνησης του νέου πακέτου - ένα για κάθε κατεύθυνση πώλησης:
            </p>

            <div>
              <label className="text-[11px] font-bold text-indigo-700 uppercase block mb-1">
                Μπροστά - Αρχικό (πώληση από την αρχή):
              </label>
              <input
                type="number"
                value={newPackStartNo}
                onChange={(e) => setNewPackStartNo(e.target.value)}
                className="w-full px-3 py-2 border-2 border-indigo-300 rounded-xl font-mono font-black text-center text-base focus:ring-2 focus:ring-indigo-500"
                placeholder="0"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-purple-700 uppercase block mb-1">
                Πίσω - Τελικό (πώληση από το τέλος):
              </label>
              <input
                type="number"
                value={newPackBackEndNo}
                onChange={(e) => setNewPackBackEndNo(e.target.value)}
                className="w-full px-3 py-2 border-2 border-purple-300 rounded-xl font-mono font-black text-center text-base focus:ring-2 focus:ring-purple-500"
                placeholder="π.χ. 299"
              />
              <p className="text-[10px] text-slate-500 mt-1">Προτεινόμενο: ο μέγιστος αριθμός του πακέτου για την τιμή αυτή. Μπορείτε να το αλλάξετε.</p>
            </div>

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
      )}

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

