/**
 * Which of the day's expenses belong to THIS shift and which it inherited.
 *
 * Expenses carry through a business day: the evening reconciles against the
 * morning's as well as its own, or its till reads over by their amount. But
 * they are not the evening operator's to edit - that is a closed shift's
 * record - so the closing screen collapses them into a read-only summary.
 *
 * Two ways an expense can be inherited, and the second is easy to miss:
 *
 *   - tied to a different shift, which is the obvious case; and
 *   - tied to no shift at all but entered before this one opened, which is
 *     what the Έξοδα screen produces when somebody records a purchase
 *     without a shift open. Treating those as the current shift's own would
 *     let an operator edit a figure from hours before they arrived.
 */

export interface CarryCandidate {
  shift_id?: string | null;
  created_at?: string | null;
}

export function isCarriedExpense(
  expense: CarryCandidate,
  currentShiftId: string,
  currentShiftOpenedAt: string | null | undefined
): boolean {
  if (expense.shift_id) return expense.shift_id !== currentShiftId;

  // Untied: it belongs to this shift only if it was entered after it opened.
  const openedAt = currentShiftOpenedAt ? new Date(currentShiftOpenedAt).getTime() : NaN;
  const createdAt = expense.created_at ? new Date(expense.created_at).getTime() : NaN;
  if (!Number.isFinite(openedAt) || !Number.isFinite(createdAt)) return false;

  return createdAt < openedAt;
}
