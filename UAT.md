# ShiftLedger — UAT change list

Changes requested after user-acceptance testing, with the decisions that were
taken on each before any code moved. Companion to `BACKLOG.md`: that file holds
open work the Owner is blocked on, this one holds work UAT asked for.

Round 1 captured 2026-10-14. The Owner said this is "almost half" of what is
coming, so expect a round 2.

**Status key**: `TODO` · `IN PROGRESS` · `DONE` (with commit)

---

## Decisions taken up front

Four questions were asked before building, because each one changed the size of
the work by an order of magnitude. The answers all protect the August 2026 P&L.

| Question | Decision |
|---|---|
| How deep does the VLT delete go? | **Sidebar module only.** Keep `vlts_cash_in`/`vlts_cash_out` on shifts and `vlt_reconciliations` in the P&L. |
| How deep does the FnB delete go? | **Sidebar module only.** Keep `fnb_cash`/`fnb_card`, `EXPENSES_FNB` and the P&L's F&B unit. |
| Who may settle an employee's discrepancy charge? | **Owner + Store Manager** — widen `resolve_employee_charge()` from `auth_is_owner()` to `auth_is_elevated()`. |
| What auto-creates an incident? | **Any shift closing off-balance**, short or over, from the same trigger that raises the charge. |

Why the first two matter: store 401070 carries €300.890 of VLT cash in August,
and store 101499's F&B unit carries **+3.511,59** — the only positive line in
the month. Removing either capability outright would have rewritten real
financial history to tidy up a sidebar.

---

## A. Deletions

| # | Item | Status |
|---|---|---|
| A1 | **Παιχνίδια ΟΠΑΠ** — remove the module entirely | **DONE** |
| A2 | **Τερματικά VLTs** — remove the module and the terminals registry | **DONE** |
| A3 | **FnB & Αναψυκτήριο** — remove the module and per-item sales entry | **DONE** |

A1 is isolated: `OpapGamesManager` is referenced only by `App.tsx` and itself.
It is also still printing invented figures (`1850 / 12 / 1120`) whenever no
shift is open, so deleting it closes the last of the fabricated-data problem
fixed in `c44b93c`.

The closing wizard's «Συμπλήρωση από Τερματικά» button went with A2: it read
the terminals registry, and with no way left to enter a terminal it could only
ever report "none found". Its own code comment already flagged the meter maths
as an unconfirmed assumption, so nothing trustworthy was lost.

A2 and A3 are **UI-only deletes** per the decision above. What goes: the sidebar
entries, the route cases, `VltManager.tsx`, `FnbManager.tsx`, and the
`opap.view` / `vlt.view` / `fnb.view` permissions. What stays: every field the
closing wizard captures and everything the P&L reads.

`vlt_terminals` (migration 0009) becomes orphaned — it is a manual registry
nothing else reads. Leave the table; dropping it is irreversible and buys
nothing.

---

## B. Βάρδιες & Ταμείο — layout

| # | Item | Status |
|---|---|---|
| B1 | Delete the **ΗΜΕΡΗΣΙΟ** tab | **DONE** |
| B2 | Delete the **ΚΑΤΑΜΕΤΡΗΜΕΝΟ ΤΑΜΕΙΟ** KPI card | **DONE** |
| B3 | Drop the Αρχικό / Αναμενόμενο / Καταμετρημένο columns from the shift list | **DONE** |
| B4 | Put the open shift at the top as a button, so staff never hunt for it | **DONE** |

B1 caveat: `DailyAggregationView` is rendered in **two** places — the Βάρδιες
tab and `ReportsManager.tsx:501`. Removing the tab leaves the component alive
under Αναφορές. That is the right default (managers keep the daily Z view,
staff stop seeing it) but it is a deliberate choice, not an oversight.

B4 turned up a bug worth recording. The header button counts open shifts from
the loaded list, **not** from `activeShift`, because `activeShift` only ever
matches `currentStore?.id || 'store_opap_01'` — so with «Όλα τα Καταστήματα»
selected it silently resolves to a demo store and the active-shift hero card
never appears. The hero card still has that bug; the new button does not.

Adding the button also exposed a disagreement that was already in the file: the
KPI card counted only `OPEN`/`DRAFT_CLOSING` as open, while every other site —
the hero card, both ΚΛΕΙΣΙΜΟ buttons — also counted `CORRECTION_REQUESTED` and
`REOPENED`. The page showed "1 ΑΝΟΙΧΤΕΣ" beside "2 ΑΝΟΙΧΤΕΣ ΒΑΡΔΙΕΣ". Now one
`OPEN_SHIFT_STATUSES` constant feeds all six sites.

