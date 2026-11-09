import { useCallback, useEffect, useState } from 'react';
import { BUILTIN_EXPENSE_CATEGORIES, ExpenseCategoryDef, activeCategories } from '../../lib/expenseCategories.ts';
import { fetchExpenseCategories } from '../../services/pnlService.ts';

/**
 * Οι κατηγορίες εξόδων του οργανισμού, για κάθε οθόνη που τις προσφέρει.
 *
 * Ξεκινάει από τις ενσωματωμένες ώστε το dropdown να μην είναι ποτέ άδειο
 * στο πρώτο render - μια φόρμα εξόδου με κενή λίστα κατηγοριών δεν
 * αποθηκεύει τίποτα, και ο χρήστης δεν έχει τρόπο να καταλάβει γιατί.
 */
export function useExpenseCategories(orgId: string | null | undefined) {
  const [categories, setCategories] = useState<ExpenseCategoryDef[]>(BUILTIN_EXPENSE_CATEGORIES);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      setCategories(await fetchExpenseCategories(orgId));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    if (!orgId) return;
    (async () => {
      const list = await fetchExpenseCategories(orgId).catch(() => BUILTIN_EXPENSE_CATEGORIES);
      if (!cancelled) setCategories(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { categories, options: activeCategories(categories), loading, reload };
}
