#!/usr/bin/env node
/**
 * Έλεγχοι ακεραιότητας πάνω στα ζωντανά δεδομένα.
 *
 *   node supabase/scripts/integrity.mjs                 όλοι οι οργανισμοί
 *   node supabase/scripts/integrity.mjs --org org_xyz   μόνο ένας
 *   node supabase/scripts/integrity.mjs --quiet         μόνο τα ευρήματα
 *
 * ΓΙΑΤΙ ΥΠΑΡΧΕΙ: τα σοβαρά λάθη αυτού του έργου δεν τα έπιασαν ποτέ τα unit
 * tests. Τα έπιασαν probes σαν αυτά - μια ερώτηση στη βάση που ρωτάει «αν
 * όλα δουλεύουν, τι ΠΡΕΠΕΙ να ισχύει εδώ;». Κάθε έλεγχος παρακάτω γεννήθηκε
 * από πραγματικό περιστατικό, και το λέει.
 *
 * ΔΙΑΒΑΖΕΙ ΜΟΝΟ. Καμία εγγραφή, πουθενά. Τρέχει με το service role, που
 * παρακάμπτει την RLS - γι' αυτό βλέπει όλους τους οργανισμούς μαζί και
 * γι' αυτό τα φίλτρα ανά organization_id είναι ρητά: δύο οργανισμοί
 * μοιράζονται τη βάση και οι κωδικοί καταστημάτων επαναλαμβάνονται.
 *
 * Έξοδος 0 όταν δεν υπάρχει σφάλμα, 1 όταν υπάρχει. Οι προειδοποιήσεις δεν
 * ρίχνουν την έξοδο: είναι πράγματα που ΜΠΟΡΕΙ να είναι σωστά κατά
 * περίπτωση, και κάποιος τα έχει ήδη αποφασίσει.
 */

import { readFileSync } from 'node:fs';

