import { supabase } from './supabase.ts';
import { createAndSyncShiftExpense } from './moduleServices.ts';
import { TRANSFER_EXPENSE_CATEGORY } from '../lib/storeTransfer.ts';
import type { Shift } from '../types/index.ts';

/**
 * Cash moving between the company's own shops (0049).
 *
 * Two records, written in this order and for a reason: the expense row
 * first, because that is the money actually leaving a drawer and the till
 * has to reconcile whatever else happens; then the transfer, which is the
 * claim on the other shop and the thing somebody has to sign.
 *
 * If the second write fails the first still stands - the sending till is
 * correct, and what is missing is only the notification. The other way round
 * would leave a shop expecting money its sender never recorded.
 */

const TABLE = 'store_cash_transfers';

export interface StoreTransfer {
  id: string;
  organization_id: string;
  from_store_id: string;
  to_store_id: string;
  amount: number;
  notes: string | null;
  from_shift_id: string | null;
  from_expense_id: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  sent_by_user_id: string;
  sent_by_user_name: string | null;
  sent_at: string;
  settled_by_user_id: string | null;
  settled_by_user_name: string | null;
  settled_at: string | null;
  to_shift_id: string | null;
  rejection_reason: string | null;
}

export interface SendTransferInput {
  organization_id: string;
  from_store_id: string;
  to_store_id: string;
  amount: number;
  notes?: string;
  date?: string;
  user_id: string;
  user_name?: string;
}

export async function sendStoreTransfer(
  input: SendTransferInput,
  activeShift: Shift | null
): Promise<StoreTransfer> {
  const expense = await createAndSyncShiftExpense(
    {
      organization_id: input.organization_id,
      store_id: input.from_store_id,
      // Its own category, so the P&L can leave it out while the till still
      // counts the cash gone. See lib/storeTransfer.ts.
      category: TRANSFER_EXPENSE_CATEGORY,
      amount: input.amount,
      payment_method: 'CASH',
      recipient: input.to_store_id,
      notes: input.notes,
      date: input.date,
      created_by_user_id: input.user_id,
      created_by_user_name: input.user_name,
    } as any,
    activeShift
  );

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      organization_id: input.organization_id,
      from_store_id: input.from_store_id,
      to_store_id: input.to_store_id,
      amount: input.amount,
      notes: input.notes ?? null,
      from_shift_id: activeShift?.id ?? null,
      from_expense_id: expense?.id ?? null,
      sent_by_user_id: input.user_id,
      sent_by_user_name: input.user_name ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as StoreTransfer;
}

/** Waiting for this shop to sign. Shown, never counted - see acceptedIntoStore. */
export async function fetchIncomingTransfers(
  orgId: string,
  storeId: string
): Promise<StoreTransfer[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('organization_id', orgId)
    .eq('to_store_id', storeId)
    .order('sent_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoreTransfer[];
}

/** What this shop has sent, so the sender can see whether it was signed for. */
export async function fetchOutgoingTransfers(
  orgId: string,
  storeId: string
): Promise<StoreTransfer[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('organization_id', orgId)
    .eq('from_store_id', storeId)
    .order('sent_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoreTransfer[];
}

export interface SettleInput {
  user_id: string;
  user_name?: string;
  /** The shift the money lands on, when one is open. */
  shift_id?: string | null;
}

/**
 * Signing for it. Refused by the policy for anyone who is not elevated, so a
 * hidden button is courtesy rather than the control.
 */
export async function acceptStoreTransfer(
  id: string,
  input: SettleInput
): Promise<StoreTransfer> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: 'ACCEPTED',
      settled_by_user_id: input.user_id,
      settled_by_user_name: input.user_name ?? null,
      to_shift_id: input.shift_id ?? null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as StoreTransfer;
}

/**
 * Sending it back. The reason is required by the database too - without one
 * the sender has nothing to act on, which is the point of returning it.
 */
export async function rejectStoreTransfer(
  id: string,
  reason: string,
  input: SettleInput
): Promise<StoreTransfer> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: 'REJECTED',
      rejection_reason: reason.trim(),
      settled_by_user_id: input.user_id,
      settled_by_user_name: input.user_name ?? null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as StoreTransfer;
}

/** The sender taking back their own entry, before anybody has signed. */
export async function cancelStoreTransfer(id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ status: 'CANCELLED' })
    .eq('id', id);
  if (error) throw error;
}
