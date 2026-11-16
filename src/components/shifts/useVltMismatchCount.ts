import { useEffect, useState } from 'react';
import { athensDateKey } from '../../lib/pnlEngine.ts';
import { buildVltDayRows, shiftDateKey, vltMismatches } from '../../lib/vltReportCheck.ts';
import { fetchVltCheckData } from '../../services/vltReportService.ts';

/** Πόσο πίσω κοιτάει η ένδειξη: το report έρχεται σε 1-2 μέρες, αλλά μια διαφορά δεν πρέπει να χάνεται μέσα σε μία εβδομάδα. */
export const VLT_ALERT_WINDOW_DAYS = 45;

/**
 * Πόσες ημέρες έχουν διαφορά VLT - για την ένδειξη πάνω στην καρτέλα.
 *
 * Μια ειδοποίηση που φαίνεται μόνο αν ανοίξεις την καρτέλα δεν ειδοποιεί κανέναν:
 * η ένδειξη μετράει στο παρασκήνιο και τη βλέπει όποιος κοιτάει τις βάρδιες.
 *
 * Δεν σπάει ποτέ την οθόνη που τη φιλοξενεί: αν αποτύχει, δεν δείχνει τίποτα (0).
 * `refreshKey` ξαναμετράει όταν αλλάζει - π.χ. όταν φεύγει ο χρήστης από την
 * καρτέλα, αφού μπορεί να έγραψε reports.
 */
export function useVltMismatchCount(
  enabled: boolean,
  orgId: string | undefined,
  storeId: string | null | undefined,
  refreshKey: unknown
): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled || !orgId) {
      setCount(0);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const to = athensDateKey(new Date().toISOString());
        const from = shiftDateKey(to, -VLT_ALERT_WINDOW_DAYS);
        const data = await fetchVltCheckData(orgId, storeId && storeId !== 'ALL' ? [storeId] : null, from, to);
        const rows = buildVltDayRows({ shifts: data.shifts, reports: data.reports }).filter(
          (r) => r.date >= from && r.date <= to
        );
        if (!cancelled) setCount(vltMismatches(rows).length);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, orgId, storeId, refreshKey]);

  return count;
}
