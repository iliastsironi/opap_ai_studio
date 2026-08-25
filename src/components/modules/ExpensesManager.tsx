import React, { useState, useEffect } from 'react';
import { Receipt, Plus, Search, DollarSign, Tag, ArrowUpRight, X, Clock, CheckCircle } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchExpensesFromFirestore, createExpenseInFirestore, ExpenseRecord } from '../../services/moduleServices.ts';
import { fetchActiveShiftFromFirestore, updateShiftInFirestore } from '../../services/shiftService.ts';
import { Shift, ShiftExpense } from '../../types/index.ts';

export const ExpensesManager: React.FC = () => {
  const { selectedStoreId, stores } = useTenant();
  const { user, organization } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [targetStoreId, setTargetStoreId] = useState(stores[0]?.id || 'store_opap_01');
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [category, setCategory] = useState('CLEANING');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'CREDIT'>('CASH');
  const [recipient, setRecipient] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const orgId = organization?.id || 'org_opap_demo';

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const records = await fetchExpensesFromFirestore(orgId, selectedStoreId);
      setExpenses(records);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [selectedStoreId, orgId]);

  useEffect(() => {
    const checkActiveShift = async () => {
      if (!targetStoreId || targetStoreId === 'ALL') return;
      try {
        const active = await fetchActiveShiftFromFirestore(orgId, targetStoreId);
        setActiveShift(active);
      } catch (e) {
        console.warn('Could not fetch active shift for store', e);
      }
    };
    checkActiveShift();
  }, [targetStoreId, orgId, showModal]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) return;
    setSubmitting(true);
    try {
      const numAmount = parseFloat(amount);
      const expensePayload: any = {
        organization_id: orgId,
        store_id: targetStoreId,
        category,
        amount: numAmount,
        payment_method: paymentMethod,
        recipient: recipient || 'Προμηθευτής',
        created_by_user_name: user ? `${user.first_name} ${user.last_name}` : 'Υπάλληλος',
        date: new Date().toISOString().split('T')[0],
      };
      if (activeShift?.id) expensePayload.shift_id = activeShift.id;
      if (receiptNumber) expensePayload.receipt_number = receiptNumber;
      if (notes) expensePayload.notes = notes;

      const createdRecord = await createExpenseInFirestore(expensePayload);

      // Automatically sync this expense directly to the active shift!
      if (activeShift) {
        const newShiftExpense: ShiftExpense = {
          id: createdRecord.id,
          shift_id: activeShift.id,
          organization_id: orgId,
          store_id: targetStoreId,
          category: category,
          amount: numAmount,
          payment_method: paymentMethod === 'CARD' ? 'CARD' : 'CASH',
          description: recipient ? `${recipient}${notes ? ` - ${notes}` : ''}` : (notes || category),
          receipt_url: '',
          created_by_user_id: user?.id || 'usr_employee',
          created_at: createdRecord.created_at,
        };

        const existingShiftExpenses: ShiftExpense[] = Array.isArray(activeShift.expenses) ? [...activeShift.expenses] : [];
        if (!existingShiftExpenses.some((ex) => ex.id === createdRecord.id)) {
          existingShiftExpenses.push(newShiftExpense);
        }

        const totalCashExpenses = existingShiftExpenses.reduce(
          (sum, item) => sum + (item.payment_method !== 'CARD' ? (Number(item.amount) || 0) : 0),
          0
        );

        await updateShiftInFirestore(activeShift.id, {
          expenses: existingShiftExpenses,
          expenses_paid_cash: totalCashExpenses,
        });

        if (typeof window !== 'undefined') {
          try {
            const draftKey = `shift_draft_${activeShift.id}`;
            const rawDraft = localStorage.getItem(draftKey);
            if (rawDraft) {
              const parsed = JSON.parse(rawDraft);
              parsed.expenses = existingShiftExpenses;
              parsed.expenses_paid_cash = totalCashExpenses;
              localStorage.setItem(draftKey, JSON.stringify(parsed));
            }
          } catch (err) {
            // ignore
          }
        }
      }

      await loadExpenses();
      setShowModal(false);
      setAmount('');
      setRecipient('');
      setReceiptNumber('');
      setNotes('');
    } catch (err) {
      console.error('Expense error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch =
      (e.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.recipient || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || e.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalExpenseAmount = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'CLEANING':
        return <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">Καθαριότητα</span>;
      case 'MAINTENANCE':
        return <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-xs font-semibold">Συντήρηση</span>;
      case 'SUPPLIES':
        return <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs font-semibold">Αναλώσιμα</span>;
      case 'UTILITIES':
        return <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs font-semibold">Utilities</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-semibold">Διάφορα</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Έξοδα & Δαπάνες Βάρδιας</h1>
              <span className="text-xs font-mono font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                LIVE PERSISTENCE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Πλήρης καταγραφή και έλεγχος εξόδων ταμείου, αποδείξεων & πληρωμών μετρητοίς ανά κατάστημα.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Καταχώρηση Εξόδου</span>
          </button>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">Σύνολο Εξόδων (Φιλτραρισμένα)</p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                {totalExpenseAmount.toFixed(2)} €
              </h3>
            </div>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">Αφαιρούνται αυτόματα από το αναμενόμενο υπόλοιπο ταμείου</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">Πλήθος Εγγραφών</p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{filteredExpenses.length}</h3>
            </div>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Tag className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">Συνολικές εγκρίσεις εξόδων από ταμείο</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">Μέσο Έξοδο ανά Βάρδια</p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                {filteredExpenses.length > 0 ? (totalExpenseAmount / filteredExpenses.length).toFixed(2) : '0.00'} €
              </h3>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">Εντός ορίων ασφαλείας εγκρίσεων</p>
        </div>
      </div>

      {/* Filter and Table Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Αναζήτηση με περιγραφή, προμηθευτή ή ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-full border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 bg-white focus:outline-hidden"
            >
              <option value="ALL">Όλες οι Κατηγορίες</option>
              <option value="CLEANING">Καθαριότητα</option>
              <option value="MAINTENANCE">Συντήρηση</option>
              <option value="SUPPLIES">Αναλώσιμα</option>
              <option value="UTILITIES">Utilities</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="px-4 py-3">ID / Ημερομηνία</th>
                <th className="px-4 py-3">Προμηθευτής / Παραλήπτης</th>
                <th className="px-4 py-3">Κατηγορία</th>
                <th className="px-4 py-3">Σημειώσεις / Περιγραφή</th>
                <th className="px-4 py-3 text-right">Ποσό (€)</th>
                <th className="px-4 py-3">Τρόπος Πληρωμής</th>
                <th className="px-4 py-3">Καταχωρήθηκε από</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">
                    Δεν βρέθηκαν καταχωρημένα έξοδα.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono">
                      <p className="font-bold text-slate-900">{exp.id}</p>
                      <p className="text-[10px] text-slate-400">{new Date(exp.created_at).toLocaleString('el-GR')}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{exp.recipient || '—'}</td>
                    <td className="px-4 py-3">{getCategoryBadge(exp.category)}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{exp.notes || exp.receipt_number || '—'}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-rose-600">
                      -{exp.amount.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{exp.payment_method}</td>
                    <td className="px-4 py-3 text-slate-700">{exp.created_by_user_name || 'Υπάλληλος'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-400" />
                Καταχώρηση Νέου Εξόδου Ταμείου
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateExpense} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Κατάστημα</label>
                <select
                  value={targetStoreId}
                  onChange={(e) => setTargetStoreId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white font-medium"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Active Shift Indicator */}
              <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-start space-x-2">
                <Clock className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-tight">
                  {activeShift ? (
                    <>
                      <p className="font-bold text-indigo-950">
                        ⚡ Ενεργή Βάρδια: {activeShift.register_id || 'Ταμείο 1'} ({activeShift.shift_type === 'MORNING' ? 'Πρωινή' : 'Απογευματινή'})
                      </p>
                      <p className="text-indigo-700 mt-0.5">
                        Το έξοδο θα καταχωρηθεί και θα μεταφερθεί <strong>αυτόματα</strong> στο κλείσιμο της βάρδιας!
                      </p>
                    </>
                  ) : (
                    <p className="text-slate-600">
                      Δεν υπάρχει ανοιχτή βάρδια αυτή τη στιγμή. Το έξοδο θα καταγραφεί στο γενικό αρχείο εξόδων.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Κατηγορία</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white font-medium"
                  >
                    <option value="EXPENSES_GP">Έξοδα ΓΠ (Γενικά Πληρωμών)</option>
                    <option value="EXPENSES_FNB">Έξοδα FnB (Κυλικείο)</option>
                    <option value="SUPPLIES">Αναλώσιμα / Χαρτί</option>
                    <option value="CLEANING">Καθαριότητα</option>
                    <option value="MAINTENANCE">Συντήρηση / Βλάβες</option>
                    <option value="UTILITIES">Λογαριασμοί / Utilities</option>
                    <option value="OTHER">Λοιπά Έξοδα</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Ποσό (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 bg-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Τρόπος Πληρωμής</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="CASH">Μετρητά</option>
                    <option value="CARD">Κάρτα/POS</option>
                    <option value="CREDIT">Πίστωση</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Αρ. Απόδειξης/ΤΠΥ</label>
                  <input
                    type="text"
                    placeholder="π.χ. ΤΠΥ-1029"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Προμηθευτής / Παραλήπτης</label>
                <input
                  type="text"
                  placeholder="π.χ. Καθαριστήρια ΑΕ"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Σημειώσεις / Αιτιολογία</label>
                <textarea
                  rows={2}
                  placeholder="Αιτιολογία δαπάνης..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>
              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Aκύρωση
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold"
                >
                  {submitting ? 'Αποθήκευση...' : 'Καταχώρηση'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