---

## C. Visibility — who sees what

| # | Item | Status |
|---|---|---|
| C1 | Employee sees only their **own shifts** | **DONE** |
| C2 | Employee sees only their **own expenses** | **DONE** |
| C3 | **Συμβάντα & Αποκλίσεις** hidden from the employee | **DONE** |

**C1 and C2 need a migration, not a UI filter.** Today `shifts_select`,
`shift_expenses_select` and `incidents_select` are all plain
`belongs_to_org(organization_id)` (`0002_rls.sql:146`, `:175`, `:234`), so every
employee can read every shift and every expense in the organisation straight
from the API. Filtering in React would look right and protect nothing.

Ownership columns already exist and are populated: `shifts.opened_by_user_id`,
`shift_expenses.created_by_user_id`. The policy shape is the one
`employee_charges` already uses:

```sql
USING (belongs_to_org(organization_id) AND (auth_is_elevated() OR <owner_col> = auth.uid()))
```

C3 dropped `incidents.view` from **both** `EMPLOYEE` and `SHIFT_SUPERVISOR`.
`auth_is_elevated()` excludes supervisors, so leaving them the tab would have
opened a list RLS keeps permanently empty.

### What the policies could not simply forbid

Two live flows read across employees for good reasons, and a naive "own rows
only" rule breaks both.

**Handover.** `ShiftOpeningModal` reads the *previous* shift at the register to
carry over cash, coins and scratch inventory — and at a handover that shift
belongs to someone else. Once private, the carry-over would silently fall back
to 0 and the next till would read wildly over. `shift_handover_snapshot()` is
SECURITY DEFINER and returns only those carry-over fields.

**The money trap.** The closing wizard builds `expected_cash` — and therefore
`discrepancy` — from the expenses it can read, and `discrepancy` is what the
0018 trigger turns into an `employee_charges` row. Hide a manager's €200
supplier payment from the employee closing that till and the app charges them
€200 for their manager's spending. `shift_reconciliation_expenses()` gives the
wizard the full picture for the one shift it is closing.

Shifts that are **still open** stay readable org-wide, so live records can be
attached to them. Only closed history is private. The double-open guard never
depended on this: `ux_shifts_one_active_per_register` (0001_schema.sql:232)
enforces it in the database.

`shifts` and `shift_expenses` also had org-wide `UPDATE`/`DELETE`, so staff
could edit a colleague's open shift or delete anyone's expense. Both are now
scoped.

### Verified
`supabase/scripts/test-rls.mjs` grew cases 9–16 and runs **17/17**, every
assertion made through a real employee session rather than the service role.
Cases 15 and 16 cover the two flows above.

---

## D. Monthly discrepancy ledger

| # | Item | Status |
|---|---|---|
| D1 | A live monthly total-discrepancy view under Βάρδιες | **DONE** |
| D2 | Owner **or Manager** may settle a charge when the employee pays | **DONE** |
| D3 | A correction path for a discrepancy caused by a data-entry error | **DONE** |

About 70% of this exists already as `employee_charges` (migration 0018), which
is better than it looks: charges are raised by an `AFTER` trigger on `shifts`,
so no client path can close a short shift without one appearing. It already has
`OPEN / SETTLED / WAIVED / CANCELLED`, an audit-logged resolve function, and RLS
scoping an employee to their own rows.

What is missing is the month grouping, the live refresh, and D3.

D2 needs a migration: `resolve_employee_charge()` currently raises
`42501` unless `auth_is_owner()`, which excludes `STORE_MANAGER`.

D3 is genuinely new. The distinction that matters: **settling** a charge records
that money changed hands, **correcting** one records that the money was never
missing. They must not share a status, or the ledger stops meaning anything.
«Διόρθωση» therefore sends the shift back to `CORRECTION_REQUESTED` — the status
the app already had — and leaves the charge for `sync_shift_close_effects()` to
cancel by itself once the shift is resubmitted balanced.

### Built as

A new **ΑΠΟΚΛΙΣΕΙΣ** tab in Βάρδιες & Ταμείο: month stepper, four totals, a
per-operator table, and the charge list with Εξόφληση / Διαγραφή / Διόρθωση.

Migration 0023 adds `incidents.shift_id`, widens `resolve_employee_charge()` to
`auth_is_elevated()`, adds `monthly_discrepancy_summary()`, and raises an
incident automatically whenever a till closes off-balance — as a **separate**
trigger, because `sync_shift_close_effects()` already creates charges, cancels
them on correction and fans out handover notifications, and rewriting 160 lines
of that to append one INSERT risks all of it.

