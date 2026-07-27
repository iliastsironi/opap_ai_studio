import React, { useState, useEffect } from 'react';
import { Coffee, DollarSign, CreditCard, ShoppingBag, Plus, X } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchFnbFromFirestore, createFnbInFirestore, FnbRecord } from '../../services/moduleServices.ts';

export const FnbManager: React.FC = () => {
  const { selectedStoreId, stores } = useTenant();
  const { user, organization } = useAuth();
  const [fnbSales, setFnbSales] = useState<FnbRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // New Sale Modal
  const [showModal, setShowModal] = useState(false);
  const [targetStoreId, setTargetStoreId] = useState(stores[0]?.id || 'store_opap_01');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    loadFnbSales();
  }, [selectedStoreId, orgId]);

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(quantity, 10) || 1;
    const price = parseFloat(unitPrice) || 0;
    if (!itemName || price <= 0) return;

    setSubmitting(true);
    try {
      await createFnbInFirestore({
        organization_id: orgId,
        store_id: targetStoreId,
        item_name: itemName,
        quantity: qty,
        unit_price: price,
        total_price: qty * price,
        payment_method: paymentMethod,
        server_name: user ? `${user.first_name} ${user.last_name}` : 'Υπάλληλος',
      });
      await loadFnbSales();
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
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">FnB & Αναψυκτήριο (Bar Reconciliation)</h1>
              <span className="text-xs font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                LIVE PERSISTENCE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Καταγραφή πωλήσεων καφέ, ποτών & σνακ. Διαχωρισμός Μετρητών - Καρτών POS για το ταμείο.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Νέα Πώληση FnB</span>
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">Συνολικές Πωλήσεις FnB</p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{totalSales.toFixed(2)} €</h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Απευθείας καταχώρηση στο Ζ του POS/Bar</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">FnB Μετρητά (Cash Inflow)</p>
              <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">+{cashSales.toFixed(2)} €</h3>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Προστίθεται στο αναμενόμενο υπόλοιπο συρταριού</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">FnB Κάρτα (POS Bar)</p>
              <h3 className="text-2xl font-extrabold text-indigo-600 mt-1">+{cardSales.toFixed(2)} €</h3>
            </div>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Επιβεβαιώνεται από το τερματικό POS</p>
        </div>
      </div>

      {/* Sales List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Πρόσφατες Πωλήσεις Αναψυκτηρίου</h3>
          <span className="text-xs text-slate-500 font-mono">{fnbSales.length} Πωλήσεις</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="px-4 py-3">ID / Ώρα</th>
                <th className="px-4 py-3">Προϊόν</th>
                <th className="px-4 py-3 text-center">Ποσότητα</th>
                <th className="px-4 py-3 text-right">Τιμή Μονάδος</th>
                <th className="px-4 py-3 text-right">Σύνολο</th>
                <th className="px-4 py-3">Τρόπος Πληρωμής</th>
                <th className="px-4 py-3">Σερβιτόρος</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fnbSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">
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
                    <td className="px-4 py-3 text-right font-mono">{s.unit_price.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600 font-mono">
                      +{s.total_price.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{s.payment_method}</td>
                    <td className="px-4 py-3 text-slate-600">{s.server_name}</td>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Coffee className="w-4 h-4 text-amber-400" />
                Νέα Πώληση Αναψυκτηρίου (FnB)
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSale} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Κατάστημα</label>
                <select
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
                <label className="block text-slate-700 font-semibold mb-1">Όνομα Προϊόντος / Είδους</label>
                <input
                  type="text"
                  placeholder="π.χ. Καφές Espresso / Αναψυκτικό"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Ποσότητα</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Τιμή Μονάδος (€)</label>
                  <input
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
                <label className="block text-slate-700 font-semibold mb-1">Τρόπος Πληρωμής</label>
                <select
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
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold"
                >
                  {submitting ? 'Καταχώρηση...' : 'Καταχώρηση Πώλησης'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
