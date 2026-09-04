import React, { createContext, useContext, useEffect, useState } from 'react';
import { Store } from '../types/index.js';
import { useAuth } from './AuthContext.tsx';
import { fetchStoresFromFirestore } from '../services/storeService.ts';

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
  const { token, organization, isLoading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | 'ALL'>('ALL');
  const [isLoadingStores, setIsLoadingStores] = useState<boolean>(false);

  const orgId = organization?.id || 'org_opap_demo';

  const refreshStores = async () => {
    setIsLoadingStores(true);
    try {
      const fsStores = await fetchStoresFromFirestore(orgId);
      setStores(fsStores);
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