Two things the build itself exposed:

- **ΑΝΕΞΟΦΛΗΤΑ is deliberately not month-scoped.** A shortage nobody paid is
  still owed in November, and a card resetting to €0 each month would hide the
  one balance this page exists to track. Open charges from earlier months are
  listed too, for the same reason.
- **The rollup groups by user id alone**, taking the name last worked under.
  Grouping by name as well split one person into several rows the moment it
  changed — which is exactly what happens when the «Χωρίς όνομα» employees get
  real names.

### Follow-on: «Χρεώσεις Υπαλλήλων» removed
Its own sidebar tab is gone — the ledger covers it. It was *not* a strict
subset first, though: that page also showed **who owes what across all months**,
which the ledger's month-scoped table did not. That strip was added here before
the page was deleted, so nothing was lost.

`employee_charges.view` went with the tab. `employee_charges.manage` was marked
Owner-only, which 0023 made untrue, so it is now granted to exactly the roles
`auth_is_elevated()` covers and the ledger gates on it by name instead of
repeating a role list that could drift from the database.

### Verified
`test-rls.mjs` gains cases 17–20 and runs **21/21**. The incident is raised with
the right severity and a Greek-formatted title, correcting a shift to balance
resolves it, a STORE_MANAGER (not an owner) can settle, and the rollup shows
everyone to a manager but only their own row to staff.

Against real data, Αύγουστος 2026 reads +€3,88 over 4 shifts — €3,61 of
shortages against €7,49 of surpluses — which is exactly the four till
discrepancies the workbook import was verified against (−0,85 / +6,07 / −2,76 /
+1,42).

---

## E. Έξοδα & Δαπάνες

| # | Item | Status |
|---|---|---|
| E1 | Per-day and per-month totals | **DONE** |

Built as a month stepper (◀ Αύγουστος 2026 ▶) with an «Όλα» escape hatch,
reusing `currentMonthKey` / `shiftMonthKey` / `monthLabel` from `pnlEngine.ts`
rather than new helpers, plus a scrollable per-day strip under the cards where
each day is clickable to filter the table.

It opens on the latest month that actually has expenses, not on today's, which
would show an empty screen whenever nothing has been spent yet this month.

**This slice had to start with a bug.** The table displayed `created_at` — when
the row was *written* — rather than `date`, when the money was spent. The August
import wrote all 94 of its rows in one second on 14/09, so every August expense
was shown, and would have been counted, as a September one:

| grouped by | result |
|---|---|
| `date` | 94 in August, 2 in July, 2 in September |
| `created_at` | all 98 in September |

Monthly totals built on `created_at` would have been silently wrong for every
imported month. The list query now orders by `date` too — ordering by
`created_at` alone left 94 rows sharing one timestamp in arbitrary order, which
reads as broken once the real date is on screen.

The third card said «Μέσο Έξοδο ανά Βάρδια» but divided by the number of
*expenses*, not of shifts. It is now «Μέσος Όρος Ημέρας», which is both true and
the figure you want when looking at a month.

Verified against live data: all-time €6.265,46 over 98 entries matches what the
screen showed before; August alone is €5.965,86 over 94 entries across 25 days;
the €299,60 difference is exactly the two July rows (137 + 162,60).

---

## F. Επισκόπηση (Dashboard)

| # | Item | Status |
|---|---|---|
| F1 | Pending shifts and open items, admin/manager only | **ALREADY DONE** |
| F2 | Remove the tab for the employee | **ALREADY DONE** |

Neither needs work. `EMPLOYEE` and `SHIFT_SUPERVISOR` have no `dashboard.view`
in `rbac.ts`, so the sidebar entry and the route are both already closed, and
the pending-approvals banner at `DashboardOverview.tsx:193` is gated on
`canApprove`.

Open question for round 2: **"εκκρεμότητες" may mean more than pending
approvals** — unsettled employee charges, shifts left open overnight, unresolved
incidents. Worth confirming what belongs on that banner.

---

## Build order

```
A (deletions) ──┐
B (layout)    ──┤  independent, no DB work, no collisions
E (totals)    ──┘

C (RLS + visibility) ──→ D (discrepancy ledger)
```

A, B and E are pure subtraction or additive UI. They touch no migration and
cannot conflict with round 2, so they go first.

C before D: the discrepancy ledger's whole point is that an employee sees their
own balance and a manager sees everyone's. Building that view on top of
org-wide RLS would mean writing the access rules twice.

---

# Round 2

