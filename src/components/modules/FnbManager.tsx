import React, { useState, useEffect } from 'react';
import { Coffee, DollarSign, CreditCard, ShoppingBag, Plus, X, Trash2, Clock, RefreshCw, Edit3 } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchFnbFromFirestore, createFnbInFirestore, deleteFnbInFirestore, FnbRecord } from '../../services/moduleServices.ts';
import { fetchActiveShiftFromFirestore, updateShiftInFirestore } from '../../services/shiftService.ts';
import { Shift } from '../../types/index.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { formatCurrency } from '../../lib/formatters.ts';

export const FnbManager: React.FC = () => {
  const { selectedStoreId, stores } = useTenant();
  const { user, organization } = useAuth();
  const [fnbSales, setFnbSales] = useState<FnbRecord[]>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);

  // New Sale Modal
  const [showModal, setShowModal] = useState(false);
  const [targetStoreId, setTargetStoreId] = useState(stores[0]?.id || 'store_opap_01');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [submitting, setSubmitting] = useState(false);

  // Shift FnB Adjust Modal
  const [showShiftAdjustModal, setShowShiftAdjustModal] = useState(false);
  const [shiftFnbCashInput, setShiftFnbCashInput] = useState('');
  const [shiftFnbCardInput, setShiftFnbCardInput] = useState('');
  const [adjustingShift, setAdjustingShift] = useState(false);

  // Delete Sale Confirmation
  const [saleToDelete, setSaleToDelete] = useState<FnbRecord | null>(null);
  const [isDeletingSale, setIsDeletingSale] = useState(false);

  const orgId = organization?.id || 'org_opap_demo';

  const loadFnbSales = async () => {
    setLoading(true);
    try {
      const data = await fetchFnbFromFirestore(orgId, selectedStoreId);
      setFnbSales(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveShift = async () => {
    const sId = selectedStoreId && selectedStoreId !== 'ALL' ? selectedStoreId : stores[0]?.id;
    if (!sId) return;
    try {
      const shift = await fetchActiveShiftFromFirestore(orgId, sId);
      setActiveShift(shift);
      if (shift) {
        setShiftFnbCashInput(String(shift.fnb_cash || '0'));
        setShiftFnbCardInput(String(shift.fnb_card || '0'));
      }
    } catch (e) {
      console.warn('Could not load active shift for FnB', e);
    }
  };

  useEffect(() => {
    loadFnbSales();
    loadActiveShift();
  }, [selectedStoreId, orgId]);

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(quantity, 10) || 1;
    const price = parseFloat(unitPrice) || 0;
    if (!itemName || price <= 0) return;

    setSubmitting(true);
    try {
      const totalPrice = qty * price;
      await createFnbInFirestore({
        organization_id: orgId,
        store_id: targetStoreId,
        item_name: itemName,
        quantity: qty,
        unit_price: price,
        total_price: totalPrice,
        payment_method: paymentMethod,
        server_name: user ? `${user.first_name} ${user.last_name}` : 'Υπάλληλος',
      });

      // Synchronize directly with active shift
      const currentShift = await fetchActiveShiftFromFirestore(orgId, targetStoreId);
      if (currentShift) {
        const prevSales = Number(currentShift.fnb_sales) || 0;
        const prevCash = Number(currentShift.fnb_cash) || 0;
        const prevCard = Number(currentShift.fnb_card) || 0;

        const updatedSales = prevSales + totalPrice;
        const updatedCash = paymentMethod === 'CASH' ? prevCash + totalPrice : prevCash;
        const updatedCard = paymentMethod === 'CARD' ? prevCard + totalPrice : prevCard;

        await updateShiftInFirestore(currentShift.id, {
          fnb_sales: updatedSales,
          fnb_cash: updatedCash,
          fnb_card: updatedCard,
        });

        if (typeof window !== 'undefined') {
          try {
            const draftKey = `shift_draft_${currentShift.id}`;
            const rawDraft = localStorage.getItem(draftKey);
            if (rawDraft) {
              const parsed = JSON.parse(rawDraft);
              parsed.fnb_sales = updatedSales;
              parsed.fnb_cash = updatedCash;
              parsed.fnb_card = updatedCard;
              localStorage.setItem(draftKey, JSON.stringify(parsed));
            }
          } catch (err) {
            // ignore
          }
        }
      }

      await loadFnbSales();
      await loadActiveShift();
      setShowModal(false);
      setItemName('');
      setQuantity('1');
      setUnitPrice('');
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSale = async () => {
    if (!saleToDelete) return;
    const sale = saleToDelete;
    setIsDeletingSale(true);
    try {
      await deleteFnbInFirestore(sale.id);

      // Adjust active shift
      if (activeShift && activeShift.store_id === sale.store_id) {
        const prevSales = Number(activeShift.fnb_sales) || 0;
        const prevCash = Number(activeShift.fnb_cash) || 0;
        const prevCard = Number(activeShift.fnb_card) || 0;

        const updatedSales = Math.max(0, prevSales - sale.total_price);
        const updatedCash = sale.payment_method === 'CASH' ? Math.max(0, prevCash - sale.total_price) : prevCash;
        const updatedCard = sale.payment_method === 'CARD' ? Math.max(0, prevCard - sale.total_price) : prevCard;

        await updateShiftInFirestore(activeShift.id, {
          fnb_sales: updatedSales,
          fnb_cash: updatedCash,
          fnb_card: updatedCard,
        });

        if (typeof window !== 'undefined') {
          try {
            const draftKey = `shift_draft_${activeShift.id}`;
            const rawDraft = localStorage.getItem(draftKey);
            if (rawDraft) {
              const parsed = JSON.parse(rawDraft);
              parsed.fnb_sales = updatedSales;
              parsed.fnb_cash = updatedCash;
              parsed.fnb_card = updatedCard;
              localStorage.setItem(draftKey, JSON.stringify(parsed));
            }
          } catch (e) {
            // ignore
          }
        }
      }

      await loadFnbSales();
      await loadActiveShift();
      setSaleToDelete(null);
    } catch (err) {
      console.error('Error deleting FnB sale:', err);
    } finally {
      setIsDeletingSale(false);
    }
  };

  const handleSaveShiftFnbAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    setAdjustingShift(true);
    try {
      const cashVal = parseFloat(shiftFnbCashInput) || 0;
      const cardVal = parseFloat(shiftFnbCardInput) || 0;
      const totalVal = cashVal + cardVal;

      await updateShiftInFirestore(activeShift.id, {
        fnb_cash: cashVal,
        fnb_card: cardVal,
        fnb_sales: totalVal,
      });

      if (typeof window !== 'undefined') {
        try {
          const draftKey = `shift_draft_${activeShift.id}`;
          const rawDraft = localStorage.getItem(draftKey);
          if (rawDraft) {
            const parsed = JSON.parse(rawDraft);
            parsed.fnb_cash = cashVal;
            parsed.fnb_card = cardVal;
            parsed.fnb_sales = totalVal;
            localStorage.setItem(draftKey, JSON.stringify(parsed));
          }
        } catch (e) {
          // ignore
        }
      }

      await loadActiveShift();
      setShowShiftAdjustModal(false);
    } catch (err) {
      console.error('Error adjusting shift FnB:', err);
    } finally {
      setAdjustingShift(false);
    }
  };

  const cashSales = fnbSales
    .filter((s) => s.payment_method === 'CASH')
    .reduce((sum, s) => sum + s.total_price, 0);

  const cardSales = fnbSales
    .filter((s) => s.payment_method === 'CARD')
    .reduce((sum, s) => sum + s.total_price, 0);

  const totalSales = cashSales + cardSales;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">FnB & Αναψυκτήριο (Bar Reconciliation)</h1>
              <span className="text-xs font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                ΑΜΦΙΔΡΟΜΟΣ ΣΥΓΧΡΟΝΙΣΜΟΣ
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Καταγραφή πωλήσεων καφέ, ποτών & σνακ. Αμφίδρομη σύνδεση με το κλείσιμο βάρδιας & ταμείο.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {activeShift && (
            <button
              onClick={() => {
                setShiftFnbCashInput(String(activeShift.fnb_cash || '0'));
                setShiftFnbCardInput(String(activeShift.fnb_card || '0'));
                setShowShiftAdjustModal(true);
              }}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
              title="Επεξεργασία συνόλων FnB ενεργής βάρδιας"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Σύνολα Βάρδιας</span>
            </button>
          )}

          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Νέα Πώληση FnB</span>
          </button>
        </div>
      </div>

      {/* Active Shift Sync Status Indicator */}
      {activeShift && (
        <div className="bg-gradient-to-r from-amber-50 to-indigo-50 p-4 rounded-2xl border border-amber-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 font-extrabold text-sm">
              ☕
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">
                Ενεργή Βάρδια: {activeShift.store_name} ({activeShift.shift_type === 'MORNING' ? 'Πρωινή' : 'Απογευματινή'})
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                FnB Μετρητά Ταμείου: <strong className="text-emerald-700 font-mono">{formatCurrency(Number(activeShift.fnb_cash) || 0)}</strong> | 
                Κάρτες POS: <strong className="text-indigo-700 font-mono">{formatCurrency(Number(activeShift.fnb_card) || 0)}</strong> | 
                Συνολικό FnB: <strong className="text-slate-900 font-mono">{formatCurrency(Number(activeShift.fnb_sales) || 0)}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={loadActiveShift}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold flex items-center space-x-1.5 self-start sm:self-auto cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
            <span>Ανανέωση Βάρδιας</span>
          </button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">Συνολικές Πωλήσεις FnB</p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{formatCurrency(totalSales)}</h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Απευθείας καταχώρηση στο Ζ του POS/Bar</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">FnB Μετρητά (Cash Inflow)</p>
              <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">+{formatCurrency(cashSales)}</h3>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Προστίθεται στο αναμενόμενο υπόλοιπο συρταριού</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">FnB Κάρτα (POS Bar)</p>
              <h3 className="text-2xl font-extrabold text-indigo-600 mt-1">+{formatCurrency(cardSales)}</h3>
            </div>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Επιβεβαιώνεται από το τερματικό POS</p>
        </div>
      </div>

      {/* Sales List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Πρόσφατες Πωλήσεις Αναψυκτηρίου</h3>
          <span className="text-xs text-slate-500 font-mono">{fnbSales.length} Πωλήσεις</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="px-4 py-3">{toGreekUpper('ID / Ωρα')}</th>
                <th className="px-4 py-3">{toGreekUpper('Προϊον')}</th>
                <th className="px-4 py-3 text-center">{toGreekUpper('Ποσοτητα')}</th>
                <th className="px-4 py-3 text-right">{toGreekUpper('Τιμη Μοναδος')}</th>
                <th className="px-4 py-3 text-right">{toGreekUpper('Συνολο')}</th>
                <th className="px-4 py-3">{toGreekUpper('Τροπος Πληρωμης')}</th>
                <th className="px-4 py-3">{toGreekUpper('Σερβιτορος')}</th>
                <th className="px-4 py-3 text-right">{toGreekUpper('Ενεργειες')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fnbSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400 italic">
                    Δεν έχουν καταχωρηθεί πωλήσεις FnB για τη σημερινή βάρδια.
                  </td>
                </tr>
              ) : (
                fnbSales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono">
                      <p className="font-bold text-slate-900">{s.id}</p>
                      <p className="text-[10px] text-slate-400">{new Date(s.created_at).toLocaleTimeString('el-GR')}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{s.item_name}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">{s.quantity}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(s.unit_price)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600 font-mono">
                      +{formatCurrency(s.total_price)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{s.payment_method}</td>
                    <td className="px-4 py-3 text-slate-600">{s.server_name}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSaleToDelete(s)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Διαγραφή και αμφίδρομη ενημέρωση βάρδιας"
                        aria-label="Διαγραφή πώλησης"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Sale Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Coffee className="w-4 h-4 text-amber-400" />
                Νέα Πώληση Αναψυκτηρίου (FnB)
              </h3>
              <button onClick={() => setShowModal(false)} aria-label="Κλείσιμο" className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSale} className="p-4 space-y-3 text-xs">
              <div>
                <label htmlFor="fnb-sale-store" className="block text-slate-700 font-semibold mb-1">Κατάστημα</label>
                <select
                  id="fnb-sale-store"
                  value={targetStoreId}
                  onChange={(e) => setTargetStoreId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="fnb-sale-item" className="block text-slate-700 font-semibold mb-1">Όνομα Προϊόντος / Είδους</label>
                <input
                  id="fnb-sale-item"
                  type="text"
                  placeholder="π.χ. Καφές Espresso / Αναψυκτικό"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fnb-sale-qty" className="block text-slate-700 font-semibold mb-1">Ποσότητα</label>
                  <input
                    id="fnb-sale-qty"
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="fnb-sale-price" className="block text-slate-700 font-semibold mb-1">Τιμή Μονάδος (€)</label>
                  <input
                    id="fnb-sale-price"
                    type="number"
                    step="0.10"
                    placeholder="2.00"
                    required
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="fnb-sale-payment" className="block text-slate-700 font-semibold mb-1">Τρόπος Πληρωμής</label>
                <select
                  id="fnb-sale-payment"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                >
                  <option value="CASH">Μετρητά</option>
                  <option value="CARD">Κάρτα (POS)</option>
                </select>
              </div>
              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Καταχώρηση...' : 'Καταχώρηση Πώλησης'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Shift FnB Direct Modal */}
      {showShiftAdjustModal && activeShift && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Coffee className="w-4 h-4 text-amber-400" />
                Επεξεργασία FnB Ενεργής Βάρδιας ({activeShift.store_name})
              </h3>
              <button onClick={() => setShowShiftAdjustModal(false)} aria-label="Κλείσιμο" className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveShiftFnbAdjust} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Ορίστε απευθείας τα ποσά FnB για την ενεργή βάρδια. Οι αλλαγές θα συγχρονιστούν αμφίδρομα με το κλείσιμο της βάρδιας.
              </p>

              <div>
                <label htmlFor="fnb-shift-cash" className="block text-slate-800 font-bold mb-1">
                  FnB Μετρητά Ταμείου (€)
                </label>
                <input
                  id="fnb-shift-cash"
                  type="number"
                  step="0.01"
                  required
                  value={shiftFnbCashInput}
                  onChange={(e) => setShiftFnbCashInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-mono text-sm font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label htmlFor="fnb-shift-card" className="block text-slate-800 font-bold mb-1">
                  FnB Κάρτες POS (€)
                </label>
                <input
                  id="fnb-shift-card"
                  type="number"
                  step="0.01"
                  required
                  value={shiftFnbCardInput}
                  onChange={(e) => setShiftFnbCardInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-mono text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-700">Συνολικό FnB Βάρδιας:</span>
                <span className="font-mono font-extrabold text-sm text-indigo-700">
                  {formatCurrency((parseFloat(shiftFnbCashInput) || 0) + (parseFloat(shiftFnbCardInput) || 0))}
                </span>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowShiftAdjustModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={adjustingShift}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {adjustingShift ? 'Αποθήκευση...' : 'Αποθήκευση & Συγχρονισμός'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Sale Confirmation Modal */}
      {saleToDelete && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
          onClick={() => setSaleToDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Διαγραφή Πώλησης</h4>
            </div>
            <p className="text-xs text-slate-600">
              Διαγραφή πώλησης «{saleToDelete.item_name}» ({formatCurrency(saleToDelete.total_price)}); Αν ανήκει σε ενεργή βάρδια, το ταμείο της θα ενημερωθεί αυτόματα.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeletingSale}
                onClick={() => setSaleToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                disabled={isDeletingSale}
                onClick={handleDeleteSale}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingSale ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Διαγραφή...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ναι, Διαγραφή</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
