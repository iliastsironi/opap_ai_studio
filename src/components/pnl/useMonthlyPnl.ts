import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { MonthlyPnlResult, PnlStore, computeMonthlyPnl, shiftMonthKey } from '../../lib/pnlEngine.ts';
import { fetchMonthlyPnlInput } from '../../services/pnlService.ts';

export interface MonthlyPnlData {
  month: string;
  result: MonthlyPnlResult;
  previous: MonthlyPnlResult | null;
}

// Loads a month's P&L (and optionally the month before, for comparisons).
// A response for a month the user has already navigated away from is dropped.
export function useMonthlyPnl(month: string, { enabled = true, withPrevious = false } = {}) {
  const { organization } = useAuth();
  const { stores } = useTenant();
  const orgId = organization?.id;
  const storesKey = stores.map((s) => `${s.id}|${s.code}|${s.name}|${s.store_type}`).join(';');
  const pnlStores = useMemo<PnlStore[]>(
    () => stores.map((s) => ({ id: s.id, code: s.code, name: s.name, storeType: s.store_type })),
    // The context hands out a new array on every refresh; only real changes should refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storesKey]
  );

  const [data, setData] = useState<MonthlyPnlData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled || !orgId) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const months = withPrevious ? [month, shiftMonthKey(month, -1)] : [month];
      const inputs = await Promise.all(months.map((m) => fetchMonthlyPnlInput(orgId, m, pnlStores)));
      if (request !== requestRef.current) return;
      const [result, previous] = inputs.map(computeMonthlyPnl);
      setData({ month, result, previous: previous ?? null });
    } catch (err: any) {
      if (request === requestRef.current) setError(err.message || 'Η φόρτωση του P&L απέτυχε.');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [enabled, orgId, month, withPrevious, pnlStores]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
