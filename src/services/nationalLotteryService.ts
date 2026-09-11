import { supabase, handleSupabaseError, OperationType, cleanData } from './supabase.ts';
import { fetchActiveShiftFromFirestore } from './shiftService.ts';
import {
  NationalLotteryCustomer,
  NationalLotteryEdition,
  NationalLotteryCustomerEdition,
  NationalLotteryDrawCollection,
  NationalLotteryDrawCode,
  NationalLotteryDrawStatus,
  NationalLotteryParticipationType,
  NATIONAL_LOTTERY_DRAW_CODES,
} from '../types/index.ts';

const CUSTOMERS_TABLE = 'national_lottery_customers';
const EDITIONS_TABLE = 'national_lottery_editions';
const CUSTOMER_EDITIONS_TABLE = 'national_lottery_customer_editions';
const COLLECTIONS_TABLE = 'national_lottery_draw_collections';

const OPEN_SHIFT_STATUSES = ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'];

// Non-authoritative - for instant UI preview before the confirm click only.
// The actual charge is always whatever trg_nl_draw_collections_pricing
// (0013_national_lottery_schema.sql) computes server-side; the frontend
// must re-read the real `amount` from the inserted row on success, never
// assume this preview number was what got charged.
export const NATIONAL_LOTTERY_DISPLAY_PRICES: Record<NationalLotteryParticipationType, number> = {
  FIVE: 20,
  TEN: 40,
};

// ----------------------------------------------------------------
// Subscriber registry
// ----------------------------------------------------------------

