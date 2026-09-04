import React, { useState } from 'react';
import {
  UserCheck,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sliders,
  Users,
  Search,
  ChevronDown,
  Phone,
  DollarSign,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  Lock,
  Unlock,
} from 'lucide-react';
import { Customer, CustomerCredit, CreditScoreTier, CreditTierConfig } from '../../types/index.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import {
  getCustomers,
  getStoreCreditTierConfigs,
  validateCustomerCreditGrant,
  getCustomerCreditLimit,
  findCustomer,
  saveCustomer,
} from '../../services/customerCreditService.ts';
import { CustomerCreditDirectoryModal } from './CustomerCreditDirectoryModal.tsx';

interface CustomerCreditSectionProps {
  customerCredits: Array<Partial<CustomerCredit>>;
  onChangeCredits: (updated: Array<Partial<CustomerCredit>>) => void;
  storeId?: string;
  readOnly?: boolean;
  isOwnerOrManager?: boolean;
}

export const CustomerCreditSection: React.FC<CustomerCreditSectionProps> = ({
  customerCredits,
  onChangeCredits,
  storeId,
  readOnly = false,
  isOwnerOrManager = false,
}) => {
  const [directoryModalOpen, setDirectoryModalOpen] = useState(false);
  const [managerBypassEnabled, setManagerBypassEnabled] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>(() => getCustomers(storeId));
  const [tierConfigs, setTierConfigs] = useState<Record<CreditScoreTier, CreditTierConfig>>(() =>
    getStoreCreditTierConfigs(storeId)
  );

  // Quick customer create inside row
  const [quickCreateOpenIdx, setQuickCreateOpenIdx] = useState<number | null>(null);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickTier, setQuickTier] = useState<CreditScoreTier>('B');

  const refreshCustomers = () => {
    setCustomers(getCustomers(storeId));
    setTierConfigs(getStoreCreditTierConfigs(storeId));
  };

  const handleAddCredit = () => {
    if (readOnly) return;
    const newCredit: Partial<CustomerCredit> = {
      id: `cred_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      customer_id: '',
      customer_name: '',
      customer_tier: 'B',
      type: 'GRANTED',
      amount: 0,
      notes: '',
      created_at: new Date().toISOString(),
    };
    onChangeCredits([...customerCredits, newCredit]);
  };

  const handleRemoveCredit = (index: number) => {
    if (readOnly) return;
    const updated = customerCredits.filter((_, i) => i !== index);
    onChangeCredits(updated);
  };

  const handleUpdateCredit = (index: number, field: keyof CustomerCredit, value: any) => {
    if (readOnly) return;
    const updated = [...customerCredits];
    const item = { ...updated[index], [field]: value };

    // If customer name or id is selected from directory, sync tier & id
    if (field === 'customer_id' || field === 'customer_name') {
      const found = customers.find(
        (c) => c.id === value || c.name.toLowerCase() === String(value).trim().toLowerCase()
      );
      if (found) {
        item.customer_id = found.id;
        item.customer_name = found.name;
        item.customer_tier = found.tier;
      }
    }

    updated[index] = item;
    onChangeCredits(updated);
  };

  const handleQuickCreateCustomer = (index: number) => {
    if (!quickName.trim()) return;
    const newCust = saveCustomer({
      name: quickName.trim(),
      phone: quickPhone.trim(),
      tier: quickTier,
      store_id: storeId || 'store_opap_01',
      current_debt: 0,
    });
    refreshCustomers();

    handleUpdateCredit(index, 'customer_id', newCust.id);
    handleUpdateCredit(index, 'customer_name', newCust.name);
    handleUpdateCredit(index, 'customer_tier', newCust.tier);

    setQuickCreateOpenIdx(null);
    setQuickName('');
    setQuickPhone('');
    setQuickTier('B');
  };

  // Financial summary
  const totalGranted = customerCredits
    .filter((c) => c.type === 'GRANTED')
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  const totalCollected = customerCredits
    .filter((c) => c.type === 'COLLECTED')
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  return (
    <div className="space-y-4 pt-2">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
            <UserCheck className="w-4 h-4 text-indigo-600" />
            <span>Πιστώσεις & Εισπράξεις</span>
          </h4>
        </div>

        {!readOnly && (
          <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-1">
            <button
              type="button"
              onClick={() => {
                refreshCustomers();
                setDirectoryModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
              title="Καρτέλες Πελατών"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Καρτέλες Πελατών</span>
            </button>

            {isOwnerOrManager && (
              <button
                type="button"
                onClick={() => setManagerBypassEnabled(!managerBypassEnabled)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                  managerBypassEnabled
                    ? 'bg-amber-500 text-slate-950 border border-amber-600 shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
                title="Παράκαμψη ορίου πίστωσης"
              >
                {managerBypassEnabled ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{managerBypassEnabled ? 'Παράκαμψη (Ενεργή)' : 'Παράκαμψη'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleAddCredit}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center space-x-1 shadow-2xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Προσθήκη</span>
            </button>
          </div>
        )}
      </div>

      {/* Summary KPI Pills */}
      {(totalGranted > 0 || totalCollected > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ArrowUpRight className="w-4 h-4 text-amber-700" />
              <span className="text-xs font-bold text-amber-900">Νέες Πιστώσεις (Χρέωση):</span>
            </div>
            <span className="text-xs font-mono font-black text-amber-900">+{formatCurrency(totalGranted)}</span>
          </div>

          <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ArrowDownRight className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-bold text-emerald-900">Εισπράξεις (Εξόφληση):</span>
            </div>
            <span className="text-xs font-mono font-black text-emerald-900">-{formatCurrency(totalCollected)}</span>
          </div>

          <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-4 h-4 text-indigo-700" />
              <span className="text-xs font-bold text-indigo-900">Καθαρή Επίπτωση Ταμείου:</span>
            </div>
            <span className="text-xs font-mono font-black text-indigo-950">
              {formatCurrency(totalGranted - totalCollected)}
            </span>
          </div>
        </div>
      )}

      {/* Credit Items List */}
      {customerCredits.length === 0 ? (
        <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
          <UserCheck className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-500 font-medium">
            Δεν έχουν καταχωρηθεί πιστώσεις ή εισπράξεις πελατών για αυτή τη βάρδια.
          </p>
          {!readOnly && (
            <button
              type="button"
              onClick={handleAddCredit}
              className="inline-flex items-center space-x-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Καταχώρηση Πρώτης Πίστωσης</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {customerCredits.map((cred, idx) => {
            const customerObj = customers.find(
              (c) => c.id === cred.customer_id || c.name.toLowerCase() === cred.customer_name?.trim().toLowerCase()
            );

            const amount = Number(cred.amount) || 0;
            const isGranted = cred.type === 'GRANTED' || !cred.type;

            let validationResult = customerObj
              ? validateCustomerCreditGrant(customerObj, amount, tierConfigs)
              : null;

            const isOverLimit =
              isGranted &&
              validationResult &&
              !validationResult.allowed &&
              !managerBypassEnabled;

            return (
              <div
                key={cred.id || idx}
                className={`p-4 rounded-2xl border transition-all space-y-3 ${
                  isOverLimit
                    ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-200'
                    : isGranted
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-emerald-50/40 border-emerald-200'
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  {/* Customer Selection */}
                  <div className="sm:col-span-4">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">
                      Πελάτης (Λίστα & Score)
                    </label>

                    {readOnly ? (
                      <div className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                        <span>{cred.customer_name || '-'}</span>
                        {cred.customer_tier && (
                          <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-black font-mono">
                            {cred.customer_tier}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <select
                          value={cred.customer_id || cred.customer_name || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__ADD_NEW__') {
                              setQuickCreateOpenIdx(idx);
                              return;
                            }
                            handleUpdateCredit(idx, 'customer_id', val);
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">-- Επιλέξτε Πελάτη --</option>
                          {customers.map((c) => {
                            const { limit, isUnlimited } = getCustomerCreditLimit(c, tierConfigs);
                            return (
                              <option key={c.id} value={c.id}>
                                {c.name} [{c.tier}] - Οφειλή: {(c.current_debt || 0).toFixed(0)}€ (Όριο:{' '}
                                {isUnlimited ? 'Άπειρο' : `${limit.toFixed(0)}€`})
                              </option>
                            );
                          })}
                          <option value="__ADD_NEW__">➕ + Νέος Πελάτης...</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Transaction Type */}
                  <div className="sm:col-span-4">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">
                      Τύπος Κίνησης
                    </label>
                    {readOnly ? (
                      <span className="text-xs font-bold text-slate-800">
                        {cred.type === 'COLLECTED' ? 'Είσπραξη (Εξόφληση)' : 'Νέα Πίστωση (Χρέωση)'}
                      </span>
                    ) : (
                      <select
                        value={cred.type || 'GRANTED'}
                        onChange={(e) =>
                          handleUpdateCredit(idx, 'type', e.target.value as 'GRANTED' | 'COLLECTED')
                        }
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${
                          cred.type === 'COLLECTED'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="GRANTED">Νέα Πίστωση (Χρέωση Πελάτη)</option>
                        <option value="COLLECTED">Είσπραξη Πίστωσης (Εξόφληση / Μείωση Οφειλής)</option>
                      </select>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">
                      Ποσό (€)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        disabled={readOnly}
                        placeholder="0.00"
                        value={cred.amount || ''}
                        onChange={(e) =>
                          handleUpdateCredit(idx, 'amount', parseFloat(e.target.value) || 0)
                        }
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-black font-mono ${
                          isOverLimit
                            ? 'bg-rose-50 border-rose-400 text-rose-950 focus:ring-rose-500'
                            : 'bg-white border-slate-300 text-slate-900 focus:ring-indigo-500'
                        }`}
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">€</span>
                    </div>
                  </div>

                  {/* Remove action */}
                  {!readOnly && (
                    <div className="sm:col-span-1 flex justify-end pt-4 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => handleRemoveCredit(idx)}
                        className="p-2 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer rounded-lg hover:bg-rose-50"
                        title="Διαγραφή γραμμής"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Customer Registration Form if selected */}
                {quickCreateOpenIdx === idx && (
                  <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-200 space-y-2 mt-2">
                    <div className="flex items-center justify-between text-xs font-black text-indigo-900">
                      <span>Γρήγορη Εγγραφή Νέου Πελάτη</span>
                      <button
                        type="button"
                        onClick={() => setQuickCreateOpenIdx(null)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Ονοματεπώνυμο..."
                        value={quickName}
                        onChange={(e) => setQuickName(e.target.value)}
                        className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                      />
                      <input
                        type="text"
                        placeholder="Τηλέφωνο..."
                        value={quickPhone}
                        onChange={(e) => setQuickPhone(e.target.value)}
                        className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                      />
                      <select
                        value={quickTier}
                        onChange={(e) => setQuickTier(e.target.value as CreditScoreTier)}
                        className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                      >
                        <option value="A+">A+ (VIP / Απεριόριστο)</option>
                        <option value="A">A (Υψηλή Εμπιστοσύνη - 300€)</option>
                        <option value="B">B (Βασικό Όριο - 100€)</option>
                        <option value="C">C (Αυστηρό Όριο - 30€)</option>
                      </select>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleQuickCreateCustomer(idx)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                      >
                        Αποθήκευση & Επιλογή
                      </button>
                    </div>
                  </div>
                )}

                {/* Customer Status & Limit Feedback Pill */}
                {customerObj && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 text-xs">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                          tierConfigs[customerObj.tier]?.badgeBg || 'bg-slate-100 text-slate-800'
                        } ${tierConfigs[customerObj.tier]?.badgeBorder || 'border-slate-300'}`}
                      >
                        Score: {customerObj.tier} ({tierConfigs[customerObj.tier]?.isUnlimited ? 'Απεριόριστο' : `Όριο: ${tierConfigs[customerObj.tier]?.defaultLimit}€`})
                      </span>

                      <span className="text-[11px] text-slate-600 font-semibold">
                        Τρέχουσα Οφειλή: <strong className="font-mono text-slate-900">{formatCurrency(customerObj.current_debt || 0)}</strong>
                      </span>

                      {!tierConfigs[customerObj.tier]?.isUnlimited && (
                        <span className="text-[11px] text-slate-600 font-semibold">
                          • Διαθέσιμο Περιθώριο:{' '}
                          <strong
                            className={`font-mono ${
                              validationResult && validationResult.availableCredit <= 0
                                ? 'text-rose-600 font-black'
                                : 'text-emerald-700 font-black'
                            }`}
                          >
                            {formatCurrency(validationResult ? validationResult.availableCredit : 0)}
                          </strong>
                        </span>
                      )}
                    </div>

                    {/* Transaction Outcome Badge */}
                    {amount > 0 && (
                      <div className="text-[11px] font-mono font-bold">
                        {isGranted ? (
                          <span className={isOverLimit ? 'text-rose-700 font-black' : 'text-amber-900'}>
                            Νέο Σύνολο Οφειλής: {formatCurrency((customerObj.current_debt || 0) + amount)}
                          </span>
                        ) : (
                          <span className="text-emerald-800 font-black">
                            Νέο Υπόλοιπο μετά την Είσπραξη: {formatCurrency(Math.max(0, (customerObj.current_debt || 0) - amount))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Overlimit Warning Banner */}
                {isOverLimit && validationResult && (
                  <div className="p-2.5 bg-rose-100/90 border border-rose-300 rounded-xl flex items-start space-x-2 text-xs text-rose-900 font-medium">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-black">
                        Απαγόρευση Πίστωσης - Υπέρβαση Ορίου ({customerObj?.tier})!
                      </strong>
                      <span>{validationResult.errorMessage}</span>
                    </div>
                  </div>
                )}

                {/* Optional note field */}
                <div>
                  <input
                    type="text"
                    disabled={readOnly}
                    placeholder="Προαιρετική σημείωση (π.χ. ΚΙΝΟ 3 δελτία, εξόφληση μετρητά)..."
                    value={cred.notes || ''}
                    onChange={(e) => handleUpdateCredit(idx, 'notes', e.target.value)}
                    className="w-full px-2.5 py-1 text-xs text-slate-700 bg-white/70 border border-slate-200 rounded-lg focus:bg-white"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Directory & Tier Settings Modal */}
      <CustomerCreditDirectoryModal
        isOpen={directoryModalOpen}
        onClose={() => {
          setDirectoryModalOpen(false);
          refreshCustomers();
        }}
        storeId={storeId}
        isOwnerOrManager={isOwnerOrManager}
        onCustomerSelected={(selected) => {
          handleAddCredit();
          setTimeout(() => {
            const lastIdx = customerCredits.length;
            handleUpdateCredit(lastIdx, 'customer_id', selected.id);
            handleUpdateCredit(lastIdx, 'customer_name', selected.name);
            handleUpdateCredit(lastIdx, 'customer_tier', selected.tier);
          }, 50);
        }}
      />
    </div>
  );
};
