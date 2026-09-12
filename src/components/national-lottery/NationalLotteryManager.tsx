import React, { useEffect, useState, useCallback } from 'react';
import { Landmark, Search, Loader2, User, Plus, RefreshCcw, ArrowDownAZ, Hash } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import {
  getActiveEdition,
  getNationalLotteryCustomers,
  searchNationalLotteryCustomers,
  getNationalLotteryShiftContribution,
} from '../../services/nationalLotteryService.ts';
import { fetchActiveShiftFromFirestore } from '../../services/shiftService.ts';
import { NationalLotteryEdition, NationalLotteryCustomer } from '../../types/index.ts';
import { NationalLotteryCustomerCard } from './NationalLotteryCustomerCard.tsx';
import { NationalLotteryCustomerFormModal } from './NationalLotteryCustomerFormModal.tsx';
import { NationalLotteryEditionRolloverModal } from './NationalLotteryEditionRolloverModal.tsx';
import { NationalLotteryDashboard } from './NationalLotteryDashboard.tsx';
import { CustomerCreditDirectoryModal } from '../shifts/CustomerCreditDirectoryModal.tsx';
import { formatCurrency } from '../../lib/formatters.ts';

type SortMode = 'NUMBER' | 'NAME';
const SORT_MODE_STORAGE_KEY = 'shiftledger_national_lottery_sort_mode';

function loadSortMode(): SortMode {
  try {
    const saved = localStorage.getItem(SORT_MODE_STORAGE_KEY);
    return saved === 'NAME' ? 'NAME' : 'NUMBER';
  } catch {
    return 'NUMBER';
  }
}

