import React, { useEffect, useState } from 'react';
import { Landmark, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { getActiveEdition } from '../../services/nationalLotteryService.ts';
import { NationalLotteryEdition } from '../../types/index.ts';

// Shell only for now - proves the route/permission/service wiring end to
// end (fetches the store's real active edition via the RLS-guarded
// national_lottery_editions table). The customer registry, collection
// flow, and edition management UI land in follow-up PRs on top of this.
export const NationalLotteryManager: React.FC = () => {
  const { organization } = useAuth();
  const { selectedStoreId, stores, currentStore } = useTenant();
  const orgId = organization?.id || 'org_opap_demo';
  const storeId = selectedStoreId && selectedStoreId !== 'ALL' ? selectedStoreId : stores[0]?.id;

  const [edition, setEdition] = useState<NationalLotteryEdition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getActiveEdition(orgId, storeId).then((result) => {
      if (!cancelled) {
        setEdition(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, storeId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-black text-slate-900">Εθνικό Λαχείο</h1>
          <p className="text-xs text-slate-500">
            {currentStore ? currentStore.name : 'Επιλέξτε κατάστημα'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-2xs">
        {loading ? (
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin mx-auto" />
        ) : edition ? (
          <>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Τρέχουσα Έκδοση</p>
            <p className="text-2xl font-black text-slate-900">{edition.label}</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">Δεν υπάρχει ενεργή έκδοση για αυτό το κατάστημα ακόμα.</p>
        )}
        <p className="text-xs text-slate-400 pt-2">
          Το μητρώο συνδρομητών και η καταχώρηση παραλαβών θα προστεθούν σύντομα.
        </p>
      </div>
    </div>
  );
};
