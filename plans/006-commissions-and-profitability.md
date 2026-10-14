# 006 — Commission entry, profitability, and a Reports overview that respects the period and the store

- **Status**: TODO
- **Source**: UAT round 2, 2026-10-14
- **Severity**: HIGH — τζίρος is the top line of every figure on the page
- **Depends on**: nothing; 0019 (monthly P&L) and 0023 are already applied

## Decisions taken before any code moved

| Question | Decision |
|---|---|
| Is the Allwyn report one per company or one per store? | **One per store.** Three figures per store per month; the company total is their sum. |
| How does it relate to the existing 8 commission lines? | **Replaces them.** Τζίρος comes only from the three entities. August's rows are migrated, not duplicated. |
| Who may open and enter it? | **Owner only**, same as «Οικονομικό P&L». |
| What does the εταιρικά-έξοδα button do? | **Opens the entry sheet.** Company costs and loans are already in the total; the button is a shortcut, not a maths change. |

The three entities, exactly as they must appear:

```
Allwyn ΑΕ
Ελληνικά Λαχεία ΑΕ
Tora Wallet ΑΕ
```

## What is there now

**Commissions** are 8 dated lines per store (`pnlEngine.ts:11`), or 3 for a PLAY
store (`:12`), chosen by `commissionLinesFor()` (`:50`) and consumed at `:471`
and `:486`. The table `pnl_commission_entries` (0019) holds **exactly two rows**,
both of them `TORA`:

| entry_date | store | line | amount | note |
|---|---|---|---|---|
| 2026-08-31 | store_101499 | TORA | 794,50 | Εισαγωγή P&L_0826 |
| 2026-08-31 | store_101498 | TORA | 268,60 | Εισαγωγή P&L_0826 |

No other line value has ever been used, so the migration has no orphans to
place. The three stores are `store_101498` and `store_101499` (OPAP_AGENCY) and
`store_401070` (PLAY_STORE).

**The Reports overview** (`ReportsManager.tsx`) has five tabs at `:56-60`. Its
P&L cards read `overviewPnl.storesTotal`, which sums **every** store — the store
picker at `:101` only filters the shift KPIs further down, never the money. The
month is `currentMonthKey()` frozen in a `useMemo` with an empty dependency
array (`:122`), so there is no period control at all.

**A pie chart already exists** — «Κατανομή Εξόδων (Cost Mix)», five slices built
at `:152-158`, rendered with recharts. It lists euro amounts under the chart but
**no percentages**.

**The profitability percentage already exists**, buried in the net-result card's
footer as `percentLabel(netResult / storesTotal.revenue)`. The ask is to promote
it to a card of its own.

**Εταιρικά έξοδα and δάνεια are already counted** — `totalCosts()`
(`pnlEngine.ts:706`) includes them, `netResult` (`:688`) subtracts them, and the
cost mix shows them as slices. A button that "adds them to the total" would
double them.

---

## 1. Migration `supabase/migrations/0024_commission_entities.sql`

Keep `pnl_commission_entries`. It already has the right shape — org, store,
date, line, amount — Owner-only RLS from 0019, and the engine already sums it
per store per month. Replacing the table would mean rewriting the engine, the
service and the import for a change that is really about **which line names are
allowed**.

```sql
-- Rename the one line value in use.
UPDATE pnl_commission_entries SET line = 'Tora Wallet ΑΕ' WHERE line = 'TORA';

-- One figure per entity per store per month. Without this a second entry for
-- the same month silently adds to the first, and the Allwyn report is a
-- restatement, not an addition.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pnl_commission_store_month_line
  ON pnl_commission_entries (organization_id, store_id, entry_date, line);
```

Do **not** add a CHECK constraint on `line`. The entity names are Greek text
that may be restated by the provider, and a CHECK would turn a rename into a
migration. The UI offers exactly three; the constraint that matters is
uniqueness.

## 2. Engine — `src/lib/pnlEngine.ts`

```ts
// target — replaces STORE_COMMISSION_LINES and PLAY_COMMISSION_LINES
export const COMMISSION_ENTITIES = ['Allwyn ΑΕ', 'Ελληνικά Λαχεία ΑΕ', 'Tora Wallet ΑΕ'];

export function commissionLinesFor(_storeType: string): string[] {
  return COMMISSION_ENTITIES;
}
```

Every store type now gets the same three. A PLAY store will usually have a
figure only against Allwyn ΑΕ; leave the other two at 0 rather than hiding them,
so a month with a missing figure looks different from a month with a zero.

Keep `commissionLinesFor` as a function even though it ignores its argument —
`:471` and `:486` call it per store, and changing those call sites is churn for
no gain. Keep the parameter named `_storeType` so the next reader sees the
signature is deliberate.

**Nothing else in the engine changes.** The totals are sums over whatever lines
exist, so renaming a line does not move a single euro.

## 3. New tab — «Καταχώρηση Προμηθειών»

A sixth entry in `REPORT_TABS` (`ReportsManager.tsx:56-60`), gated on
`PNL_PERMISSION` exactly like the P&L tab, rendered by a new
`src/components/pnl/CommissionEntrySheet.tsx`.

- Month stepper, reusing `currentMonthKey` / `shiftMonthKey` / `monthLabel`.
- One card per store, each with the three fields and a per-store total.
- A company total under them: the sum of all three stores.
- Saving upserts one `pnl_commission_entries` row per entity, with
  `entry_date` = the **last day of the month** (matching how August was
  imported: 2026-08-31) and `note` = «Μηνιαίο report Allwyn».