export async function getNationalLotteryCustomers(
  orgId: string,
  storeId?: string,
  status?: 'ACTIVE' | 'INACTIVE'
): Promise<NationalLotteryCustomer[]> {
  try {
    let q = supabase.from(CUSTOMERS_TABLE).select('*').eq('organization_id', orgId);
    if (storeId) q = q.eq('store_id', storeId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('full_name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as NationalLotteryCustomer[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, CUSTOMERS_TABLE).catch(() => {});
    return [];
  }
}

// Client-side substring filter over an already-fetched list, mirroring
// customerCreditService.ts's findCustomer() style/scale - fine at this
// app's subscriber counts; a server-side trigram search is a reasonable
// later upgrade if that ever changes, not needed for v1.
export function searchNationalLotteryCustomers(
  customers: NationalLotteryCustomer[],
  query: string
): NationalLotteryCustomer[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers;
  return customers.filter(
    (c) =>
      c.full_name.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.lottery_number && c.lottery_number.toLowerCase().includes(q))
  );
}

export async function getNationalLotteryCustomer(id: string): Promise<NationalLotteryCustomer | null> {
  try {
    const { data, error } = await supabase.from(CUSTOMERS_TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as NationalLotteryCustomer) || null;
  } catch (error) {
    await handleSupabaseError(error, OperationType.GET, CUSTOMERS_TABLE).catch(() => {});
    return null;
  }
}

export type NationalLotteryCustomerInput = Partial<NationalLotteryCustomer> & {
  organization_id: string;
  store_id: string;
  full_name: string;
  participation_type: NationalLotteryParticipationType;
};

// Create or update (upsert on id). Registering a subscriber does NOT
// automatically enroll them in the store's current edition - that's a
// separate, explicit step (enrollCustomerInCurrentEdition below), kept
// distinct so the registry CRUD stays simple and the enrollment/edition
// logic stays in one place.
export async function saveNationalLotteryCustomer(input: NationalLotteryCustomerInput): Promise<NationalLotteryCustomer> {
  const payload = cleanData({
    id: input.id,
    organization_id: input.organization_id,
    store_id: input.store_id,
    full_name: input.full_name.trim(),
    phone: input.phone || null,
    lottery_number: input.lottery_number || null,
    participation_type: input.participation_type,
    status: input.status || 'ACTIVE',
    notes: input.notes || null,
    updated_at: new Date().toISOString(),
  });
  const { data, error } = await supabase.from(CUSTOMERS_TABLE).upsert(payload).select().single();
  if (error) throw error;
  return data as NationalLotteryCustomer;
}

// Soft delete only - never a hard DELETE (no DELETE RLS policy exists for
// this table either, see 0013_national_lottery_schema.sql). Preserves
// every past transaction/collection this subscriber has history against.
export async function setNationalLotteryCustomerStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
  const { error } = await supabase.from(CUSTOMERS_TABLE).update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ----------------------------------------------------------------
// Editions
// ----------------------------------------------------------------

export async function getActiveEdition(orgId: string, storeId: string): Promise<NationalLotteryEdition | null> {
  try {
    const { data, error } = await supabase
      .from(EDITIONS_TABLE)
      .select('*')
      .eq('organization_id', orgId)
      .eq('store_id', storeId)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (error) throw error;
    return (data as NationalLotteryEdition) || null;
  } catch (error) {
    await handleSupabaseError(error, OperationType.GET, EDITIONS_TABLE).catch(() => {});
    return null;
  }
}

export interface RolloverPreviewCustomer {
  nationalLotteryCustomerId: string;
  fullName: string;
  pendingDrawCodes: NationalLotteryDrawCode[];
  pendingDebt: number;
}

export interface RolloverPreview {
  activeCustomerCount: number;
  fullyCollectedCount: number;
  customersWithPendingCount: number;
  totalPendingTickets: number;
  totalDebtToTransfer: number;
  pendingByCustomer: RolloverPreviewCustomer[];
}

// Read-only preview for the "Νέα Έκδοση" confirmation screen - computes
// the exact same pending-draw logic the rollover RPC (0014) will apply,
// so the Owner sees accurate numbers BEFORE committing to the atomic
// transaction. Pure client-side computation over already-fetched rows;
// no writes.
export async function previewEditionRollover(edition: NationalLotteryEdition): Promise<RolloverPreview> {
  const [{ data: customers, error: custErr }, { data: customerEditions, error: ceErr }, { data: collections, error: colErr }] =
    await Promise.all([
      supabase.from(CUSTOMERS_TABLE).select('*').eq('current_edition_id', edition.id).eq('status', 'ACTIVE'),
      supabase.from(CUSTOMER_EDITIONS_TABLE).select('*').eq('edition_id', edition.id),
      supabase.from(COLLECTIONS_TABLE).select('customer_edition_id, draw_code').eq('edition_id', edition.id).eq('status', 'ACTIVE').neq('movement_type', 'REVERSAL'),
    ]);
  if (custErr || ceErr || colErr) throw custErr || ceErr || colErr;

  const collectedByCustomerEdition = new Map<string, Set<string>>();
  for (const row of collections ?? []) {
    const set = collectedByCustomerEdition.get(row.customer_edition_id) || new Set<string>();
    set.add(row.draw_code);
    collectedByCustomerEdition.set(row.customer_edition_id, set);
  }

  const pendingByCustomer: RolloverPreviewCustomer[] = [];
  let fullyCollectedCount = 0;

  for (const customer of customers ?? []) {
    const ce = (customerEditions ?? []).find((c) => c.national_lottery_customer_id === customer.id && c.edition_id === edition.id);
    if (!ce) continue;
    const collected = collectedByCustomerEdition.get(ce.id) || new Set<string>();
    const pending = NATIONAL_LOTTERY_DRAW_CODES.filter((code) => !collected.has(code));
    if (pending.length === 0) {
      fullyCollectedCount++;
      continue;
    }
    const price = NATIONAL_LOTTERY_DISPLAY_PRICES[ce.participation_type_snapshot as NationalLotteryParticipationType];
    pendingByCustomer.push({
      nationalLotteryCustomerId: customer.id,
      fullName: customer.full_name,
      pendingDrawCodes: pending,
      pendingDebt: pending.length * price,
    });
  }

  return {
    activeCustomerCount: (customers ?? []).length,
    fullyCollectedCount,
    customersWithPendingCount: pendingByCustomer.length,
    totalPendingTickets: pendingByCustomer.reduce((sum, c) => sum + c.pendingDrawCodes.length, 0),
    totalDebtToTransfer: pendingByCustomer.reduce((sum, c) => sum + c.pendingDebt, 0),
    pendingByCustomer,
  };
}

export interface EditionDrawProgress {
  drawCode: NationalLotteryDrawCode;
  receivedCount: number;
  totalCount: number;
  pendingCustomers: { nationalLotteryCustomerId: string; fullName: string }[];
}

export interface EditionDashboard {
  activeCustomerCount: number;
  fiveCount: number;
  tenCount: number;
  drawProgress: EditionDrawProgress[];
}

// Dashboard: current edition; active subscriber count + breakdown by
// type; per-draw progress (e.g. "Α: 40/42"); who hasn't received a given
// draw. Read-only, no writes - a sibling to previewEditionRollover (same
// input data, organized per-draw instead of per-customer, since the
// dashboard and the rollover preview genuinely answer different
// questions).
export async function getEditionDashboard(edition: NationalLotteryEdition): Promise<EditionDashboard> {
  const [{ data: customers, error: custErr }, { data: customerEditions, error: ceErr }, { data: collections, error: colErr }] =
    await Promise.all([
      supabase.from(CUSTOMERS_TABLE).select('*').eq('current_edition_id', edition.id).eq('status', 'ACTIVE'),
      supabase.from(CUSTOMER_EDITIONS_TABLE).select('*').eq('edition_id', edition.id),
      supabase.from(COLLECTIONS_TABLE).select('customer_edition_id, draw_code').eq('edition_id', edition.id).eq('status', 'ACTIVE').neq('movement_type', 'REVERSAL'),
    ]);
  if (custErr || ceErr || colErr) throw custErr || ceErr || colErr;

  const collectedByCustomerEdition = new Map<string, Set<string>>();
  for (const row of collections ?? []) {
    const set = collectedByCustomerEdition.get(row.customer_edition_id) || new Set<string>();
    set.add(row.draw_code);
    collectedByCustomerEdition.set(row.customer_edition_id, set);
  }

  const activeCustomers = customers ?? [];
  const customerEditionByCustomerId = new Map(
    (customerEditions ?? []).filter((ce) => ce.edition_id === edition.id).map((ce) => [ce.national_lottery_customer_id, ce])
  );

  const drawProgress: EditionDrawProgress[] = NATIONAL_LOTTERY_DRAW_CODES.map((drawCode) => {
    const pendingCustomers: { nationalLotteryCustomerId: string; fullName: string }[] = [];
    let receivedCount = 0;
    for (const customer of activeCustomers) {
      const ce = customerEditionByCustomerId.get(customer.id);
      if (!ce) continue;
      const collected = collectedByCustomerEdition.get(ce.id) || new Set<string>();
      if (collected.has(drawCode)) {
        receivedCount++;
      } else {
        pendingCustomers.push({ nationalLotteryCustomerId: customer.id, fullName: customer.full_name });
      }
    }
    return { drawCode, receivedCount, totalCount: activeCustomers.length, pendingCustomers };
  });

  return {
    activeCustomerCount: activeCustomers.length,
    fiveCount: activeCustomers.filter((c) => c.participation_type === 'FIVE').length,
    tenCount: activeCustomers.filter((c) => c.participation_type === 'TEN').length,
    drawProgress,
  };
}

// The one write in this module that goes through a Postgres RPC instead
// of a plain insert/update - see 0014_national_lottery_edition_rollover.sql
// for why (atomicity: debts must be durably recorded before any draw is
// reset, guaranteed only inside one DB transaction).
export async function rolloverEdition(params: {
  organizationId: string;
  storeId: string;
  newEditionLabel: string;
  actorUserId: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('rollover_national_lottery_edition', {
    p_org_id: params.organizationId,
    p_store_id: params.storeId,
    p_new_edition_label: params.newEditionLabel.trim(),
    p_actor_user_id: params.actorUserId,
  });
  if (error) throw error;
  return data as string; // new edition id
}

// Enrolls an existing subscriber into the store's current active edition -
// used when a NEW subscriber is registered mid-edition (so they don't have
// to wait for the next rollover to start participating) or, defensively,
// to repair a customer whose current_edition_id somehow drifted from an
// edition they don't have a national_lottery_customer_editions row for
// yet. No-ops if already enrolled (relies on the table's own UNIQUE
// (national_lottery_customer_id, edition_id) constraint).
export async function enrollCustomerInCurrentEdition(
  customer: NationalLotteryCustomer,
  edition: NationalLotteryEdition
): Promise<void> {
  const { data: existing, error: existingErr } = await supabase
    .from(CUSTOMER_EDITIONS_TABLE)
    .select('id')
    .eq('national_lottery_customer_id', customer.id)
    .eq('edition_id', edition.id)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) return;

  const { error: insertErr } = await supabase.from(CUSTOMER_EDITIONS_TABLE).insert({
    organization_id: customer.organization_id,
    store_id: customer.store_id,
    national_lottery_customer_id: customer.id,
    edition_id: edition.id,
    participation_type_snapshot: customer.participation_type,
  });
  if (insertErr) throw insertErr;

  const { error: updateErr } = await supabase
    .from(CUSTOMERS_TABLE)
    .update({ current_edition_id: edition.id, updated_at: new Date().toISOString() })
    .eq('id', customer.id);
  if (updateErr) throw updateErr;
}

export async function getCustomerEdition(customerId: string, editionId: string): Promise<NationalLotteryCustomerEdition | null> {
  const { data, error } = await supabase
    .from(CUSTOMER_EDITIONS_TABLE)
    .select('*')
    .eq('national_lottery_customer_id', customerId)
    .eq('edition_id', editionId)
    .maybeSingle();
  if (error) throw error;
  return (data as NationalLotteryCustomerEdition) || null;
}

// ----------------------------------------------------------------
// Draw collection - the employee-facing "Παραλαβή" action
// ----------------------------------------------------------------

export async function getEditionDrawStatuses(customerEditionId: string): Promise<NationalLotteryDrawStatus[]> {
  const { data, error } = await supabase
    .from(COLLECTIONS_TABLE)
    .select('*')
    .eq('customer_edition_id', customerEditionId)
    .eq('status', 'ACTIVE')
    .neq('movement_type', 'REVERSAL');
  if (error) throw error;
  const byCode = new Map<string, NationalLotteryDrawCollection>();
  for (const row of (data ?? []) as NationalLotteryDrawCollection[]) {
    byCode.set(row.draw_code, row);
  }
  return NATIONAL_LOTTERY_DRAW_CODES.map((drawCode) => ({
    drawCode,
    received: byCode.has(drawCode),
    collection: byCode.get(drawCode),
  }));
}

export interface CollectDrawsParams {
  organizationId: string;
  storeId: string;
  nationalLotteryCustomerId: string;
  customerEditionId: string;
  editionId: string;
  drawCodes: NationalLotteryDrawCode[]; // one (single) or several (bulk) - same code path either way
  shiftId: string | null;
  createdByUserId: string;
  // Caller-supplied so a retry of the SAME click (network timeout, double
  // click before the button disables) reuses the same key; a genuinely
  // new click always generates a fresh one. Also reused as this batch's
  // batch_id - both are meant to be "one value per logical click" anyway.
  idempotencyKey?: string;
}

export interface CollectDrawsResult {
  collections: NationalLotteryDrawCollection[];
  // true when the insert hit a unique-constraint conflict and this result
  // reflects a re-query of actual current state, not a fresh insert - the
  // caller should compare `created_by_user_id`/`idempotency_key` on the
  // returned rows against its own actor/key to tell "this was my own
  // retry, already succeeded" apart from "someone else got here first".
  wasConflict: boolean;
}

export async function collectDraws(params: CollectDrawsParams): Promise<CollectDrawsResult> {
  if (params.drawCodes.length === 0) {
    return { collections: [], wasConflict: false };
  }
  const idempotencyKey = params.idempotencyKey || crypto.randomUUID();

  const rows = params.drawCodes.map((drawCode) => ({
    organization_id: params.organizationId,
    store_id: params.storeId,
    national_lottery_customer_id: params.nationalLotteryCustomerId,
    customer_edition_id: params.customerEditionId,
    edition_id: params.editionId,
    draw_code: drawCode,
    movement_type: 'COLLECTION',
    // amount intentionally OMITTED - trg_nl_draw_collections_pricing
    // (0013) computes and overwrites it server-side on every COLLECTION
    // insert. The frontend's own NATIONAL_LOTTERY_DISPLAY_PRICES value is
    // preview-only and is never sent as the actual charge.
    batch_id: idempotencyKey,
    shift_id: params.shiftId,
    idempotency_key: idempotencyKey,
    created_by_user_id: params.createdByUserId,
  }));

  const { data, error } = await supabase.from(COLLECTIONS_TABLE).insert(rows).select();
  if (!error) {
    return { collections: (data ?? []) as NationalLotteryDrawCollection[], wasConflict: false };
  }

  if ((error as any).code === '23505') {
    // Either this exact click was retried (same idempotency_key), or two
    // employees raced for the same draw (different keys). Either way, the
    // correct recovery is the same: re-read actual current state for
    // these draws and hand it back - never show a raw DB error for what
    // is, from the employee's point of view, "did this already work?".
    const { data: currentRows, error: refetchError } = await supabase
      .from(COLLECTIONS_TABLE)
      .select('*')
      .eq('customer_edition_id', params.customerEditionId)
      .in('draw_code', params.drawCodes)
      .eq('status', 'ACTIVE')
      .neq('movement_type', 'REVERSAL');
    if (refetchError) throw refetchError;
    return { collections: (currentRows ?? []) as NationalLotteryDrawCollection[], wasConflict: true };
  }

  throw error;
}

// ----------------------------------------------------------------
// Cancellation / reversal - never a destructive delete
// ----------------------------------------------------------------

export async function cancelCollection(params: {
  batchId: string; // cancels every row sharing this batch_id (a single collection's batch_id covers just that one row)
  cancelledByUserId: string;
  reason?: string;
  registerId?: string; // for locating today's open shift if a reversal is needed
}): Promise<void> {
  const { data: rows, error: fetchError } = await supabase
    .from(COLLECTIONS_TABLE)
    .select('*')
    .eq('batch_id', params.batchId)
    .eq('status', 'ACTIVE');
  if (fetchError) throw fetchError;
  if (!rows || rows.length === 0) return; // nothing left to cancel - treat a retry of the cancel action itself as a no-op, not an error

  const cancelledAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from(COLLECTIONS_TABLE)
    .update({
      status: 'CANCELLED',
      cancelled_at: cancelledAt,
      cancelled_by_user_id: params.cancelledByUserId,
      cancellation_reason: params.reason || null,
    })
    .eq('batch_id', params.batchId)
    .eq('status', 'ACTIVE');
  if (updateError) throw updateError;

  // A row tied to a still-open shift needs no further correction - the
  // next time that shift's total is computed, the ACTIVE-only filter
  // (getNationalLotteryShiftContribution below) excludes the now-
  // CANCELLED amount automatically. A row tied to an already-closed
  // (immutable) shift needs a REVERSAL posted against TODAY's shift
  // instead, since the closed shift's own historical total must never
  // be rewritten.
  const shiftIds = [...new Set((rows as any[]).map((r) => r.shift_id).filter(Boolean))];
  const openByShiftId = new Map<string, boolean>();
  for (const shiftId of shiftIds) {
    const { data: shift } = await supabase.from('shifts').select('status').eq('id', shiftId).maybeSingle();
    openByShiftId.set(shiftId, !!shift && OPEN_SHIFT_STATUSES.includes(shift.status));
  }

  const rowsNeedingReversal = (rows as any[]).filter((r) => r.shift_id && openByShiftId.get(r.shift_id) === false);
  if (rowsNeedingReversal.length === 0) return;

  const first = rowsNeedingReversal[0];
  const todayShift = await fetchActiveShiftFromFirestore(first.organization_id, first.store_id, params.registerId || 'REG-01');
  const reversalBatchId = crypto.randomUUID();
  const reversalRows = rowsNeedingReversal.map((row) => ({
    organization_id: row.organization_id,
    store_id: row.store_id,
    national_lottery_customer_id: row.national_lottery_customer_id,
    customer_edition_id: row.customer_edition_id,
    edition_id: row.edition_id,
    draw_code: row.draw_code,
    movement_type: 'REVERSAL',
    amount: row.amount, // copies the original amount - the pricing trigger only fires for movement_type='COLLECTION'
    batch_id: reversalBatchId,
    shift_id: todayShift?.id || null,
    reverses_collection_id: row.id,
    idempotency_key: crypto.randomUUID(),
    created_by_user_id: params.cancelledByUserId,
  }));

  const { error: reversalError } = await supabase.from(COLLECTIONS_TABLE).insert(reversalRows);
  if (reversalError) throw reversalError;
}

// ----------------------------------------------------------------
// Reporting integration (wired into ShiftClosingWizard/dailyAggregationService
// in a later PR) - the double-counting-safe way National Lottery cash
// reaches a shift's scratch_lotto_sales exactly once.
// ----------------------------------------------------------------

export async function getNationalLotteryShiftContribution(shiftId: string): Promise<number> {
  const { data, error } = await supabase
    .from(COLLECTIONS_TABLE)
    .select('movement_type, amount')
    .eq('shift_id', shiftId)
    .eq('status', 'ACTIVE')
    .neq('movement_type', 'DEBT_TRANSFER'); // DEBT_TRANSFER rows are never shift_id-linked (always NULL) - excluded defensively anyway
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + (row.movement_type === 'REVERSAL' ? -Number(row.amount) : Number(row.amount)), 0);
}