// ── σύνδεση ──────────────────────────────────────────────────────────────
const env = {};
for (const line of readFileSync(new URL('../../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error('Λείπει VITE_SUPABASE_URL ή SUPABASE_SERVICE_ROLE_KEY από το .env');
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const args = process.argv.slice(2);
const ORG = args.includes('--org') ? args[args.indexOf('--org') + 1] : null;
const QUIET = args.includes('--quiet');

/**
 * Το PostgREST γυρίζει 1000 γραμμές χωρίς να το πει. Ένας έλεγχος που
 * διάβασε τις μισές γραμμές και είπε «καθαρό» είναι χειρότερος από κανέναν
 * έλεγχο, οπότε εδώ σελιδοποιείται πάντα.
 */
async function all(table, query) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}?${query}`, {
      headers: { ...H, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!r.ok) throw new Error(`${table}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error(`${table}: ${JSON.stringify(rows).slice(0, 160)}`);
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const athensDay = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date(iso));

// ── μητρώο ελέγχων ───────────────────────────────────────────────────────
const checks = [];
const check = (name, why, fn, level = 'ERROR') => checks.push({ name, why, fn, level });

// ─────────────────────────────────────────────────────────────────────────
check(
  'Χρέος πελάτη = επανάληψη των κινήσεών του',
  'Το current_debt το συντηρεί trigger. Αν αποκλίνει, κάποιος χρωστάει νούμερο που δεν βγαίνει από πουθενά.',
  async (d) => {
    const found = [];
    const byCustomer = {};
    for (const t of d.credits) (byCustomer[t.customer_id] ??= []).push(t);
    for (const c of d.customers) {
      // Κόβει στο μηδέν σε ΚΑΘΕ βήμα, όπως το trigger. Ένα σκέτο άθροισμα
      // αποκλίνει μόλις κάποιος πληρώσει παραπάνω απ' όσα χρωστάει - και
      // έτσι ο πρώτος αυτός έλεγχος έβγαλε 4 λάθη που δεν υπήρχαν.
      let debt = 0;
      for (const t of byCustomer[c.id] ?? [])
        debt = Math.max(0, r2(debt + (t.type === 'GRANTED' ? num(t.amount) : -num(t.amount))));
      if (Math.abs(debt - num(c.current_debt)) > 0.005)
        found.push(`${c.name}: τεφτέρι ${c.current_debt} · επανάληψη ${debt}`);
    }
    return found;
  }
);

check(
  'Καμία μέρα με δύο ίδιες κανονικές βάρδιες',
  'Η οθόνη ξεκινούσε πάντα στο «Πρωινή» και κανείς δεν το άλλαζε στην παράδοση (0069).',
  async (d) => {
    const found = [];
    const groups = {};
    for (const s of d.shifts)
      (groups[`${s.store_id}|${s.register_id ?? 'Ταμείο 1'}|${athensDay(s.opened_at)}`] ??= []).push(s.shift_type);
    for (const [k, types] of Object.entries(groups)) {
      // Η «Ειδική / Έκτακτη» δεν πιάνει θέση - μπορεί να υπάρχουν πολλές.
      const regular = types.filter((t) => t && t !== 'CUSTOM');
      if (new Set(regular).size !== regular.length) found.push(`${k}: ${types.join(', ')}`);
    }
    return found;
  }
);

check(
  'Καμία γραμμή δεν δείχνει σε βάρδια που δεν υπάρχει',
  'Τα ξένα κλειδιά προς shifts είναι άλλα CASCADE και άλλα SET NULL. Ένα κρεμασμένο id σημαίνει ότι κάτι ξέφυγε και από τα δύο.',
  async (d) => {
    const live = new Set(d.shifts.map((s) => s.id));
    const found = [];
    for (const [label, rows, col] of [
      ['έξοδα', d.expenses, 'shift_id'],
      ['χρεώσεις υπαλλήλων', d.charges, 'shift_id'],
      ['πιστώσεις πελατών', d.credits, 'shift_id'],
    ]) {
      const dangling = rows.filter((x) => x[col] && !live.has(x[col]));
      if (dangling.length) found.push(`${label}: ${dangling.length} γραμμές`);
    }
    return found;
  }
);

check(
  'Χρέωση υπαλλήλου = δική της διαφορά μείον ανοχή',
  'Το 0067 άλλαξε τη χρέωση από τη σωρευτική διαφορά της ημέρας στη διαφορά της κάθε βάρδιας.',
  async (d) => {
    const byId = new Map(d.shifts.map((s) => [s.id, s]));
    const found = [];
    for (const c of d.charges) {
      // Η χρέωση επιθεώρησης μετράει λαχνούς που λείπουν, όχι μετρητά.
      if (c.cause !== 'TILL_SHORTAGE') continue;
      const s = byId.get(c.shift_id);
      if (!s) continue;
      const own = num(s.shift_discrepancy ?? s.discrepancy);
      const tol = Math.max(0, num(s.discrepancy_threshold));
      const expected = own < 0 ? Math.max(0, r2(Math.abs(own) - tol)) : 0;
      if (Math.abs(expected - num(c.amount)) > 0.005)
        found.push(`${c.employee_name} ${athensDay(s.opened_at)}: γραμμένη ${c.amount} · αναμενόμενη ${expected}`);
    }
    return found;
  }
);

check(
  'Κανένας ιδιοκτήτης ή διαχειριστής δεν χρεώνεται',
  'Το sync_shift_close_effects μηδενίζει τη χρέωση για ORG_OWNER / PLATFORM_ADMIN / ORG_ADMIN. Χρέωση σε τέτοιον ρόλο σημαίνει ότι ο έλεγχος ρόλου δεν έτρεξε.',
  async (d) => {
    const EXEMPT = ['ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN'];
    const byId = new Map(d.shifts.map((s) => [s.id, s]));
    const role = new Map(d.users.map((u) => [u.id, u.role_code]));
    return d.charges
      .filter((c) => {
        const s = byId.get(c.shift_id);
        return s && EXEMPT.includes(role.get(s.opened_by_user_id));
      })
      .map((c) => `${c.employee_name}: ${c.amount} € σε βάρδια ιδιοκτήτη`);
  }
);

check(
  'Η αλυσίδα της διαφοράς ανά βάρδια κλείνει',
  'Κάθε βάρδια κουβαλάει ως baseline ό,τι άφησαν οι προηγούμενες της ίδιας μέρας (0067). Αν δεν κλείνει, κάποιος χρεώνεται το μείον άλλου.',
  async (d) => {
    const found = [];
    const groups = {};
    for (const s of d.shifts) {
      if (s.discrepancy_baseline === null || s.discrepancy_baseline === undefined) continue;
      (groups[`${s.store_id}|${s.register_id ?? 'Ταμείο 1'}|${athensDay(s.opened_at)}`] ??= []).push(s);
    }
    for (const [k, list] of Object.entries(groups)) {
      list.sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at));
      let running = 0;
      for (const s of list) {
        if (Math.abs(num(s.discrepancy_baseline) - running) > 0.005)
          found.push(`${k} ${s.shift_type}: baseline ${s.discrepancy_baseline} · αναμενόμενο ${r2(running)}`);
        running = r2(running + num(s.shift_discrepancy));
      }
    }
    return found;
  }
);

