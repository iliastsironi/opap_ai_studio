// Seeds the suppliers registry from the recipients already recorded on
// expenses, so the Owner starts with the businesses they actually buy from
// rather than an empty list.
//
// Names are taken VERBATIM. The August data was deliberately normalised on
// 2026-10-14 (Hausbranft/HAUSBRANDT -> Hausbrandt, OSTRIA -> Ostria); this
// script must not rename anything or it would undo that silently.
//
// Safe to re-run: a recipient that already has a supplier row is skipped.
// Run with: node supabase/scripts/backfill-suppliers.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Best-effort category from the expense category the name is mostly used with.
// Everything else is OTHER, which the Owner can correct in Προμηθευτές.
const CATEGORY_FROM_EXPENSE = { EXPENSES_FNB: 'BEVERAGES_FNB', CLEANING: 'CLEANING', UTILITIES: 'UTILITIES' };

const { data: expenses, error } = await admin
  .from('shift_expenses')
  .select('organization_id, recipient, category, store_id');
if (error) throw error;

const byName = new Map();
for (const e of expenses ?? []) {
  const name = (e.recipient || '').trim();
  if (!name) continue;
  const entry = byName.get(name) || { name, org: e.organization_id, cats: {}, stores: new Set() };
  entry.cats[e.category] = (entry.cats[e.category] || 0) + 1;
  entry.stores.add(e.store_id);
  byName.set(name, entry);
}

const { data: existing } = await admin.from('suppliers').select('company_name');
const have = new Set((existing ?? []).map((s) => (s.company_name || '').trim().toLocaleUpperCase('el-GR')));

const rows = [];
for (const entry of byName.values()) {
  if (have.has(entry.name.toLocaleUpperCase('el-GR'))) continue;
  const topCat = Object.entries(entry.cats).sort((a, b) => b[1] - a[1])[0]?.[0];
  rows.push({
    organization_id: entry.org,
    store_ids: [...entry.stores],
    code: null,
    company_name: entry.name,
    category: CATEGORY_FROM_EXPENSE[topCat] || 'OTHER',
    balance: 0,
    is_active: true,
    notes: 'Δημιουργήθηκε αυτόματα από τα καταχωρημένα έξοδα',
  });
}

if (rows.length === 0) {
  console.log('nothing to add — every recipient already has a supplier row');
} else {
  console.log(`adding ${rows.length} supplier(s):`);
  for (const r of rows.sort((a, b) => a.company_name.localeCompare(b.company_name, 'el'))) {
    console.log(`  ${r.company_name.padEnd(22)} ${r.category.padEnd(16)} ${r.store_ids.length} store(s)`);
  }
  const { error: insErr } = await admin.from('suppliers').insert(rows);
  if (insErr) throw insErr;
  console.log('\ndone');
}

const { count } = await admin.from('suppliers').select('*', { count: 'exact', head: true });
console.log(`suppliers now: ${count}`);
