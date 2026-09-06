import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  UserCheck,
  ShieldCheck,
  Plus,
  Search,
  Sliders,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit2,
  Phone,
  Info,
  UserPlus,
  TrendingDown,
  TrendingUp,
  Award,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Customer, CreditScoreTier, CreditTierConfig } from '../../types/index.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import {
  getCustomers,
  saveCustomer,
  deleteCustomer,
  adjustCustomerDebt,
  getStoreCreditTierConfigs,
  saveStoreCreditTierConfigs,
  DEFAULT_CREDIT_TIER_CONFIGS,
  getCustomerCreditLimit,
} from '../../services/customerCreditService.ts';
import { useAuth } from '../../context/AuthContext.tsx';

interface CustomerCreditDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  storeId?: string;
  isOwnerOrManager: boolean;
  onCustomerSelected?: (customer: Customer) => void;
}

const CUSTOMERS_PAGE_SIZE = 20;

export const CustomerCreditDirectoryModal: React.FC<CustomerCreditDirectoryModalProps> = ({
  isOpen,
  onClose,
  orgId,
  storeId,
  isOwnerOrManager,
  onCustomerSelected,
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'directory' | 'tier_settings'>('directory');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tierConfigs, setTierConfigs] = useState<Record<CreditScoreTier, CreditTierConfig>>(
    DEFAULT_CREDIT_TIER_CONFIGS
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Customer Edit/Add Modal State
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    phone: string;
    tier: CreditScoreTier;
    current_debt: string;
    custom_limit: string;
    notes: string;
  }>({
    name: '',
    phone: '',
    tier: 'B',
    current_debt: '0',
    custom_limit: '',
    notes: '',
  });

  // Tier limit edit state
  const [editTierLimits, setEditTierLimits] = useState<{
    'A+': { isUnlimited: boolean; limit: string };
    A: { limit: string };
    B: { limit: string };
    C: { limit: string };
  }>({
    'A+': { isUnlimited: true, limit: '999999' },
    A: { limit: '300' },
    B: { limit: '100' },
    C: { limit: '30' },
  });

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isSavingTiers, setIsSavingTiers] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  const reloadCustomers = useCallback(async () => {
    setCustomers(await getCustomers(orgId, storeId));
  }, [orgId, storeId]);

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setSelectedTierFilter('ALL');
    setCurrentPage(1);
    reloadCustomers();
    getStoreCreditTierConfigs(orgId, storeId).then((tiers) => {
      setTierConfigs(tiers);
      setEditTierLimits({
        'A+': { isUnlimited: tiers['A+']?.isUnlimited ?? true, limit: String(tiers['A+']?.defaultLimit ?? 999999) },
        A: { limit: String(tiers['A']?.defaultLimit ?? 300) },
        B: { limit: String(tiers['B']?.defaultLimit ?? 100) },
        C: { limit: String(tiers['C']?.defaultLimit ?? 30) },
      });
    });
  }, [isOpen, orgId, storeId, reloadCustomers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedTierFilter]);

  if (!isOpen) return null;

  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      phone: '',
      tier: 'B',
      current_debt: '0',
      custom_limit: '',
      notes: '',
    });
    setEditingCustomer(null);
    setIsAddingNew(true);
  };

  const handleOpenEditModal = (cust: Customer) => {
    setFormData({
      name: cust.name,
      phone: cust.phone || '',
      tier: cust.tier,
      current_debt: String(cust.current_debt || 0),
      custom_limit: cust.custom_limit !== undefined && cust.custom_limit !== null ? String(cust.custom_limit) : '',
      notes: cust.notes || '',
    });
    setEditingCustomer(cust);
    setIsAddingNew(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || isSavingCustomer) return;
    setIsSavingCustomer(true);

    try {
      const desiredDebt = parseFloat(formData.current_debt) || 0;
      const saved = await saveCustomer({
        id: editingCustomer ? editingCustomer.id : undefined,
        organization_id: orgId,
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        tier: formData.tier,
        custom_limit: formData.custom_limit ? parseFloat(formData.custom_limit) : null,
        notes: formData.notes.trim(),
        store_id: storeId || 'store_opap_01',
      });

      // current_debt is trigger-maintained from customer_credit_transactions,
      // not writable directly - record the delta as a standalone (no shift)
      // adjustment transaction so manual corrections stay in the audit trail.
      const priorDebt = editingCustomer ? editingCustomer.current_debt || 0 : 0;
      if (Math.abs(desiredDebt - priorDebt) >= 0.005) {
        await adjustCustomerDebt({
          customerId: saved.id,
          organizationId: orgId,
          storeId: storeId || 'store_opap_01',
          currentDebt: priorDebt,
          desiredDebt,
          createdByUserId: user?.id || '',
          customerName: saved.name,
          customerTier: saved.tier,
        });
      }

      await reloadCustomers();
      setIsAddingNew(false);
      setEditingCustomer(null);

      if (onCustomerSelected) {
        onCustomerSelected(saved);
      }
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    setIsDeletingCustomer(true);
    try {
      await deleteCustomer(customerToDelete.id);
      await reloadCustomers();
      setCustomerToDelete(null);
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  const handleSaveTierLimits = async () => {
    if (isSavingTiers) return;
    setIsSavingTiers(true);
    const updated: Record<CreditScoreTier, CreditTierConfig> = {
      ...tierConfigs,
      'A+': {
        ...tierConfigs['A+'],
        isUnlimited: editTierLimits['A+'].isUnlimited,
        defaultLimit: editTierLimits['A+'].isUnlimited ? 999999 : parseFloat(editTierLimits['A+'].limit) || 999999,
      },
      A: {
        ...tierConfigs['A'],
        defaultLimit: parseFloat(editTierLimits['A'].limit) || 300,
      },
      B: {
        ...tierConfigs['B'],
        defaultLimit: parseFloat(editTierLimits['B'].limit) || 100,
      },
      C: {
        ...tierConfigs['C'],
        defaultLimit: parseFloat(editTierLimits['C'].limit) || 30,
      },
    };

    try {
      await saveStoreCreditTierConfigs(orgId, storeId || 'store_opap_01', updated);
      setTierConfigs(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } finally {
      setIsSavingTiers(false);
    }
  };

  // Calculations
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone && c.phone.includes(searchQuery));
    const matchesTier = selectedTierFilter === 'ALL' || c.tier === selectedTierFilter;
    return matchesSearch && matchesTier;
  });

  const totalOutstandingDebt = customers.reduce((acc, c) => acc + (c.current_debt || 0), 0);
  const totalDebtorsCount = customers.filter((c) => (c.current_debt || 0) > 0).length;

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / CUSTOMERS_PAGE_SIZE));
  const pageSafe = Math.min(currentPage, totalPages);
  const paginatedCustomers = filteredCustomers.slice(
    (pageSafe - 1) * CUSTOMERS_PAGE_SIZE,
    pageSafe * CUSTOMERS_PAGE_SIZE
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black tracking-wide">Διαχείριση Πιστώσεων & Credit Score Πελατών</h3>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full font-bold border border-indigo-400/30">
                  Τεφτέρι Καταστήματος
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                4 Κατηγορίες Αξιοπιστίας (A+, A, B, C) με αυστηρό έλεγχο ορίων δανεισμού.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Κλείσιμο"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('directory')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-black transition-all border-b-2 flex items-center space-x-2 cursor-pointer ${
                activeTab === 'directory'
                  ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Καρτέλες Πελατών & Υπόλοιπα ({customers.length})</span>
            </button>

            {isOwnerOrManager && (
              <button
                type="button"
                onClick={() => setActiveTab('tier_settings')}
                className={`px-4 py-2.5 rounded-t-xl text-xs font-black transition-all border-b-2 flex items-center space-x-2 cursor-pointer ${
                  activeTab === 'tier_settings'
                    ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>Καθορισμός Ορίων Credit Score (A+, A, B, C)</span>
              </button>
            )}
          </div>

          {activeTab === 'directory' && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="mb-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Νέος Πελάτης</span>
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'directory' && (
            <>
              {/* Overview Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-extrabold text-rose-700 uppercase tracking-wider block">
                      Συνολικό Ανοιχτό Τεφτέρι
                    </span>
                    <span className="text-xl font-black text-rose-950 font-mono">
                      {formatCurrency(totalOutstandingDebt)}
                    </span>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider block">
                      Πελάτες με Οφειλή
                    </span>
                    <span className="text-xl font-black text-indigo-950 font-mono">
                      {totalDebtorsCount} <span className="text-xs font-medium text-slate-500">/ {customers.length}</span>
                    </span>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <UserCheck className="w-5 h-5" />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider block">
                      VIP & Υψηλή Εμπιστοσύνη (A+/A)
                    </span>
                    <span className="text-xl font-black text-emerald-950 font-mono">
                      {customers.filter((c) => c.tier === 'A+' || c.tier === 'A').length}
                    </span>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <Award className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-72">
                  <Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <label htmlFor="customer-directory-search" className="sr-only">Αναζήτηση πελατών</label>
                  <input
                    id="customer-directory-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Αναζήτηση με όνομα ή τηλέφωνο..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Tier Filter Chips */}
                <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1">
                  <span className="text-[11px] font-bold text-slate-500 mr-1">Score:</span>
                  {['ALL', 'A+', 'A', 'B', 'C'].map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setSelectedTierFilter(tier)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        selectedTierFilter === tier
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {tier === 'ALL' ? 'Όλοι' : `Κατηγορία ${tier}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customers Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-extrabold uppercase tracking-wider text-[10px]">
                      <th className="p-3">Ονοματεπώνυμο / Τηλέφωνο</th>
                      <th className="p-3 text-center">Credit Score</th>
                      <th className="p-3 text-right">Όριο Πίστωσης</th>
                      <th className="p-3 text-right">Τρέχουσα Οφειλή</th>
                      <th className="p-3 text-right">Διαθέσιμο Περιθώριο</th>
                      <th className="p-3 text-center">Ενέργειες</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400">
                          Δεν βρέθηκαν πελάτες με τα επιλεγμένα κριτήρια.
                        </td>
                      </tr>
                    ) : (
                      paginatedCustomers.map((cust) => {
                        const { limit, isUnlimited, tierConfig } = getCustomerCreditLimit(cust, tierConfigs);
                        const debt = cust.current_debt || 0;
                        const available = isUnlimited ? Infinity : Math.max(0, limit - debt);
                        const isOverLimit = !isUnlimited && debt > limit;

                        return (
                          <tr key={cust.id} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-slate-900 text-xs">{cust.name}</div>
                              {cust.phone && (
                                <div className="text-[11px] text-slate-500 flex items-center space-x-1 font-mono mt-0.5">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{cust.phone}</span>
                                </div>
                              )}
                              {cust.notes && (
                                <div className="text-[10px] text-slate-400 italic truncate max-w-[200px] mt-0.5">
                                  {cust.notes}
                                </div>
                              )}
                            </td>

                            <td className="p-3 text-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black border ${tierConfig.badgeBg} ${tierConfig.badgeBorder}`}
                              >
                                {cust.tier}
                              </span>
                            </td>

                            <td className="p-3 text-right font-mono font-bold text-slate-700">
                              {isUnlimited ? (
                                <span className="text-purple-700 font-black">Απεριόριστο</span>
                              ) : (
                                formatCurrency(limit)
                              )}
                            </td>

                            <td className="p-3 text-right font-mono">
                              <span
                                className={`font-black px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${
                                  debt > 0
                                    ? isOverLimit
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                                    : 'text-slate-500'
                                }`}
                              >
                                {isOverLimit && <AlertTriangle className="w-3 h-3 shrink-0" />}
                                {formatCurrency(debt)}
                                {isOverLimit && <span className="font-sans font-bold text-[9px] uppercase">Υπέρβαση</span>}
                              </span>
                            </td>

                            <td className="p-3 text-right font-mono">
                              {isUnlimited ? (
                                <span className="text-emerald-600 font-black">Άπειρο</span>
                              ) : (
                                <span
                                  className={`font-black inline-flex items-center gap-1 ${
                                    available <= 0
                                      ? 'text-rose-600 font-bold'
                                      : available < 50
                                      ? 'text-amber-600'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {formatCurrency(available)}
                                  {available <= 0 && <span className="font-sans font-bold text-[9px] uppercase">Μηδέν</span>}
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center space-x-1.5">
                                {onCustomerSelected && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onCustomerSelected(cust);
                                      onClose();
                                    }}
                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                                  >
                                    Επιλογή
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(cust)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                  title="Επεξεργασία"
                                  aria-label="Επεξεργασία"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                {isOwnerOrManager && (
                                  <button
                                    type="button"
                                    onClick={() => setCustomerToDelete({ id: cust.id, name: cust.name })}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    title="Διαγραφή"
                                    aria-label="Διαγραφή"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {filteredCustomers.length > CUSTOMERS_PAGE_SIZE && (
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                  <span>
                    {(pageSafe - 1) * CUSTOMERS_PAGE_SIZE + 1}-
                    {Math.min(pageSafe * CUSTOMERS_PAGE_SIZE, filteredCustomers.length)} από {filteredCustomers.length} πελάτες
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={pageSafe <= 1}
                      aria-label="Προηγούμενη σελίδα"
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-slate-700">Σελίδα {pageSafe} / {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={pageSafe >= totalPages}
                      aria-label="Επόμενη σελίδα"
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Tab 2: Tier Configuration (Owner/Manager Only) */}
          {activeTab === 'tier_settings' && isOwnerOrManager && (
            <div className="space-y-5">
              <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-start space-x-3 text-xs text-indigo-950">
                <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-extrabold text-sm">Πολιτική Πιστωτικών Ορίων Καταστήματος (Credit Score Rules)</p>
                  <p>
                    Ορίστε τα μέγιστα ποσά πίστωσης ανά κατηγορία. Όταν ένας πελάτης φτάσει το όριο της κατηγορίας του, το σύστημα <strong className="underline">αποκλείει αυτόματα</strong> νέα πίστωση, εκτός αν πραγματοποιηθεί προηγουμένως μερική ή ολική εξόφληση (Είσπραξη).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* A+ Tier Card */}
                <div className="p-4 rounded-2xl border-2 border-purple-200 bg-purple-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-200 text-purple-900 font-black text-xs border border-purple-300">
                      Κατηγορία A+ (VIP)
                    </span>
                    <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider">VIP Πελάτες</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Απευθύνεται σε VIP πελάτες υψηλής εμπιστοσύνης και τακτικούς παίκτες VLTs/Στοιχημάτων.
                  </p>
                  <div className="space-y-2 pt-2">
                    <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editTierLimits['A+'].isUnlimited}
                        onChange={(e) =>
                          setEditTierLimits({
                            ...editTierLimits,
                            'A+': { ...editTierLimits['A+'], isUnlimited: e.target.checked },
                          })
                        }
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <span>Απεριόριστο Όριο (Χωρίς πλαφόν)</span>
                    </label>

                    {!editTierLimits['A+'].isUnlimited && (
                      <div>
                        <label htmlFor="tier-limit-aplus" className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                          Ποσό Ορίου (€):
                        </label>
                        <input
                          id="tier-limit-aplus"
                          type="number"
                          value={editTierLimits['A+'].limit}
                          onChange={(e) =>
                            setEditTierLimits({
                              ...editTierLimits,
                              'A+': { ...editTierLimits['A+'], limit: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-mono font-bold text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* A Tier Card */}
                <div className="p-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-black text-xs border border-emerald-300">
                      Κατηγορία A (Υψηλή Εμπιστοσύνη)
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Τακτικοί</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Πελάτες που εξοφλούν σταθερά (π.χ. κάθε εβδομάδα ή τέλος του μήνα).
                  </p>
                  <div className="pt-2">
                    <label htmlFor="tier-limit-a" className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Ανώτατο Όριο Πίστωσης (€):
                    </label>
                    <div className="relative">
                      <input
                        id="tier-limit-a"
                        type="number"
                        value={editTierLimits['A'].limit}
                        onChange={(e) =>
                          setEditTierLimits({
                            ...editTierLimits,
                            A: { limit: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl font-mono font-bold text-xs"
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">€</span>
                    </div>
                  </div>
                </div>

                {/* B Tier Card */}
                <div className="p-4 rounded-2xl border-2 border-amber-200 bg-amber-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 font-black text-xs border border-amber-300">
                      Κατηγορία B (Βασικό Όριο)
                    </span>
                    <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Μεσαίο Ρίσκο</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Περιστασιακοί πελάτες ή νέα μέλη με περιορισμένο ιστορικό συναλλαγών.
                  </p>
                  <div className="pt-2">
                    <label htmlFor="tier-limit-b" className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Ανώτατο Όριο Πίστωσης (€):
                    </label>
                    <div className="relative">
                      <input
                        id="tier-limit-b"
                        type="number"
                        value={editTierLimits['B'].limit}
                        onChange={(e) =>
                          setEditTierLimits({
                            ...editTierLimits,
                            B: { limit: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl font-mono font-bold text-xs"
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">€</span>
                    </div>
                  </div>
                </div>

                {/* C Tier Card */}
                <div className="p-4 rounded-2xl border-2 border-rose-200 bg-rose-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-200 text-rose-900 font-black text-xs border border-rose-300">
                      Κατηγορία C (Αυστηρό / Περιορισμένο)
                    </span>
                    <span className="text-[10px] text-rose-700 font-bold uppercase tracking-wider">Υψηλό Ρίσκο</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Επισφαλείς πελάτες με καθυστερήσεις. Απαιτείται άμεση εξόφληση πριν από κάθε νέα κίνηση.
                  </p>
                  <div className="pt-2">
                    <label htmlFor="tier-limit-c" className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Ανώτατο Όριο Πίστωσης (€):
                    </label>
                    <div className="relative">
                      <input
                        id="tier-limit-c"
                        type="number"
                        value={editTierLimits['C'].limit}
                        onChange={(e) =>
                          setEditTierLimits({
                            ...editTierLimits,
                            C: { limit: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl font-mono font-bold text-xs"
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">€</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                {savedSuccess && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center space-x-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Τα όρια αποθηκεύτηκαν επιτυχώς!</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveTierLimits}
                  disabled={isSavingTiers}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingTiers ? 'Αποθήκευση...' : 'Αποθήκευση Ορίων Credit Score'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Edit / Add Customer Sub-Modal */}
        {isAddingNew && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <UserPlus className="w-5 h-5 text-indigo-600" />
                  <h4 className="font-black text-sm text-slate-900">
                    {editingCustomer ? 'Επεξεργασία Καρτέλας Πελάτη' : 'Νέα Καρτέλα Πελάτη'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  aria-label="Κλείσιμο"
                  className="text-slate-400 hover:text-slate-600 p-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="space-y-3.5">
                <div>
                  <label htmlFor="cust-name" className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Ονοματεπώνυμο Πελάτη *
                  </label>
                  <input
                    id="cust-name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="π.χ. Γιώργος Παπαδόπουλος"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 bg-white"
                  />
                </div>

                <div>
                  <label htmlFor="cust-phone" className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Τηλέφωνο Επικοινωνίας
                  </label>
                  <input
                    id="cust-phone"
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="π.χ. 697 123 4567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Κατηγορία Credit Score (Όριο) *
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['A+', 'A', 'B', 'C'] as CreditScoreTier[]).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setFormData({ ...formData, tier })}
                        className={`py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                          formData.tier === tier
                            ? tier === 'A+'
                              ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                              : tier === 'A'
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                              : tier === 'B'
                              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                              : 'bg-rose-600 text-white border-rose-700 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {formData.tier === 'A+' && 'A+: Απεριόριστο όριο (VIP πελάτης).'}
                    {formData.tier === 'A' && `A: Όριο έως ${tierConfigs['A']?.defaultLimit ?? 300} €.`}
                    {formData.tier === 'B' && `B: Όριο έως ${tierConfigs['B']?.defaultLimit ?? 100} €.`}
                    {formData.tier === 'C' && `C: Αυστηρό όριο έως ${tierConfigs['C']?.defaultLimit ?? 30} €.`}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cust-debt" className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Τρέχουσα Οφειλή (€)
                    </label>
                    <input
                      id="cust-debt"
                      type="number"
                      step="0.01"
                      value={formData.current_debt}
                      onChange={(e) => setFormData({ ...formData, current_debt: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label htmlFor="cust-custom-limit" className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Ειδικό Όριο (Προαιρετικό)
                    </label>
                    <input
                      id="cust-custom-limit"
                      type="number"
                      step="0.01"
                      placeholder="Default"
                      value={formData.custom_limit}
                      onChange={(e) => setFormData({ ...formData, custom_limit: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 bg-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="cust-notes" className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Σημειώσεις / Ιστορικό
                  </label>
                  <textarea
                    id="cust-notes"
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="π.χ. Τακτικός παίκτης Joker, εξοφλεί κάθε αρχή του μήνα..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 bg-white"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddingNew(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Ακύρωση
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCustomer}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSavingCustomer ? 'Αποθήκευση...' : editingCustomer ? 'Αποθήκευση Αλλαγών' : 'Δημιουργία Πελάτη'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Customer Confirmation Modal */}
        {customerToDelete && (
          <div
            className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
            onClick={() => setCustomerToDelete(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center space-x-3 text-rose-600">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <h4 className="text-base font-extrabold text-slate-900">Διαγραφή Πελάτη</h4>
              </div>
              <p className="text-xs text-slate-600">
                Είστε σίγουροι ότι θέλετε να διαγράψετε τον πελάτη «{customerToDelete.name}»; Το ιστορικό
                συναλλαγών του θα παραμείνει, αλλά η καρτέλα του θα διαγραφεί οριστικά.
              </p>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  disabled={isDeletingCustomer}
                  onClick={() => setCustomerToDelete(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Ακύρωση
                </button>
                <button
                  type="button"
                  disabled={isDeletingCustomer}
                  onClick={handleDeleteCustomer}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isDeletingCustomer ? (
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
    </div>
  );
};
