import { supabase } from './supabase.ts';
import { gamesMissingFrom } from '../lib/catalogPropagation.ts';
import {
  applyLotteryProductShapes,
  DEFAULT_SCRATCH_PRESETS,
  getSavedScratchCatalog,
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
  game_no: string | null;
  pack_pieces: number | null;
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
  ...(r.game_no ? { gameNo: String(r.game_no).trim() } : {}),
  ...(r.pack_pieces ? { packPieces: r.pack_pieces } : {}),
  backSideEnabled: r.back_side_enabled,
});

/**
 * The catalogue for a store, in the Owner's order.
 *
 * An organisation that has never opened the configurator has no rows, and gets
 * the same presets the app has always started from - so nothing changes for a
 * store until somebody actually edits the list.
 *
 * Τα πέντε λαχεία βγαίνουν πάντα στο σχήμα του προϊόντος, ό,τι κι αν λέει η
 * γραμμή. Their price is not a shop's preference - Ειδική χ5 is 1 €/κομμάτι
 * and 5 € η πεντάδα everywhere it is sold - and a catalogue written before the
 * πεντάδα existed stored that 5 € in the piece field with no bundle behind it.
 * Every screen reads the list through here, so pinning it here is what stops a
 * row saved in 2025 from charging five times the price in a till today.
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
    if (rows.length === 0) return applyLotteryProductShapes(DEFAULT_SCRATCH_PRESETS);

    // When both exist, the store's row replaces the org-wide one of the same code.
    const byCode = new Map<string, CatalogRow & { store_id: string | null }>();
    for (const r of rows) {
      const existing = byCode.get(r.code);
      if (!existing || (r.store_id && !existing.store_id)) byCode.set(r.code, r);
    }
    return applyLotteryProductShapes(
      [...byCode.values()].sort((a, b) => a.sort_order - b.sort_order).map(toTicketRow)
    );
  } catch (err) {
    console.warn('[scratchCatalog] could not read the catalogue, using presets:', err);
    return applyLotteryProductShapes(DEFAULT_SCRATCH_PRESETS);
  }
}

/**
 * Replaces the catalogue with exactly these rows, in exactly this order.
 *
 * Owner-only at the database level (0030), so a manager or an employee calling
 * this is refused by the policy rather than by the button being hidden.
 */
/**
 * The catalogue to EDIT, which is not always the catalogue to read.
 *
 * fetchScratchCatalog falls back to the shipped presets when the database
 * holds nothing, which is right for counting - a till has to show something.
 * It was wrong for the editor: the closing screen reads the browser's own
 * saved list, so a game added there existed in the till and was invisible in
 * Διαμόρφωση, where it could have been corrected or removed. Two sources for
 * one list, and the only screen that can fix it was looking at the other one.
 *
 * So while nothing is stored, the editor is shown what the tills are actually
 * using. Saving then captures reality instead of overwriting it with presets.
 */
export async function fetchScratchCatalogForEditing(
  orgId: string,
  storeId?: string
): Promise<{ rows: ScratchTicketRow[]; fromDatabase: boolean }> {
  try {
    let q = supabase.from(TABLE).select('code').eq('organization_id', orgId).eq('is_active', true);
    q = storeId ? q.or(`store_id.eq.${storeId},store_id.is.null`) : q.is('store_id', null);
    const { data, error } = await q.limit(1);
    if (error) throw error;

    if ((data ?? []).length > 0) {
      return { rows: await fetchScratchCatalog(orgId, storeId), fromDatabase: true };
    }
  } catch (err) {
    console.warn('[scratchCatalog] could not tell whether a catalogue is stored:', err);
  }

  // Nothing stored: whatever this browser has been counting with, which is
  // the presets plus anything added locally.
  return { rows: getSavedScratchCatalog(), fromDatabase: false };
}

/**
 * Γράφει τον αρχικό κατάλογο ενός καινούριου καταστήματος.
 *
 * Τα ίδια παιχνίδια που βλέπει κάθε άλλο μαγαζί, με τους πανελλαδικούς
 * αριθμούς τους - δηλαδή με αποθήκη που δουλεύει από την πρώτη μέρα. Ο
 * ιδιοκτήτης τα αλλάζει όποτε θέλει από τη Διαμόρφωση· αυτό είναι ο σπόρος,
 * όχι απόφαση.
 *
 * Δεν γράφει τίποτα αν το κατάστημα έχει ήδη κατάλογο: καλείται στη
 * δημιουργία, αλλά μια δεύτερη κλήση δεν επιτρέπεται να σβήσει δουλειά.
 */
export async function seedScratchCatalogForStore(orgId: string, storeId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('code')
    .eq('organization_id', orgId)
    .eq('store_id', storeId)
    .limit(1);
  if (error) throw error;
  if ((data ?? []).length > 0) return false;

  await saveScratchCatalog(orgId, storeId, DEFAULT_SCRATCH_PRESETS.map((r) => ({ ...r })));
  return true;
}