Captured 2026-10-14. Planned in `plans/006-commissions-and-profitability.md`,
which carries the four decisions taken before any code moved.

| # | Item | Status |
|---|---|---|
| R2.1 | «Καταχώρηση Προμηθειών» — the monthly Allwyn report, three entities per store | **DONE** `bb9e308` |
| R2.2 | Δείκτης Απωλειών → Δείκτης Κερδοφορίας | **DONE** `bb9e308` |
| R2.3 | Period and store scope on the Reports overview | **DONE** `bb9e308` |
| R2.4 | Έξοδα Εταιρίας shortcut | **DONE** `bb9e308` |
| R2.5 | Expense pie with percentages and amounts | **DONE** `bb9e308` / `063a21d` |

## Why the expense pie is by supplier

The ask was «ανά κατηγορία». The data decided against it: all 94 of August's
expense rows carry one of **two** category values, `EXPENSES_GP` or
`EXPENSES_FNB`, so a pie of that is two slices. The same month has 17 distinct
suppliers. «Κατανομή Εξόδων» still answers *what kind of cost* in five P&L
buckets; «Έξοδα ανά Προμηθευτή» answers *to whom*.

## Data correction applied 2026-10-14

The supplier breakdown immediately exposed the same business recorded under two
spellings, because the August import took each store's sheet with its own
convention:

| Was | Store | Became |
|---|---|---|
| `Hausbranft` (6 rows) | 101499 | `Hausbrandt` |
| `HAUSBRANDT` (2 rows) | 401070 | `Hausbrandt` |
| `OSTRIA` (2 rows) | 401070 | `Ostria` |

Applied through the service role; only the `recipient` label changed, and the
expense total held at **€6.265,46** before and after. Hausbrandt now reads
€1.586,78 — 26,6% and the second largest supplier, where before it looked like
two smaller ones.

The app folds case when grouping suppliers, so `OSTRIA`/`Ostria` already
merged on screen; `Hausbranft` differs by a letter and needed the data fixed.

To reverse: the rows are identifiable by `notes = 'Εισαγωγή P&L_0826'` and the
store/category split above.

---

## Round 2, second batch

Planned in `plans/007-payroll-suppliers-and-staff-accounts.md`.

| # | Item | Status |
|---|---|---|
| R2.6 | What each employee owes from till shortages, on their payroll row | **DONE** `3f642b3` |
| R2.7 | Suppliers synced with the expenses | **DONE** `d1c98a4` |
| R2.8 | Staff accounts with a username and password, no email | **DONE** `24956b9` |

### Decisions

| Question | Decision |
|---|---|
| Till debt — deduct from «Χέρι» or display? | **Display.** Deducting from wages is legally constrained; the Owner decides. Pinned by `payroll_till_debt.test.ts`. |
| How does a payroll row find its account? | **An explicit dropdown.** Never matched on name — the live data has both «Γιώργος Χριστοδούλου» and «ΧΡΙΣΤΟΔΟΥΛΟΥ ΓΕΩΡΓΙΟΣ». |
| Free-text suppliers? | **Pick from the list, new ones join the registry** when typed. |
| Should the vendor issue credentials? | **No.** The Owner does. See below. |

### Most of the payroll ask already existed
`payroll_records` and the row editor have carried Μισθός, Αυξ. Μισθού,
Υπερωρίες, Δώρο Χρ., Επ. Αδείας, Αποζ. Αδείας, Bonus, Ποσό σε Τράπεζα and
Προκαταβολή — per store, per month — since the P&L was built, with «Χέρι»
computed as σύνολο − τράπεζα − προκαταβολή. Only the till debt was new.

### Why the vendor does not issue credentials
The platform will be sold to agencies. Routing staff passwords through whoever
sells it would mean the vendor had possessed the credentials of the very people
this app charges for till shortages, which weakens every audit entry and every
charge it raises. The Owner issues them instead; the app shows each password
once and stores it nowhere.

Staff have no mailbox, so a username is mapped to
`<username>@staff.shiftledger.local` — a login handle, never a mailbox. That
makes usernames unique across the whole platform: a second agency wanting the
same one is told it is taken. Revisit if that becomes awkward.

### Found while verifying
`server.ts` never loaded `dotenv`, so **every API route needing the service
role has failed in local development since the server existed** — invites, the
copilot, the shift-summary email. Vercel supplies the variables from project
settings, so production worked and local silently did not. `wrapHandler` also
swallowed the error without logging it. Both fixed in `823df22`.

### Not verified
Signing in as a staff account and hitting the forced password-change screen.
Typing someone's password to authenticate is the Owner's to do, not Claude's.