// Batch variant for daily reporting (DailyAggregationView.tsx) - one fetch
// covering every shift-linked row for the store, rather than one query per
// shift. dailyAggregationService.ts's own shift-id-keyed lookup is what
// actually scopes each row to the correct day/shift; fetching by store
// only (matching this codebase's existing getCustomers()/getNational
// LotteryCustomers() "everything for this store" convention) keeps this
// simple - a date-bounded query is a reasonable later optimization if
// collection volume ever makes that necessary, not needed at this app's
// scale today.
export async function getNationalLotteryTransactionsForStore(
  orgId: string,
  storeId?: string // omitted/'ALL' = every store in the org, matching groupShiftsByDayAndStore's own 'ALL' handling
): Promise<NationalLotteryDrawCollection[]> {
  try {
    let q = supabase.from(COLLECTIONS_TABLE).select('*').eq('organization_id', orgId).not('shift_id', 'is', null);
    if (storeId && storeId !== 'ALL') q = q.eq('store_id', storeId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as NationalLotteryDrawCollection[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, COLLECTIONS_TABLE).catch(() => {});
    return [];
  }
}

// ----------------------------------------------------------------
// Debt warning (surfaced on the customer card in a later PR) - purely
// informational, never blocking a new collection.
// ----------------------------------------------------------------

export interface NationalLotteryDebtWarning {
  currentDebt: number;
  editionLabel: string;
  drawCodes: NationalLotteryDrawCode[];
  transactionDate: string;
}

export async function getNationalLotteryDebtWarning(customerId: string | null | undefined): Promise<NationalLotteryDebtWarning | null> {
  if (!customerId) return null;

  const { data: customer, error: custErr } = await supabase.from('customers').select('current_debt').eq('id', customerId).maybeSingle();
  if (custErr) throw custErr;
  if (!customer || Number(customer.current_debt) <= 0) return null;

  const { data: tx, error: txErr } = await supabase
    .from('customer_credit_transactions')
    .select('amount, created_at, source_reference_id')
    .eq('customer_id', customerId)
    .eq('source', 'NATIONAL_LOTTERY')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (txErr) throw txErr;
  if (!tx) return null; // has debt, but not sourced from National Lottery

  const { data: customerEdition } = await supabase
    .from(CUSTOMER_EDITIONS_TABLE)
    .select('edition_id')
    .eq('id', tx.source_reference_id)
    .maybeSingle();
  const editionId = customerEdition?.edition_id;

  const [{ data: edition }, { data: drawRows }] = await Promise.all([
    editionId ? supabase.from(EDITIONS_TABLE).select('label').eq('id', editionId).maybeSingle() : Promise.resolve({ data: null } as any),
    supabase.from(COLLECTIONS_TABLE).select('draw_code').eq('customer_edition_id', tx.source_reference_id).eq('movement_type', 'DEBT_TRANSFER'),
  ]);

  return {
    currentDebt: Number(customer.current_debt),
    editionLabel: edition?.label || '—',
    drawCodes: (drawRows ?? []).map((r) => r.draw_code as NationalLotteryDrawCode),
    transactionDate: tx.created_at,
  };
}