/**
 * Μια γραμμή του καταλόγου όπως γράφεται στη βάση.
 *
 * Ένα σημείο, γιατί δύο δρόμοι γράφουν πια τον κατάλογο: η αποθήκευση ενός
 * καταστήματος και η αντιγραφή ενός νέου παιχνιδιού στα υπόλοιπα. Αν
 * απέκλιναν, το ίδιο παιχνίδι θα υπήρχε με δύο σχήματα σε δύο μαγαζιά.
 */
function toCatalogRow(
  orgId: string,
  storeId: string | null,
  row: ScratchTicketRow,
  sortOrder: number
) {
  return {
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
    // Ο αριθμός παιχνιδιού είναι ό,τι σκανάρεται πρώτο. Κενό σημαίνει «αυτό
    // το παιχνίδι δεν μπαίνει στην αποθήκη» - σωστό για κάτι που δεν έχει
    // πανελλαδικό αριθμό, και ειλικρινέστερο από έναν επινοημένο.
    game_no: /^\d{4}$/.test(String(row.gameNo ?? '').trim())
      ? String(row.gameNo).trim()
      : null,
    pack_pieces: row.packPieces && row.packPieces > 0 ? row.packPieces : null,
    back_side_enabled: row.backSideEnabled !== false,
    sort_order: sortOrder,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
}

export async function saveScratchCatalog(
  orgId: string,
  storeId: string | null,
  rows: ScratchTicketRow[]
): Promise<void> {
  const payload = rows.map((row, index) => toCatalogRow(orgId, storeId, row, index));

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

export interface PropagatedGames {
  storeId: string;
  storeName: string;
  added: string[];
}

/**
 * Βάζει τα νέα παιχνίδια και στα υπόλοιπα καταστήματα του οργανισμού.
 *
 * «Τα 4ψήφια είναι παντού τα ίδια.» Ο αριθμός παιχνιδιού είναι του ΟΠΑΠ, όχι
 * του μαγαζιού - αλλά ο κατάλογος κρατιέται ανά κατάστημα, οπότε ένα
 * παιχνίδι που προστέθηκε στη μία οθόνη δεν υπήρχε στο άλλο μαγαζί μέχρι να
 * ξαναγραφεί με το χέρι. Τα χριστουγεννιάτικα το έδειξαν: μπήκαν στη Λαμία
 * και η Στυλίδα δεν τα είδε ποτέ.
 *
 * ΜΟΝΟ ΠΡΟΣΘΗΚΕΣ, ποτέ αφαιρέσεις ή αλλαγές: τι πουλάει κάθε μαγαζί και σε
 * τι σειρά το μετράει είναι δική του απόφαση, και μια αντιγραφή που
 * ισοπέδωνε τον κατάλογο του άλλου θα έσβηνε δουλειά που δεν ζήτησε κανείς.
 * Οι δικές του ρυθμίσεις μένουν όπως είναι· το νέο παιχνίδι μπαίνει στο
 * τέλος της λίστας του.
 *
 * Αν ένα κατάστημα δεν έχει καθόλου κατάλογο, δεν του γράφεται τίποτα: ένα
 * μαγαζί με άδειο κατάλογο μετράει με τα προεπιλεγμένα (δες
 * fetchScratchCatalog), και δύο-τρεις γραμμές θα του έσβηναν όλα τα
 * υπόλοιπα. Ο σπόρος του είναι δουλειά του seedScratchCatalogForStore.
 */
export async function addNewGamesToOtherStores(
  orgId: string,
  sourceStoreId: string,
  rows: ScratchTicketRow[]
): Promise<PropagatedGames[]> {
  const { data: storeRows, error: storeErr } = await supabase
    .from('stores')
    .select('id,name')
    .eq('organization_id', orgId);
  if (storeErr) throw storeErr;

  const targets = (storeRows ?? []).filter((s: any) => s.id !== sourceStoreId);
  const report: PropagatedGames[] = [];

  for (const store of targets) {
    const { data: theirs, error } = await supabase
      .from(TABLE)
      .select('code,name,game_no,sort_order')
      .eq('organization_id', orgId)
      .eq('store_id', (store as any).id);
    if (error) throw error;

    const existing = (theirs ?? []) as { code: string; name: string; game_no: string | null; sort_order: number }[];
    if (existing.length === 0) continue;

    const missing = gamesMissingFrom(
      rows.map((r) => ({ ...r, code: r.id })),
      existing.map((r) => ({ code: r.code, name: r.name, gameNo: r.game_no }))
    );
    if (missing.length === 0) continue;

    const nextSort = Math.max(...existing.map((r) => Number(r.sort_order) || 0)) + 1;
    const payload = missing.map((row, i) =>
      toCatalogRow(orgId, (store as any).id, row as ScratchTicketRow, nextSort + i)
    );
    const { error: insertErr } = await supabase.from(TABLE).insert(payload);
    if (insertErr) throw insertErr;

    report.push({
      storeId: (store as any).id,
      storeName: String((store as any).name ?? ''),
      added: missing.map((m) => String(m.name ?? '')),
    });
  }

  return report;
}
