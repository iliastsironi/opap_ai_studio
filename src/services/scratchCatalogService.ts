import { supabase } from './supabase.ts';
import {
  DEFAULT_SCRATCH_PRESETS,
  isLotteryRow,
  type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

/**
 * Which scratch games and lotteries a store sells, and at what price.
 *
 * This lived in localStorage under `shiftledger_scratch_catalog_v2`, which
 * means it lived in one browser. The Owner curated the list on their laptop
 * and the employee counted the till on the shop computer, each from their own
 * copy, with no way for either to see that they differed - and staff use
 * phones, till computers and tablets, so it was three lists per store rather
 * than two. A price edited in one place simply did not exist in the others.
 *
 * The rows below are the same shape the table has always rendered; only where
 * they are kept has changed.
 */

const TABLE = 'scratch_catalog';

interface CatalogRow {
  code: string;
  name: string;
  kind: 'SCRATCH' | 'LOTTERY';
  category: string;
  price: number | string;
  bundle_size: number | null;
  back_side_enabled: boolean;
  sort_order: number;
}

const toTicketRow = (r: CatalogRow): ScratchTicketRow => ({
  id: r.code,
  name: r.name,
  kind: r.kind,
  category: r.category,
  price: Number(r.price) || 0,
  startNo: '',
  endNo: '',
  ...(r.bundle_size ? { bundleSize: r.bundle_size } : {}),
  backSideEnabled: r.back_side_enabled,
});

/**
 * The catalogue for a store, in the Owner's order.
 *
 * An organisation that has never opened the configurator has no rows, and gets
 * the same presets the app has always started from - so nothing changes for a
 * store until somebody actually edits the list.
 */
export async function fetchScratchCatalog(
  orgId: string,
  storeId?: string
): Promise<ScratchTicketRow[]> {
  try {
    // A store's own list wins; the organisation-wide list (store_id NULL) is
    // the fallback, the same precedence shift_templates already uses.
    let q = supabase.from(TABLE).select('*').eq('organization_id', orgId).eq('is_active', true);
    q = storeId ? q.or(`store_id.eq.${storeId},store_id.is.null`) : q.is('store_id', null);
    const { data, error } = await q.order('sort_order', { ascending: true });
    if (error) throw error;

    const rows = (data ?? []) as (CatalogRow & { store_id: string | null })[];
    if (rows.length === 0) return DEFAULT_SCRATCH_PRESETS;

    // When both exist, the store's row replaces the org-wide one of the same code.
    const byCode = new Map<string, CatalogRow & { store_id: string | null }>();
    for (const r of rows) {
      const existing = byCode.get(r.code);
      if (!existing || (r.store_id && !existing.store_id)) byCode.set(r.code, r);
    }
    return [...byCode.values()]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toTicketRow);
  } catch (err) {
    console.warn('[scratchCatalog] could not read the catalogue, using presets:', err);
    return DEFAULT_SCRATCH_PRESETS;
  }
}

/**
 * Replaces the catalogue with exactly these rows, in exactly this order.
 *
 * Owner-only at the database level (0030), so a manager or an employee calling
 * this is refused by the policy rather than by the button being hidden.
 */
export async function saveScratchCatalog(
  orgId: string,
  storeId: string | null,
  rows: ScratchTicketRow[]
): Promise<void> {
  const payload = rows.map((row, index) => ({
    organization_id: orgId,
    store_id: storeId,
    code: row.id,
    name: row.name,
    // The explicit kind if the row carries one, otherwise the same inference
    // the table has always made - so the first save writes down what was
    // already being assumed rather than changing anyone's totals.
    kind: row.kind ?? (isLotteryRow(row) ? 'LOTTERY' : 'SCRATCH'),
    category: row.category || 'Σκρατς',
    price: Number(row.price) || 0,
    bundle_size: row.bundleSize && row.bundleSize > 1 ? row.bundleSize : null,
    back_side_enabled: row.backSideEnabled !== false,
    sort_order: index,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));

  // Replace outright rather than upsert. The unique index is on
  // (organization_id, COALESCE(store_id, ''), code) - an expression, because
  // store_id is nullable and NULLs do not collide - and PostgREST's
  // ON CONFLICT cannot name an expression index. Deleting first is also
  // simply what «this is the list now» means, including for removals.
  //
  // Nothing historical is lost: a shift stores its own copy of the rows it
  // counted in custom_field_values.scratch_ticket_items, so a game dropped
  // from the catalogue still reads back on the shifts that sold it.
  let wipe = supabase.from(TABLE).delete().eq('organization_id', orgId);
  wipe = storeId ? wipe.eq('store_id', storeId) : wipe.is('store_id', null);
  const { error: wipeErr } = await wipe;
  if (wipeErr) throw wipeErr;

  if (payload.length === 0) return;
  const { error } = await supabase.from(TABLE).insert(payload);
  if (error) throw error;
}
