import React, { useState, useEffect } from 'react';
import { Receipt, Plus, Search, DollarSign, Tag, CalendarDays, Clock, CheckCircle, Building2, ChevronLeft, ChevronRight, AlertCircle, X } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchExpensesFromFirestore, createAndSyncShiftExpense, deleteAndSyncShiftExpense, ExpenseRecord } from '../../services/moduleServices.ts';
import { fetchActiveShiftFromFirestore } from '../../services/shiftService.ts';
import { fetchSuppliersFromFirestore } from '../../services/supplierService.ts';
import { Shift, Supplier } from '../../types/index.ts';
import { Trash2 } from 'lucide-react';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { athensDateKey, currentMonthKey, shiftMonthKey, monthLabel } from '../../lib/pnlEngine.ts';
import { MAX_CURRENCY_AMOUNT, parseNonNegativeAmount, MAX_LABEL_LENGTH, MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { presetsForCategory, suppliersForCategory } from '../../lib/expenseSuppliers.ts';
import { MoneyField } from '../ui/MoneyField.tsx';

export const ExpensesManager: React.FC = () => {
  const { selectedStoreId, stores } = useTenant();
  const { user, organization, hasPermission } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  // Dating an expense to another day is the Owner's, not the counter's: it
  // moves money between months and so between P&L figures that have already
  // been read.
  const canBackdate = hasPermission('organization.update') || hasPermission('store.update');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  // Period is driven by shift_expenses.date - the day the money was spent -
  // never created_at, which is when the row happened to be written. The August
  // import wrote all 94 of its rows on one evening in September, so grouping by
  // created_at puts the entire month in the wrong place.
  const [periodMode, setPeriodMode] = useState<'MONTH' | 'ALL'>('MONTH');
  const [periodMonth, setPeriodMonth] = useState<string>(() => currentMonthKey());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [monthPinned, setMonthPinned] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const EXPENSES_PAGE_SIZE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  // Seeded once, at mount, and `stores` is empty until TenantContext has
  // fetched them - so this used to settle on 'store_opap_01', an id that is
  // not in the database, and the insert died on a foreign key. Start empty and
  // adopt the first real store when the list arrives.
  const [targetStoreId, setTargetStoreId] = useState('');

  useEffect(() => {
    if (!targetStoreId && stores.length > 0) {
      setTargetStoreId(stores[0].id);
    }
  }, [stores, targetStoreId]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [category, setCategory] = useState('EXPENSES_GP');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'CREDIT'>('CASH');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [customRecipient, setCustomRecipient] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  // The day the money was spent. Defaults to today, which is what every
  // expense was filed under until now whatever its invoice said.
  const [expenseDate, setExpenseDate] = useState(() => athensDateKey(new Date().toISOString()));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<{ id: string; storeId: string; shiftId?: string; label: string } | null>(null);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const orgId = organization!.id; // guaranteed by ProtectedLayout's organisation guard

  const loadExpenses = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const records = await fetchExpensesFromFirestore(orgId, selectedStoreId);
      setExpenses(records);
    } catch (e: any) {
      console.error(e);
      setLoadError(e.message || 'Αποτυχία φόρτωσης εξόδων');
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const list = await fetchSuppliersFromFirestore(orgId);
      if (list && list.length > 0) {
        setSuppliers(list);
      }
    } catch (e) {
      console.warn('Could not fetch suppliers, using defaults', e);
    }
  };

  useEffect(() => {
    loadExpenses();
    loadSuppliers();
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

  const handleSupplierSelect = (supplierIdOrPreset: string) => {
    setSelectedSupplierId(supplierIdOrPreset);
    if (!supplierIdOrPreset) {
      setRecipient('');
      return;
    }

    if (supplierIdOrPreset === 'CUSTOM') {
      setRecipient(customRecipient || '');
      return;
    }

    // Check in database suppliers
    const foundSupplier = suppliers.find((s) => s.id === supplierIdOrPreset);
    if (foundSupplier) {
      const name = foundSupplier.company_name || foundSupplier.trade_name;
      setRecipient(name);
      // Auto-set category based on supplier
      if (foundSupplier.category === 'BEVERAGES_FNB') {
        setCategory('EXPENSES_FNB');
      } else if (foundSupplier.category === 'OPAP_SERVICES' || foundSupplier.category === 'IT_EQUIPMENT') {
        setCategory('EXPENSES_GP');
      }
      return;
    }

    // Check presets
    setRecipient(supplierIdOrPreset);
    if (supplierIdOrPreset.includes('ΔΕΗ') || supplierIdOrPreset.includes('ΕΥΔΑΠ') || supplierIdOrPreset.includes('Cosmote') || supplierIdOrPreset.includes('Nova')) {
      setCategory('UTILITIES');
    } else if (supplierIdOrPreset.includes('Καθαριστ') || supplierIdOrPreset.includes('Υγιεινής')) {
      setCategory('CLEANING');
    } else if (supplierIdOrPreset.includes('Χαρτί') || supplierIdOrPreset.includes('Ρολά')) {
      setCategory('SUPPLIES');
    } else if (supplierIdOrPreset.includes('Καφέ') || supplierIdOrPreset.includes('Snacks') || supplierIdOrPreset.includes('Κυλικείου')) {
      setCategory('EXPENSES_FNB');
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCheck = parseNonNegativeAmount(amount, MAX_CURRENCY_AMOUNT);
    if (!amountCheck.isValid || amountCheck.value <= 0) {
      // Said out loud. This used to return in silence: the button did
      // nothing, nothing was saved, and nothing on screen explained it.
      setCreateError(
        amountCheck.value <= 0 && amountCheck.isValid
          ? 'Συμπληρώστε ποσό μεγαλύτερο από 0.'
          : 'Το ποσό δεν είναι έγκυρο. Γράψτε έναν αριθμό, π.χ. 12,50.'
      );
      return;
    }
    const finalRecipient = selectedSupplierId === 'CUSTOM' ? (customRecipient.trim() || 'Προμηθευτής') : (recipient.trim() || 'Προμηθευτής');
    setSubmitting(true);
    setCreateError(null);
    try {
      await createAndSyncShiftExpense(
        {
          organization_id: orgId,
          store_id: targetStoreId,
          category,
          amount: amountCheck.value,
          payment_method: paymentMethod,
          recipient: finalRecipient,
          created_by_user_id: user?.id,
          created_by_user_name: user ? `${user.first_name} ${user.last_name}` : 'Υπάλληλος',
          receipt_number: receiptNumber || undefined,
          notes: notes || undefined,
          date: expenseDate || undefined,
        },
        activeShift
      );

      // Registering a hand-typed recipient as a supplier now happens inside
      // createAndSyncShiftExpense, so it covers expenses entered during a
      // shift too - which is most of them, and which never reached the
      // registry while this lived only here.

      await loadExpenses();
      // A recipient typed just now may have become a supplier inside
      // createAndSyncShiftExpense; pick it up so the next entry offers it.
      await loadSuppliers();
      setShowModal(false);
      setAmount('');
      setSelectedSupplierId('');
      setRecipient('');
      setCustomRecipient('');
      setReceiptNumber('');
      setNotes('');
    } catch (err: any) {
      console.error('Expense error:', err);
      setCreateError(err.message || 'Αποτυχία καταχώρησης εξόδου');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;
    const { id } = expenseToDelete;
    setIsDeletingExpense(true);
    setDeleteError(null);
    try {
      await deleteAndSyncShiftExpense({
        id,
        organization_id: orgId,
        store_id: expenseToDelete.storeId,
        shift_id: expenseToDelete.shiftId,
      });

      await loadExpenses();
      setExpenseToDelete(null);
    } catch (err: any) {
      console.error('Delete expense error:', err);
      setDeleteError(err.message || 'Αποτυχία διαγραφής εξόδου');
    } finally {
      setIsDeletingExpense(false);
    }
  };

  // Land on the latest month that actually has expenses rather than on today's,
  // which would open to an empty screen whenever nothing has been spent yet
  // this month. Only until the user picks a month themselves.
  useEffect(() => {
    if (monthPinned || expenses.length === 0) return;
    const latest = expenses.reduce((max, e) => (e.date > max ? e.date : max), expenses[0].date);
    setPeriodMonth(latest.slice(0, 7));
  }, [expenses, monthPinned]);

  const pickMonth = (next: string) => {
    setMonthPinned(true);
    setPeriodMonth(next);
    setSelectedDay(null);
    setCurrentPage(1);
  };

  // Everything in the chosen period, before the day/search/category filters -
  // this is what the per-day breakdown and the month total are built from.
  const periodExpenses = expenses.filter(
    (e) => periodMode === 'ALL' || (e.date || '').slice(0, 7) === periodMonth
  );

  const dayTotals = (() => {
    const byDay = new Map<string, { day: string; total: number; count: number }>();
    for (const e of periodExpenses) {
      const day = e.date || '';
      if (!day) continue;
      const entry = byDay.get(day) || { day, total: 0, count: 0 };
      entry.total += Number(e.amount) || 0;
      entry.count += 1;
      byDay.set(day, entry);
    }
    return Array.from(byDay.values()).sort((a, b) => b.day.localeCompare(a.day));
  })();

  const filteredExpenses = periodExpenses.filter((e) => {
    const matchesSearch =
      (e.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.recipient || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || e.category === selectedCategory;
    const matchesDay = !selectedDay || e.date === selectedDay;
    return matchesSearch && matchesCategory && matchesDay;
  });

  const totalExpenseAmount = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
  const periodTotal = periodExpenses.reduce((sum, item) => sum + item.amount, 0);
  const averagePerDay = dayTotals.length > 0 ? periodTotal / dayTotals.length : 0;
  const busiestDay = dayTotals.reduce<{ day: string; total: number; count: number } | null>(
    (max, d) => (!max || d.total > max.total ? d : max),
    null
  );

  const dayLabel = (day: string) =>
    new Date(`${day}T00:00:00`).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' });

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / EXPENSES_PAGE_SIZE));
  const pageSafe = Math.min(currentPage, totalPages);
  const paginatedExpenses = filteredExpenses.slice((pageSafe - 1) * EXPENSES_PAGE_SIZE, pageSafe * EXPENSES_PAGE_SIZE);

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
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
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
            onClick={() => {
              setCreateError(null);
              setShowModal(true);
            }}
            className="transition px-4 py-2 duration-150 ease-out active:scale-[0.97] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center space-x-2 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Καταχώρηση Εξόδου</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 flex items-start justify-between gap-3">
          <div className="flex items-start space-x-2 text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-xs font-semibold">{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setLoadError(null)}
            aria-label="Κλείσιμο"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {periodMode === 'ALL' ? 'Σύνολο Εξόδων (Όλες οι περίοδοι)' : `Σύνολο ${monthLabel(periodMonth)}`}
              </p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                {formatCurrency(periodTotal)}
              </h3>
            </div>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-micro text-slate-500 mt-3">
            {totalExpenseAmount !== periodTotal
              ? `Φιλτραρισμένα: ${formatCurrency(totalExpenseAmount)}`
              : 'Αφαιρούνται αυτόματα από το αναμενόμενο υπόλοιπο ταμείου'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">Πλήθος Εγγραφών</p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{periodExpenses.length}</h3>
            </div>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Tag className="w-5 h-5" />
            </div>
          </div>
          <p className="text-micro text-slate-500 mt-3">
            {dayTotals.length} {dayTotals.length === 1 ? 'ημέρα' : 'ημέρες'} με έξοδα
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-start">
            <div>
              {/* Was «Μέσο Έξοδο ανά Βάρδια», but it divided by the number of
                  expenses, not of shifts - so the label promised something the
                  figure never was. Per day is both true and the thing you want
                  when you are looking at a month. */}
              <p className="text-xs font-medium text-slate-500">Μέσος Όρος Ημέρας</p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                {formatCurrency(averagePerDay)}
              </h3>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <CalendarDays className="w-5 h-5" />
            </div>
          </div>
          <p className="text-micro text-slate-500 mt-3">
            {busiestDay
              ? `Υψηλότερη ημέρα: ${dayLabel(busiestDay.day)} — ${formatCurrency(busiestDay.total)}`
              : 'Καμία καταχώρηση στην περίοδο'}
          </p>
        </div>
      </div>

      {/* Period picker + per-day totals */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <IconButton
              icon={ChevronLeft}
              label="Προηγούμενος μήνας"
              disabled={periodMode === 'ALL'}
              onClick={() => pickMonth(shiftMonthKey(periodMonth, -1))}
              className="border border-slate-200 bg-white"
            />
            <span className="text-xs font-black text-slate-900 min-w-40 text-center tabular-nums">
              {periodMode === 'ALL' ? toGreekUpper('Ολες οι περιοδοι') : monthLabel(periodMonth)}
            </span>
            <IconButton
              icon={ChevronRight}
              label="Επόμενος μήνας"
              disabled={periodMode === 'ALL'}
              onClick={() => pickMonth(shiftMonthKey(periodMonth, 1))}
              className="border border-slate-200 bg-white"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1" role="group" aria-label="Εύρος περιόδου">
            <button
              type="button"
              aria-pressed={periodMode === 'MONTH'}
              onClick={() => { setPeriodMode('MONTH'); setSelectedDay(null); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                periodMode === 'MONTH' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {toGreekUpper('Μηνας')}
            </button>
            <button
              type="button"
              aria-pressed={periodMode === 'ALL'}
              onClick={() => { setPeriodMode('ALL'); setSelectedDay(null); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                periodMode === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {toGreekUpper('Ολα')}
            </button>
          </div>
        </div>

        {dayTotals.length === 0 ? (
          <p className="text-xs text-slate-500">
            Δεν υπάρχουν έξοδα{periodMode === 'MONTH' ? ` για ${monthLabel(periodMonth)}` : ''}.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {dayTotals.map((d) => {
              const active = selectedDay === d.day;
              return (
                <button
                  key={d.day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setSelectedDay(active ? null : d.day); setCurrentPage(1); }}
                  title={`${d.count} ${d.count === 1 ? 'έξοδο' : 'έξοδα'}`}
                  className={`shrink-0 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className={`text-micro font-bold block ${active ? 'text-indigo-100' : 'text-slate-500'}`}>
                    {dayLabel(d.day)}
                  </span>
                  <span className="text-xs font-black font-mono tabular-nums block mt-0.5">
                    {formatCurrency(d.total)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selectedDay && (
          <p className="text-micro text-slate-500">
            Ο πίνακας δείχνει μόνο την {dayLabel(selectedDay)}.{' '}
            <button
              type="button"
              onClick={() => { setSelectedDay(null); setCurrentPage(1); }}
              className="font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              Καθαρισμός
            </button>
          </p>
        )}
      </div>

      {/* Filter and Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search aria-hidden="true" className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <label htmlFor="expenses-search" className="sr-only">Αναζήτηση εξόδων</label>
            <input
              id="expenses-search"
              type="text"
              placeholder="Αναζήτηση με περιγραφή, προμηθευτή ή ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-full border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center space-x-3">
            <label htmlFor="expenses-category-filter" className="sr-only">Φίλτρο κατηγορίας</label>
            <select
              id="expenses-category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
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
                <th className="px-4 py-3">{toGreekUpper('ID / Ημερομηνια')}</th>
                <th className="px-4 py-3">{toGreekUpper('Προμηθευτης / Παραληπτης')}</th>
                <th className="px-4 py-3">{toGreekUpper('Κατηγορια')}</th>
                <th className="px-4 py-3">{toGreekUpper('Σημειωσεις / Περιγραφη')}</th>
                <th className="px-4 py-3 text-right">{toGreekUpper('Ποσο (€)')}</th>
                <th className="px-4 py-3">{toGreekUpper('Τροπος Πληρωμης')}</th>
                <th className="px-4 py-3">{toGreekUpper('Καταχωρηθηκε απο')}</th>
                <th className="px-4 py-3 text-right">{toGreekUpper('Ενεργειες')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    <Receipt className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-700">Δεν βρέθηκαν καταχωρημένα έξοδα</p>
                    <p className="text-xs text-slate-500 mt-1">Τα νέα έξοδα που καταχωρείτε θα εμφανίζονται εδώ.</p>
                  </td>
                </tr>
              ) : (
                paginatedExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono">
                      <p className="font-bold text-slate-900">{exp.id}</p>
                      {/* exp.date is the day the money was spent; created_at is
                          when the row was written. The August import wrote all
                          94 of its rows on one September evening, so created_at
                          showed the whole month under the wrong date. */}
                      <p className="text-micro text-slate-500">
                        {new Date(`${exp.date}T00:00:00`).toLocaleDateString('el-GR')}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{exp.recipient || '—'}</td>
                    <td className="px-4 py-3">{getCategoryBadge(exp.category)}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{exp.notes || exp.receipt_number || '—'}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-rose-600">
                      -{formatCurrency(exp.amount)}
                    </td>
                    <td className="px-4 py-3 font-mono text-micro text-slate-600">{exp.payment_method}</td>
                    <td className="px-4 py-3 text-slate-700">{exp.created_by_user_name || 'Υπάλληλος'}</td>
                    <td className="px-4 py-3 text-right">
                      <IconButton
                        icon={Trash2}
                        label="Διαγραφή εξόδου"
                        tone="danger"
                        onClick={() => {
                          setDeleteError(null);
                          setExpenseToDelete({ id: exp.id, storeId: exp.store_id, shiftId: exp.shift_id, label: exp.recipient || exp.id });
                        }}
                        className="ml-auto"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredExpenses.length > EXPENSES_PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
          <span>
            {(pageSafe - 1) * EXPENSES_PAGE_SIZE + 1}-
            {Math.min(pageSafe * EXPENSES_PAGE_SIZE, filteredExpenses.length)} από {filteredExpenses.length} έξοδα
          </span>
          <div className="flex items-center space-x-2">
            <IconButton
              icon={ChevronLeft}
              label="Προηγούμενη σελίδα"
              disabled={pageSafe <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="border border-slate-200 bg-white"
            />
            <span className="font-bold text-slate-700">Σελίδα {pageSafe} / {totalPages}</span>
            <IconButton
              icon={ChevronRight}
              label="Επόμενη σελίδα"
              disabled={pageSafe >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="border border-slate-200 bg-white"
            />
          </div>
        </div>
      )}

      {/* New Expense Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        icon={Receipt}
        title="Καταχώρηση Νέου Εξόδου Ταμείου"
        size="md"
        bodyAsForm
        onSubmit={handleCreateExpense}
        footer={
          <ModalActions
            onCancel={() => setShowModal(false)}
            saveLabel="Καταχώρηση"
            isSaving={submitting}
            savingLabel="Αποθήκευση..."
          />
        }
      >
            <div className="space-y-4 text-xs">
              {createError && (
                <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 flex items-center space-x-2 text-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-semibold">{createError}</span>
                </div>
              )}

              <div>
                <label htmlFor="expense-store" className="block text-slate-700 font-semibold mb-1">Κατάστημα</label>
                <select
                  id="expense-store"
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
                <div className="text-micro leading-tight">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="expense-category" className="block text-slate-700 font-semibold mb-1">Κατηγορία</label>
                  <select
                    id="expense-category"
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
                  <label htmlFor="expense-amount" className="block text-slate-700 font-semibold mb-1">Ποσό (€)</label>
                  <MoneyField
                    id="expense-amount"
                    placeholder="0.00"
                    value={amount}
                    onChange={setAmount}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 bg-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="expense-payment-method" className="block text-slate-700 font-semibold mb-1">Τρόπος Πληρωμής</label>
                  <select
                    id="expense-payment-method"
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
                  <label htmlFor="expense-date" className="block text-slate-700 font-semibold mb-1">
                    Ημερομηνία
                  </label>
                  <input
                    id="expense-date"
                    type="date"
                    value={expenseDate}
                    max={athensDateKey(new Date().toISOString())}
                    disabled={!canBackdate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 disabled:bg-slate-100 disabled:text-slate-600"
                  />
                  {canBackdate && (
                    <p className="text-micro text-slate-500 mt-1">
                      Η ημέρα που έγινε η δαπάνη, όχι η ημέρα καταχώρησης.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="expense-receipt-number" className="block text-slate-700 font-semibold mb-1">Αρ. Απόδειξης/ΤΠΥ</label>
                  <input
                    id="expense-receipt-number"
                    type="text"
                    maxLength={MAX_LABEL_LENGTH}
                    placeholder="π.χ. ΤΠΥ-1029"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="expense-supplier" className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span>Επιλογή Προμηθευτή / Παραλήπτη</span>
                  </span>
                  <span className="text-micro font-normal text-slate-500">Επιλογή από λίστα</span>
                </label>
                <select
                  id="expense-supplier"
                  value={selectedSupplierId}
                  onChange={(e) => handleSupplierSelect(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 bg-white font-medium text-slate-800 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  required={selectedSupplierId !== 'CUSTOM' && !recipient}
                >
                  <option value="">-- Επιλέξτε Προμηθευτή από τη Λίστα --</option>
                  
                  {/* Database Registered Suppliers, for the category chosen
                      above - the list used to ignore it and offer every
                      supplier and every preset for every kind of expense. */}
                  <optgroup label="Εγγεγραμμένοι Προμηθευτές (Μητρώο)">
                    {suppliersForCategory(category, suppliers).map((s) => (
                      <option key={s.id} value={s.id}>
                        {/* The parenthetical is only worth showing when it says
                            something. Falling back to the literal «Προμηθευτής»
                            printed it beside every name in a list of suppliers. */}
                        {s.company_name}
                        {s.code || s.trade_name ? ` (${s.code || s.trade_name})` : ''}
                      </option>
                    ))}
                  </optgroup>

                  {/* The built-in recipients for this category. The nine of
                      them used to be listed in full under two fixed group
                      headings, whatever was being entered. */}
                  <optgroup label="Συνήθεις Παραλήπτες">
                    {presetsForCategory(category).map((preset) => (
                      <option key={preset.value} value={preset.value}>{preset.label}</option>
                    ))}
                  </optgroup>

                  {/* Custom Option */}
                  <optgroup label="Χειροκίνητη Καταχώρηση">
                    <option value="CUSTOM">+ Νέος Προμηθευτής (προστίθεται στο μητρώο)...</option>
                  </optgroup>
                </select>

                {/* Custom input if "CUSTOM" is chosen */}
                {selectedSupplierId === 'CUSTOM' && (
                  <div className="mt-2 transition-opacity duration-150 starting:opacity-0">
                    <input
                      type="text"
                      maxLength={MAX_LABEL_LENGTH}
                      placeholder="Όνομα προμηθευτή — θα προστεθεί στο μητρώο"
                      aria-label="Όνομα νέου προμηθευτή"
                      required
                      value={customRecipient}
                      onChange={(e) => {
                        setCustomRecipient(e.target.value);
                        setRecipient(e.target.value);
                      }}
                      className="w-full border border-indigo-300 bg-indigo-50/40 rounded-lg p-2 text-sm font-medium text-slate-900 focus:bg-white"
                    />
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="expense-notes" className="block text-slate-700 font-semibold mb-1">Σημειώσεις / Αιτιολογία</label>
                <textarea
                  id="expense-notes"
                  rows={2}
                  maxLength={MAX_NOTES_LENGTH}
                  placeholder="Αιτιολογία δαπάνης..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>
            </div>
      </Modal>

      {/* Delete Expense Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!expenseToDelete}
        onCancel={() => setExpenseToDelete(null)}
        onConfirm={handleDeleteExpense}
        tone="destructive"
        title="Διαγραφή Εξόδου"
        message={
          <>
            Είστε σίγουροι ότι θέλετε να διαγράψετε το έξοδο «{expenseToDelete?.label}»; Αν ανήκει σε ενεργή βάρδια, το ταμείο της θα ενημερωθεί αυτόματα.
            {deleteError && (
              <p className="text-rose-600 font-semibold bg-rose-50 p-2.5 rounded-lg mt-3">{deleteError}</p>
            )}
          </>
        }
        confirmLabel="Ναι, Διαγραφή"
        isLoading={isDeletingExpense}
        loadingLabel="Διαγραφή..."
      />
    </div>
  );
};