check(
  'Οι τιμές των λαχείων είναι αυτές που έδωσε ο ιδιοκτήτης',
  'Η ίδια στήλη έχει σπάσει τέσσερις φορές σε μία μέρα. Το bundle_size λέει «η τιμή είναι ΑΝΑ ΚΟΜΜΑΤΙ και η πεντάδα είναι τόσα»· κενό σημαίνει ότι η μονάδα που μετριέται ΕΙΝΑΙ η συσκευασία.',
  async (d) => {
    const ΣΩΣΤΑ = {
      'Ειδική Έκδοση χ5': { price: 1, bundle_size: 5 },
      'Ειδική Έκδοση χ10': { price: 2, bundle_size: 5 },
      'Λαϊκό Λαχείο': { price: 2, bundle_size: 5 },
      'Πρωτοχρονιάτικο': { price: 5, bundle_size: null },
      'Εθνικό x 20€': { price: 20, bundle_size: null },
    };
    const found = [];
    for (const row of d.catalog.filter((c) => c.kind === 'LOTTERY')) {
      const want = ΣΩΣΤΑ[row.name];
      if (!want) continue;
      const bundle = row.bundle_size === null || row.bundle_size === undefined ? null : Number(row.bundle_size);
      if (num(row.price) !== want.price || bundle !== want.bundle_size)
        found.push(`${row.name}: τιμή ${row.price} / πεντάδα ${row.bundle_size} · σωστό ${want.price} / ${want.bundle_size}`);
    }
    return found;
  }
);

check(
  'Τα μετρητά ισούνται με κοψίματα + κύπελλα κερμάτων',
  'Το counted_cash και ο καταμετρητής είναι δύο σημεία που απαντούν στην ίδια ερώτηση - αλλά τα κέρματα του κυπέλλου μετριούνται ΧΩΡΙΣΤΑ και είναι ήδη μέσα στο counted_cash, δικά της και όσα έστειλαν οι προηγούμενες βάρδιες της μέρας.',
  async (d) => {
    const found = [];

    // Πόσα κέρματα είχαν ήδη φύγει πριν από κάθε βάρδια, ανά μέρα και ταμείο.
    const byDay = {};
    for (const s of d.shifts)
      (byDay[`${s.store_id}|${s.register_id ?? 'Ταμείο 1'}|${athensDay(s.opened_at)}`] ??= []).push(s);
    const carried = new Map();
    for (const list of Object.values(byDay)) {
      list.sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at));
      let before = 0;
      for (const s of list) { carried.set(s.id, before); before = r2(before + num(s.coin_handover)); }
    }

    let legacy = 0;
    for (const s of d.shifts) {
      const den = s.counted_denominations;
      if (!den || Object.keys(den).length === 0) continue;
      // Τα τετράδια του Αυγούστου μπήκαν πριν υπάρξει ο καταμετρητής και
      // κρατούν ΑΞΙΕΣ ανά κόψιμο, όχι πλήθη. Ο καταμετρητής γράφει πάντα και
      // τα κέρματα, οπότε η απουσία τους τα ξεχωρίζει. Μετριούνται, δεν
      // ελέγχονται - δεν είναι λάθος, είναι άλλο πράγμα.
      if (!Object.keys(den).some((k) => Number(k) < 1)) { legacy++; continue; }
      const sum = r2(Object.entries(den).reduce((t, [v, q]) => t + Number(v) * num(q), 0));
      const expected = r2(sum + num(s.coin_handover) + (carried.get(s.id) ?? 0));
      if (Math.abs(expected - num(s.counted_cash)) > 0.005)
        found.push(`${athensDay(s.opened_at)} ${s.shift_type}: counted_cash ${s.counted_cash} · κοψίματα+κύπελλα ${expected}`);
    }
    if (legacy && !QUIET) console.log(`   (${legacy} παλιές εγγραφές εισαγωγής δεν ελέγχονται - κρατούν αξίες, όχι πλήθη)`);
    return found;
  }
);

check(
  'Κανένα πακέτο «στο μαγαζί» χωρίς βάρδια να το κρατάει',
  'Το moved_shift_id είναι SET NULL: σβήνεις τη βάρδια και το πακέτο μένει στον πάγκο χωρίς κανέναν υπεύθυνο. Γυρνάει με την «Αναίρεση παραλαβής».',
  async (d) => {
    const live = new Set(d.shifts.map((s) => s.id));
    return d.packs
      .filter((p) => p.status === 'IN_STORE' && (!p.moved_shift_id || !live.has(p.moved_shift_id)))
      .map((p) => `παιχνίδι ${p.game_no} πακέτο ${p.pack_code ?? '—'}`);
  },
  'WARN'
);

