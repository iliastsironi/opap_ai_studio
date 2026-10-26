import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Store } from '../types/index.js';
import { useAuth } from './AuthContext.tsx';
import { fetchStoresFromFirestore } from '../services/storeService.ts';
import { isElevatedRole, visibleStores } from '../lib/storeAccess.ts';

interface TenantContextType {
  activeStoreId: string | 'ALL';
  setActiveStoreId: (id: string | 'ALL') => void;
  selectedStoreId: string | 'ALL';
  setSelectedStoreId: (id: string | 'ALL') => void;
  storeId: string | 'ALL';
  setStoreId: (id: string | 'ALL') => void;
  stores: Store[];
  isLoadingStores: boolean;
  refreshStores: () => Promise<void>;
  currentStore: Store | null;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, organization, isLoading: authLoading, roles, permissions, assignedStores } =
    useAuth();
  // The organisation's stores as fetched, before anyone's own reach is
  // applied. Nothing outside this file sees this list.
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | 'ALL'>('ALL');
  const [isLoadingStores, setIsLoadingStores] = useState<boolean>(false);

  // No `|| 'org_opap_demo'` here. This provider sits outside ProtectedLayout's
  // organisation guard, so it is the one place that genuinely has to cope with
  // not having one - and the honest answer is to fetch nothing rather than to
  // fetch a specific real agency's stores.
  const orgId = organization?.id ?? null;

  const refreshStores = async () => {
    if (!orgId) {
      setAllStores([]);
      return;
    }
    setIsLoadingStores(true);
    try {
      const fsStores = await fetchStoresFromFirestore(orgId);
      setAllStores(fsStores);
    } catch (err) {
      console.error('Failed to fetch stores:', err);
    } finally {
      setIsLoadingStores(false);
    }
  };

  useEffect(() => {
    // Wait for AuthContext to finish resolving the signed-in user's own
    // profile/org row first - firing earlier defaults orgId to the demo
    // org and races the seed insert against RLS's belongs_to_org() check,
    // which reads that very row (see syncUserProfile in AuthContext.tsx).
    if (authLoading) return;
    refreshStores();
  }, [token, organization, authLoading]);

  /**
   * The stores THIS person may work a till at.
   *
   * Filtered here rather than in each screen, because the screens that got it
   * wrong were the ones that never thought to ask: the store picker in the
   * top bar listed every shop in the organisation to everybody, so an
   * employee could switch to a shop they have never set foot in and open a
   * shift there. One rule, one place, and every consumer is right at once.
   */
  const elevated = isElevatedRole(roles, permissions);
  const stores = useMemo(
    () => visibleStores(allStores, assignedStores, elevated),
    [allStores, assignedStores, elevated]
  );

  // A store that was picked before - or carried over from another account on
  // this machine - can be one this person is not allowed to work at. Falling
  // back to «all of mine» beats leaving them pointed at a shop whose data
  // will not load and whose till they cannot open.
  useEffect(() => {
    if (activeStoreId === 'ALL') return;
    if (isLoadingStores || allStores.length === 0) return;
    if (!stores.some((s) => s.id === activeStoreId)) setActiveStoreId('ALL');
  }, [activeStoreId, stores, isLoadingStores, allStores.length]);

  const currentStore = stores.find((s) => s.id === activeStoreId) || null;

  return (
    <TenantContext.Provider
      value={{
        activeStoreId,
        setActiveStoreId,
        selectedStoreId: activeStoreId,
        setSelectedStoreId: setActiveStoreId,
        storeId: activeStoreId,
        setStoreId: setActiveStoreId,
        stores,
        isLoadingStores,
        refreshStores,
        currentStore,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