- A blank field means "no report for that entity", written as 0.

Reuse `moneyInput.tsx` from `src/components/pnl/` for the fields — it already
handles Greek decimal commas, which is why it exists.

The existing «Προμήθειες» section inside `StorePnlSheet.tsx` keeps working
unchanged, because it renders whatever `commissionLinesFor()` returns. It will
simply show three lines instead of eight.

## 4. Reports overview

### 4.1 A period that can be chosen
Replace the frozen `overviewMonth` (`:122`) with state and a month stepper, same
control as the ledger and the expenses page. Default is the current month.

### 4.2 A store scope
Add a scope selector: **Σύνολο Εταιρείας** plus one entry per store.

The engine already returns `result.stores[]` per store (`pnlEngine.ts:296`), so
this filters what is already fetched — **no new query and no new RPC**.

- **Per store**: τζίρος, έξοδα and result come from that store's sheet. Company
  expenses and loans are *not* attributable to one store, so they are excluded
  and the card says so.
- **Σύνολο Εταιρείας**: `storesTotal` plus `companyExpenses` and `loans`,
  which is what `netResult` already is.

### 4.3 Δείκτης Κερδοφορίας replaces Δείκτης Απωλειών
Delete the Shrinkage card at `:340`. In its place:

```
Δείκτης Κερδοφορίας = καθαρό αποτέλεσμα ÷ τζίρος
```

Per store that is the store's own result over its own revenue; for the company
it is `netResult / storesTotal.revenue`. Show «—» when revenue is 0, never 0% —
a month with no commissions entered has no margin, which is not the same as a
margin of zero. Red below 0, green above.

`totals.shrinkageRate` in `kpiEngine.ts:178` loses its only reader; delete it
and its test if one exists.

### 4.4 The pie chart gains percentages
Keep the chart and its five categories. In the legend beneath, add the share
next to each amount:

```
Μισθοδοσία        €9.110,00   38,4%
```

Percentages are of the period's total cost, to one decimal, with a Greek decimal
comma. They must sum to 100,0% — if rounding makes them miss, absorb the
difference in the largest slice rather than printing a set that does not add up.

### 4.5 The company-costs shortcut
A button beside the cost mix: «Έξοδα Εταιρίας», which sets `activeTab` to
`'PNL'` and the P&L's own view to the company sheet. It changes no figure.

Place it next to the existing «Άνοιγμα P&L» link at `:285`, which is the same
idea and should look the same.

## 5. Tests

`src/tests/pnl_engine.test.ts` holds the August fixture. Update the two
commission lines at `:86-87` and the one at `:287` from `'TORA'` to
`'Tora Wallet ΑΕ'`. **The expected results must not change**, and that is the
point of the exercise:

| Unit | Expected |
|---|---|
| 101499 | −1.938,30 |
| 101499 F&B | 3.511,59 |
| 101498 | −1.732,21 |
| 401070 | −4.212,87 |
| Έξοδα Εταιρίας | 6.034,91 |
| Δάνεια | 2.634,00 |
| **Καθαρό** | **−13.040,70** |

If any of those move, the rename has changed a figure it had no business
changing — stop and find out why.

Add a new test file `src/tests/commission_entities.test.ts`:
- every store type returns the same three entities;
- a month with one entity filled and two blank totals correctly;
- the profitability ratio is `—` at zero revenue, not `0%`;
- cost-mix percentages sum to 100,0 after rounding.

## Boundaries

- Do **NOT** create a new commissions table. The existing one holds the real
  August figures and is wired into the engine, the service and the Excel export.
- Do **NOT** change any total, sum or formula in `pnlEngine.ts`. This plan
  renames lines and changes what is displayed; the arithmetic is already right
  and is pinned by the August fixture.
- Do **NOT** add company expenses or loans anywhere they are not already
  counted. They are in `totalCosts()` and in `netResult` today.
- Do **NOT** widen `PNL_PERMISSION`. The new tab is Owner-only, like the P&L.
- Do **NOT** remove the «Προμήθειες» section from `StorePnlSheet.tsx`. It reads
  the same data and will show three lines by itself.
- Do **NOT** delete `pnl_commission_entries.batch_id`. The import used it and
  the Excel export may still group by it.

## Verification

**Mechanical**
- `npx tsc --noEmit` → exit 0
- `npx vitest run` → all pass, including the untouched August expectations
- `npx vite build` → succeeds

**Database**, after 0024:
```sql
SELECT line, count(*), sum(amount) FROM pnl_commission_entries GROUP BY line;
-- expect exactly: Tora Wallet ΑΕ | 2 | 1063.10
```

**Browser, as Owner**
- Αύγουστος 2026 still reads −13.040,70 at company scope.
- Switching scope to 101499 shows that store alone and excludes company costs.
- Entering 100 against Allwyn ΑΕ for 101499 raises both that store's τζίρος and
  the company τζίρος by exactly 100, and the profitability index moves with it.
- Entering the same month twice restates the figure rather than doubling it.
- The pie legend's percentages sum to 100,0%.
- «Έξοδα Εταιρίας» lands on the company sheet in the P&L.

**Browser, as Manager**: no «Καταχώρηση Προμηθειών» tab, no P&L tab, no money
cards — unchanged from today.

**Cleanup**: remove the test commission entry added above, leaving August's two
migrated rows exactly as they were.
