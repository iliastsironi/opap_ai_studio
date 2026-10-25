/**
 * Μετρητά που πάνε από μαγαζί σε μαγαζί.
 *
 * Today this is an ordinary expense with the other shop's code typed into
 * the recipient field. Three things are wrong with that, and all three are
 * money:
 *
 *   it is not an expense. The cash did not leave the company, it changed
 *   drawer - so the monthly P&L reports the company poorer by every transfer
 *   it ever made.
 *   the other shop never hears about it. The money arrives in somebody's
 *   hand and the receiving till knows nothing.
 *   nobody signs for it. A sum that size moving on one person's say-so
 *   leaves no record that the other end agreed.
 *
 * So it has two ends and a signature, and this file holds the rules that
 * decide what may happen to one. They live apart from the screens because
 * the same answers have to hold in the expense form, the receiving till and
 * the P&L, and because «who may sign» is not a thing to re-derive from a
 * role string in three places.
 */

export type TransferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

/**
 * The expense category a transfer is recorded under on the sending side.
 *
 * It IS an expense row - the drawer really did lose the cash, and the till
 * has to reconcile - but the P&L leaves this category out. See
 * isTransferCategory below and its use in pnlEngine.
 */
export const TRANSFER_EXPENSE_CATEGORY = 'STORE_TRANSFER';

export function isTransferCategory(category: unknown): boolean {
  return category === TRANSFER_EXPENSE_CATEGORY;
}

/** Still waiting for the other end. Money in neither till. */
export function isPending(status: unknown): boolean {
  return status === 'PENDING';
}

export function isSettled(status: unknown): boolean {
  return status === 'ACCEPTED' || status === 'REJECTED' || status === 'CANCELLED';
}

export interface Signer {
  /** 'OWNER', 'MANAGER', 'EMPLOYEE', … as the app's roles are written. */
  roleCode?: unknown;
  isElevated?: boolean;
}

/**
 * Who may sign for arriving cash: a manager or the owner, by the Owner's
 * rule. An employee sees the transfer and cannot settle it.
 *
 * `isElevated` is what the database policy actually enforces; the role code
 * is the fallback for a screen that only has that to go on. Hiding a button
 * is courtesy - the policy is the enforcement.
 */
export function canSettleTransfer(signer: Signer | null | undefined): boolean {
  if (!signer) return false;
  if (signer.isElevated === true) return true;
  const role = String(signer.roleCode ?? '').toUpperCase();
  return role === 'OWNER' || role === 'MANAGER' || role === 'PLATFORM_ADMIN';
}

export interface TransferLike {
  status?: unknown;
  amount?: unknown;
  to_store_id?: unknown;
  from_store_id?: unknown;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

/**
 * What an arriving transfer adds to a store's float, which is nothing until
 * somebody signs for it.
 *
 * This is the whole point of the pending state: an operator is never asked
 * to account for money they have not seen, and no shortage is charged to
 * anybody over cash that has not arrived.
 */
export function acceptedIntoStore(
  transfers: TransferLike[] | null | undefined,
  storeId: unknown
): number {
  return round2(
    (transfers ?? [])
      .filter((t) => t.status === 'ACCEPTED' && t.to_store_id === storeId)
      .reduce((sum, t) => sum + Math.max(0, num(t.amount)), 0)
  );
}

/** Waiting for this store to sign. Shown, never counted. */
export function pendingForStore(
  transfers: TransferLike[] | null | undefined,
  storeId: unknown
): TransferLike[] {
  return (transfers ?? []).filter((t) => isPending(t.status) && t.to_store_id === storeId);
}

export interface SettlementAttempt {
  status: unknown;
  /** What the receiving side is trying to do. */
  action: 'ACCEPT' | 'REJECT' | 'CANCEL';
  signer?: Signer | null;
  /** Required for a rejection. */
  reason?: unknown;
}

export interface SettlementCheck {
  allowed: boolean;
  /** Why not, in the words the operator should see. */
  problem?: string;
}

export function checkSettlement(attempt: SettlementAttempt): SettlementCheck {
  if (isSettled(attempt.status)) {
    return { allowed: false, problem: 'Η μεταφορά έχει ήδη κλείσει.' };
  }
  if (!isPending(attempt.status)) {
    return { allowed: false, problem: 'Η μεταφορά δεν είναι σε εκκρεμότητα.' };
  }
  // Cancelling is the sender taking back their own entry, not a signature.
  if (attempt.action !== 'CANCEL' && !canSettleTransfer(attempt.signer)) {
    return {
      allowed: false,
      problem: 'Μόνο διευθυντής ή ιδιοκτήτης μπορεί να αποδεχτεί ή να απορρίψει.',
    };
  }
  if (attempt.action === 'REJECT' && String(attempt.reason ?? '').trim() === '') {
    // Without one the sender has nothing to act on, which is the whole
    // reason a rejection goes back to them.
    return { allowed: false, problem: 'Γράψτε τον λόγο της απόρριψης.' };
  }
  return { allowed: true };
}
