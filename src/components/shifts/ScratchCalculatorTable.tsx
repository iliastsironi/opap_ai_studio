import React from 'react';
import { Plus, Trash2, RotateCcw, Sparkles, Hash, Edit2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export interface ScratchTicketRow {
  id: string;
  name: string;
  category?: string;
  price: number;
  startNo: string;
  endNo: string;
  manualQty?: string;
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

export function calculateRowQty(row: ScratchTicketRow): number {
  if (row.manualQty !== undefined && row.manualQty !== '') {
    const q = parseInt(row.manualQty, 10);
    return isNaN(q) || q < 0 ? 0 : q;
  }

  if (row.startNo.trim() === '' || row.endNo.trim() === '') {
    return 0;
  }

  const start = parseInt(row.startNo, 10);
  const end = parseInt(row.endNo, 10);

  if (isNaN(start) || isNaN(end)) {
    return 0;
  }

  if (end >= start) {
    return end - start;
  } else {
    // If end < start (e.g. rollover range)
    return Math.abs(start - end);
  }
}

export function calculateRowTotal(row: ScratchTicketRow): number {
  const qty = calculateRowQty(row);
  return qty * (row.price || 0);
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

  const [editingRowId, setEditingRowId] = React.useState<string | null>(null);

  const handleUpdateRow = (id: string, field: keyof ScratchTicketRow, value: any) => {
    if (readOnly) return;
    const updated = rows.map((r) => (r.id === id ? { ...r, [field]: value } : r));
    onChangeRows(updated);
  };

  const handleAddRow = (categoryName = 'Σκρατς 5€') => {
    if (readOnly) return;
    const newRow: ScratchTicketRow = {
      id: `custom_scr_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: 'Νέο Παιχνίδι',
      category: categoryName,
      price: 5,
      startNo: '',
      endNo: '',
    };
    onChangeRows([...rows, newRow]);
    setEditingRowId(newRow.id);
  };

  const handleRemoveRow = (id: string) => {
    if (readOnly) return;
    onChangeRows(rows.filter((r) => r.id !== id));
  };

  const handleReset = () => {
    if (readOnly) return;
    const reset = rows.map((r) => ({ ...r, startNo: '', endNo: '', manualQty: '' }));
    onChangeRows(reset);
  };

  const grandTotalSales = rows.reduce((acc, r) => acc + calculateRowTotal(r), 0);
  const totalTicketsSold = rows.reduce((acc, r) => acc + calculateRowQty(r), 0);

  // Group rows by category
  const categories = Array.from(
    new Set(rows.map((r) => r.category || 'Άλλα Σκρατς'))
  );

  return (
    <div className="space-y-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
            <Hash className="w-4 h-4 text-indigo-600" />
            <span>Έλληνικά Λαχεία & Σκρατς (#Αρχικό - #Τελικό Νούμερο)</span>
            {canManage && (
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-indigo-600" />
                Διαχειριστής (Προσθήκη/Αφαίρεση)
              </span>
            )}
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Εισάγετε το αρχικό & τελικό νούμερο βάρδιας για να υπολογιστούν αυτόματα οι πωλήσεις και η αξία.
          </p>
        </div>

        {!readOnly && (
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all flex items-center space-x-1"
              title="Καθαρισμός αριθμών"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Καθαρισμός</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddRow()}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs transition-all flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Προσθήκη Παιχνιδιού</span>
            </button>
          </div>
        )}
      </div>

      {/* Table grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-extrabold uppercase tracking-wider text-[10px]">
              <th className="p-2.5 min-w-[150px]">Παιχνίδι / Κωδικός</th>
              <th className="p-2.5 w-20 text-right">Τιμή (€)</th>
              <th className="p-2.5 w-28 text-center"># Αρχικό</th>
              <th className="p-2.5 w-28 text-center"># Τελικό</th>
              <th className="p-2.5 w-24 text-center">Πωλήσεις (Τμχ)</th>
              <th className="p-2.5 w-28 text-right">Αξία (€)</th>
              {!readOnly && <th className="p-2.5 w-12 text-center"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {categories.map((cat) => {
              const catRows = rows.filter((r) => (r.category || 'Άλλα Σκρατς') === cat);
              const catTotal = catRows.reduce((acc, r) => acc + calculateRowTotal(r), 0);
              const catQty = catRows.reduce((acc, r) => acc + calculateRowQty(r), 0);

              return (
                <React.Fragment key={cat}>
                  {/* Category Header Row */}
                  <tr className="bg-slate-50/90 border-t border-b border-slate-200">
                    <td colSpan={readOnly ? 6 : 7} className="px-3 py-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-800 text-xs tracking-wide uppercase flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block"></span>
                          {cat}
                        </span>
                        {catQty > 0 && (
                          <span className="text-[11px] font-bold text-slate-600 font-mono">
                            {catQty} τμχ • <span className="text-emerald-700 font-black">{catTotal.toFixed(2)} €</span>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Category Items */}
                  {catRows.map((row) => {
                    const qty = calculateRowQty(row);
                    const total = calculateRowTotal(row);
                    const isEditing = editingRowId === row.id;

                    return (
                      <tr key={row.id} className="hover:bg-indigo-50/30 transition-colors">
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
                              <span>{row.name}</span>
                              {!readOnly && canManage && (
                                <button
                                  type="button"
                                  onClick={() => setEditingRowId(row.id)}
                                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity p-0.5"
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
                              className="w-16 px-1.5 py-1 text-right border border-indigo-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            <span className="font-bold text-slate-700 font-mono">
                              {row.price.toFixed(2)} €
                            </span>
                          )}
                        </td>

                        {/* Start Number */}
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            disabled={readOnly}
                            value={row.startNo}
                            onChange={(e) => handleUpdateRow(row.id, 'startNo', e.target.value)}
                            placeholder="000"
                            className="w-full max-w-[85px] mx-auto text-center px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                          />
                        </td>

                        {/* End Number */}
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            disabled={readOnly}
                            value={row.endNo}
                            onChange={(e) => handleUpdateRow(row.id, 'endNo', e.target.value)}
                            placeholder="000"
                            className="w-full max-w-[85px] mx-auto text-center px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                          />
                        </td>

                        {/* Calculated Quantity */}
                        <td className="p-2 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-xs font-black font-mono ${
                              qty > 0
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {qty}
                          </span>
                        </td>

                        {/* Calculated Row Total */}
                        <td className="p-2 text-right font-black font-mono text-xs">
                          <span className={total > 0 ? 'text-emerald-700' : 'text-slate-400'}>
                            {total > 0 ? `${total.toFixed(2)} €` : '- €'}
                          </span>
                        </td>

                        {/* Actions */}
                        {!readOnly && (
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() => setEditingRowId(null)}
                                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-1 py-0.5"
                                >
                                  OK
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(row.id)}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                title="Διαγραφή παιχνιδιού"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Summary Card */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 flex items-center justify-between text-xs flex-wrap gap-2">
        <div className="flex items-center space-x-2 text-indigo-900">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="font-bold">
            Σύνολο Πωληθέντων: <span className="font-black text-indigo-800 font-mono">{totalTicketsSold} τεμάχια</span>
          </span>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-slate-600 font-semibold mr-2">Σύνολο Αξίας Πωλήσεων:</span>
          <span className="text-sm font-black text-emerald-700 font-mono bg-white px-3 py-1 rounded-lg border border-emerald-200">
            {grandTotalSales.toFixed(2)} €
          </span>
        </div>
      </div>
    </div>
  );
};
