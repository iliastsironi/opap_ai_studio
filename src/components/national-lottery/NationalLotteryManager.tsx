import React, { useEffect, useState, useCallback } from 'react';
import { Landmark, Search, Loader2, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import {
  getActiveEdition,
  getNationalLotteryCustomers,
  searchNationalLotteryCustomers,
} from '../../services/nationalLotteryService.ts';
import { NationalLotteryEdition, NationalLotteryCustomer } from '../../types/index.ts';
import { NationalLotteryCustomerCard } from './NationalLotteryCustomerCard.tsx';
import { CustomerCreditDirectoryModal } from '../shifts/CustomerCreditDirectoryModal.tsx';

// Employee-facing: search -> customer card -> select draws -> collect.
// Owner-facing registry CRUD and edition rollover land in a follow-up PR
// on top of this.
export const NationalLotteryManager: React.FC = () => {
  const { organization, user, hasPermission } = useAuth();
  const { selectedStoreId, stores, currentStore } = useTenant();
  const orgId = organization?.id || 'org_opap_demo';
  const storeId = selectedStoreId && selectedStoreId !== 'ALL' ? selectedStoreId : stores[0]?.id;

  const canCollect = hasPermission('national_lottery.collect');
  const canReverse = hasPermission('national_lottery.reverse');
  const isOwnerOrManager = hasPermission('national_lottery.manage');

  const [edition, setEdition] = useState<NationalLotteryEdition | null>(null);
  const [customers, setCustomers] = useState<NationalLotteryCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<NationalLotteryCustomer | null>(null);
  const [tefteriSearch, setTefteriSearch] = useState<string | null>(null);

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
    setSelectedCustomer(null);
    load();
  }, [load]);

  const results = searchNationalLotteryCustomers(customers, query);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-black text-slate-900">Εθνικό Λαχείο</h1>
          <p className="text-xs text-slate-500">{currentStore ? currentStore.name : 'Επιλέξτε κατάστημα'}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση με όνομα, τηλέφωνο ή αριθμό λαχείου..."
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : (
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
                  onClick={() => setSelectedCustomer(c)}
                  className={`w-full text-left p-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50 ${
                    selectedCustomer?.id === c.id ? 'bg-indigo-50' : ''
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
                onOpenTefteri={(searchQuery) => setTefteriSearch(searchQuery)}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-400 shadow-2xs">
                Επιλέξτε συνδρομητή από τη λίστα αριστερά.
              </div>
            )}
          </div>
        </div>
      )}

      {tefteriSearch !== null && storeId && (
        <CustomerCreditDirectoryModal
          isOpen={tefteriSearch !== null}
          onClose={() => setTefteriSearch(null)}
          orgId={orgId}
          storeId={storeId}
          isOwnerOrManager={isOwnerOrManager}
          initialSearchQuery={tefteriSearch}
        />
      )}
    </div>
  );
};