// Employee-facing search -> card -> collect flow, plus (permission-gated)
// Owner/Manager registry CRUD, edition rollover, and a live dashboard.
export const NationalLotteryManager: React.FC = () => {
  const { organization, user, hasPermission } = useAuth();
  const { selectedStoreId, stores, currentStore } = useTenant();
  const orgId = organization?.id || 'org_opap_demo';
  const storeId = selectedStoreId && selectedStoreId !== 'ALL' ? selectedStoreId : stores[0]?.id;

  const canCollect = hasPermission('national_lottery.collect');
  const canReverse = hasPermission('national_lottery.reverse');
  const canManage = hasPermission('national_lottery.manage');
  const canManageEditions = hasPermission('national_lottery.edition.manage');

  const [edition, setEdition] = useState<NationalLotteryEdition | null>(null);
  const [customers, setCustomers] = useState<NationalLotteryCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [tefteriSearch, setTefteriSearch] = useState<string | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<NationalLotteryCustomer | null>(null);
  const [showRolloverModal, setShowRolloverModal] = useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>(loadSortMode);
  const [openShiftContribution, setOpenShiftContribution] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [activeEdition, customerList] = await Promise.all([
      getActiveEdition(orgId, storeId),
      getNationalLotteryCustomers(orgId, storeId, 'ACTIVE'),
    ]);
    setEdition(activeEdition);
    setCustomers(customerList);
    setLoading(false);
  }, [orgId, storeId]);

  useEffect(() => {
    setSelectedCustomerId(null);
    load();
  }, [load]);

  // Live "this is already in today's register" confirmation, visible right
  // where the collection happens instead of only surfacing at shift-close
  // time (ShiftClosingWizard already computes this same total there via
  // getNationalLotteryShiftContribution - this is purely an earlier,
  // additional read of the identical live number, not a second source).
  useEffect(() => {
    let cancelled = false;
    if (!storeId) {
      setOpenShiftContribution(null);
      return;
    }
    (async () => {
      try {
        const openShift = await fetchActiveShiftFromFirestore(orgId, storeId);
        if (cancelled) return;
        if (!openShift) {
          setOpenShiftContribution(null);
          return;
        }
        const contribution = await getNationalLotteryShiftContribution(openShift.id);
        if (!cancelled) setOpenShiftContribution(contribution);
      } catch (err) {
        console.warn('[NationalLotteryManager] Could not load live shift contribution:', err);
        if (!cancelled) setOpenShiftContribution(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, storeId, dashboardRefreshKey]);

  const results = [...searchNationalLotteryCustomers(customers, query)].sort((a, b) => {
    if (sortMode === 'NAME') return a.full_name.localeCompare(b.full_name, 'el');
    // Numeric sort with blanks/non-numeric last, not first (they'd otherwise
    // sort as 0 and jump to the top ahead of every real lottery number).
    const numA = parseInt(a.lottery_number || '', 10);
    const numB = parseInt(b.lottery_number || '', 10);
    if (isNaN(numA) && isNaN(numB)) return 0;
    if (isNaN(numA)) return 1;
    if (isNaN(numB)) return -1;
    return numA - numB;
  });
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  const handleSetSortMode = (mode: SortMode) => {
    setSortMode(mode);
    try {
      localStorage.setItem(SORT_MODE_STORAGE_KEY, mode);
    } catch {
      // Best-effort only - a non-persisted preference isn't worth surfacing an error for.
    }
  };

  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setShowCustomerForm(true);
  };

  const handleOpenEdit = (customer: NationalLotteryCustomer) => {
    setEditingCustomer(customer);
    setShowCustomerForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">Εθνικό Λαχείο</h1>
            <p className="text-xs text-slate-500">{currentStore ? currentStore.name : 'Επιλέξτε κατάστημα'}</p>
          </div>
          {openShiftContribution !== null && (
            <span
              className="ml-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-bold shrink-0"
              title="Το ποσό που έχει ήδη μπει στο ανοιχτό ταμείο της τρέχουσας βάρδιας από παραλαβές Εθνικού Λαχείου"
            >
              Στο σημερινό ταμείο: {formatCurrency(openShiftContribution)}
            </span>
          )}
        </div>
        {canManageEditions && storeId && (
          <button
            type="button"
            onClick={() => setShowRolloverModal(true)}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Νέα Έκδοση
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : (
        <>
          {edition && <NationalLotteryDashboard edition={edition} refreshKey={dashboardRefreshKey} />}

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Αναζήτηση με όνομα, τηλέφωνο ή αριθμό λαχείου..."
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center bg-slate-100 rounded-xl p-1 shrink-0" role="group" aria-label="Ταξινόμηση λίστας συνδρομητών">
              <button
                type="button"
                onClick={() => handleSetSortMode('NUMBER')}
                aria-pressed={sortMode === 'NUMBER'}
                title="Ταξινόμηση κατά αύξοντα αριθμό λαχείου"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all ${
                  sortMode === 'NUMBER' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Αριθμός</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetSortMode('NAME')}
                aria-pressed={sortMode === 'NAME'}
                title="Αλφαβητική ταξινόμηση κατά όνομα"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all ${
                  sortMode === 'NAME' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ArrowDownAZ className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Όνομα</span>
              </button>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Νέος Συνδρομητής
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-2xs divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {results.length === 0 ? (
                <p className="p-6 text-sm text-slate-400 text-center">
                  {query ? 'Δεν βρέθηκαν συνδρομητές.' : 'Δεν υπάρχουν ενεργοί συνδρομητές σε αυτό το κατάστημα ακόμα.'}
                </p>
              ) : (
                results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCustomerId(c.id)}
                    className={`w-full text-left p-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50 ${
                      selectedCustomerId === c.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{c.full_name}</p>
                      <p className="text-micro text-slate-400">
                        {c.participation_type === 'FIVE' ? '5άδα' : '10άδα'}
                        {c.lottery_number ? ` · ${c.lottery_number}` : ''}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="lg:col-span-2">
              {selectedCustomer && storeId ? (
                <NationalLotteryCustomerCard
                  customer={selectedCustomer}
                  edition={edition}
                  orgId={orgId}
                  storeId={storeId}
                  actorUserId={user?.id || ''}
                  canCollect={canCollect}
                  canReverse={canReverse}
                  canManage={canManage}
                  onOpenTefteri={(searchQuery) => setTefteriSearch(searchQuery)}
                  onEdit={() => handleOpenEdit(selectedCustomer)}
                  onCustomerChanged={() => {
                    load();
                    setDashboardRefreshKey((k) => k + 1);
                  }}
                />
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-400 shadow-2xs">
                  Επιλέξτε συνδρομητή από τη λίστα αριστερά.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showCustomerForm && storeId && (
        <NationalLotteryCustomerFormModal
          isOpen={showCustomerForm}
          onClose={() => setShowCustomerForm(false)}
          orgId={orgId}
          storeId={storeId}
          editingCustomer={editingCustomer}
          activeEdition={edition}
          onSaved={load}
        />
      )}

      {showRolloverModal && storeId && (
        <NationalLotteryEditionRolloverModal
          isOpen={showRolloverModal}
          onClose={() => setShowRolloverModal(false)}
          orgId={orgId}
          storeId={storeId}
          currentEdition={edition}
          actorUserId={user?.id || ''}
          onSuccess={() => {
            load();
            setDashboardRefreshKey((k) => k + 1);
          }}
        />
      )}

      {tefteriSearch !== null && storeId && (
        <CustomerCreditDirectoryModal
          isOpen={tefteriSearch !== null}
          onClose={() => setTefteriSearch(null)}
          orgId={orgId}
          storeId={storeId}
          isOwnerOrManager={canManage}
          initialSearchQuery={tefteriSearch}
        />
      )}
    </div>
  );
};
