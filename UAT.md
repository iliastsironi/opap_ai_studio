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
| D1 | A live monthly total-discrepancy view under Βάρδιες | TODO |
| D2 | Owner **or Manager** may settle a charge when the employee pays | TODO |
| D3 | A correction path for a discrepancy caused by a data-entry error | TODO |

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

---

## E. Έξοδα & Δαπάνες

| # | Item | Status |
|---|---|---|
| E1 | Per-day and per-month totals | TODO |

The page totals whatever the filters leave behind and nothing else. Adding a
period selector next to the existing category filter is the smallest change
that answers "what did we spend in September".

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