check(
  'Πιστώσεις πελατών που έμειναν από σβησμένη βάρδια',
  'Το client_line_id το γράφει μόνο η υποβολή βάρδιας. Χωρίς shift_id σημαίνει ότι η βάρδια σβήστηκε και το χρέος κρατήθηκε - νόμιμη επιλογή, αλλά πρέπει να φαίνεται.',
  async (d) => {
    const orphans = d.credits.filter((t) => !t.shift_id && t.client_line_id);
    if (!orphans.length) return [];
    const net = r2(orphans.reduce((a, t) => a + (t.type === 'GRANTED' ? num(t.amount) : -num(t.amount)), 0));
    return [`${orphans.length} κινήσεις · καθαρά ${net} € σε ${new Set(orphans.map((t) => t.customer_id)).size} πελάτες`];
  },
  'WARN'
);

// ── εκτέλεση ─────────────────────────────────────────────────────────────
const orgFilter = ORG ? `&organization_id=eq.${ORG}` : '';

const data = {
  shifts: await all('shifts', `select=id,store_id,register_id,opened_at,shift_type,status,opened_by_user_id,counted_cash,counted_denominations,coin_handover,discrepancy,shift_discrepancy,discrepancy_baseline,discrepancy_threshold${orgFilter}`),
  customers: await all('customers', `select=id,name,current_debt${orgFilter}`),
  // Το order ΕΙΝΑΙ μέρος του ελέγχου. Το χρέος κόβεται στο μηδέν σε κάθε
  // βήμα, οπότε άλλη σειρά δίνει άλλο αποτέλεσμα - και χωρίς αυτό ο
  // πρώτος έλεγχος κατηγόρησε 8 πελάτες που ήταν μια χαρά.
  credits: await all('customer_credit_transactions', `select=customer_id,shift_id,type,amount,created_at,client_line_id&order=created_at${orgFilter}`),
  charges: await all('employee_charges', `select=shift_id,amount,cause,status,employee_name${orgFilter}`),
  expenses: await all('shift_expenses', `select=id,shift_id${orgFilter}`),
  packs: await all('scratch_warehouse_packs', `select=id,status,moved_shift_id,game_no,pack_code${orgFilter}`),
  catalog: await all('scratch_catalog', `select=name,kind,price,bundle_size${orgFilter}`),
  users: await all('users', `select=id,role_code${orgFilter}`),
};

if (!QUIET) {
  console.log(`ΕΛΕΓΧΟΙ ΑΚΕΡΑΙΟΤΗΤΑΣ${ORG ? ` — ${ORG}` : ''}`);
  console.log(
    `${data.shifts.length} βάρδιες · ${data.customers.length} πελάτες · ` +
    `${data.credits.length} κινήσεις · ${data.charges.length} χρεώσεις · ${data.packs.length} πακέτα\n`
  );
}

let errors = 0;
let warnings = 0;

for (const c of checks) {
  let found;
  try {
    found = await c.fn(data);
  } catch (err) {
    // Ένας έλεγχος που έσκασε δεν είναι «πέρασε». Αυτό ακριβώς το λάθος
    // έκανε η πρώτη εκδοχή του fetchShiftDeletionCounts.
    console.log(`✗ ${c.name}\n   ο ΕΛΕΓΧΟΣ απέτυχε: ${err.message}`);
    errors++;
    continue;
  }

  if (found.length === 0) {
    if (!QUIET) console.log(`✓ ${c.name}`);
    continue;
  }

  const mark = c.level === 'WARN' ? '!' : '✗';
  if (c.level === 'WARN') warnings++; else errors++;
  console.log(`${mark} ${c.name}`);
  console.log(`   ${c.why}`);
  for (const f of found.slice(0, 20)) console.log(`     · ${f}`);
  if (found.length > 20) console.log(`     … και άλλα ${found.length - 20}`);
}

console.log(
  `\n${errors === 0 ? 'ΚΑΘΑΡΟ' : `${errors} ΣΦΑΛΜΑΤΑ`}` +
  `${warnings ? ` · ${warnings} προειδοποιήσεις` : ''}`
);
process.exit(errors === 0 ? 0 : 1);
