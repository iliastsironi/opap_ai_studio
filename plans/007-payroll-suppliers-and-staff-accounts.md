# 007 — Payroll debts, a real supplier registry, and accounts for staff without email

- **Status**: TODO
- **Source**: UAT round 2, second batch, 2026-10-14
- **Depends on**: 0018 (employee_charges), 0023 (the discrepancy ledger)

Three independent pieces. They can ship in any order; C is the largest and the
only one that touches authentication.

## Decisions taken before any code moved

| Question | Decision |
|---|---|
| Till debt on a payroll row — deduct or display? | **Display.** The app never silently reduces someone's pay. |
| How does a payroll row find its user account? | **An explicit dropdown.** No name matching. |
| Free-text suppliers after the registry exists? | **Pick from the list, create new inline.** |
| Staff with no email address? | **Owner generates a one-time credential**, shown once, forced change at first login. |

---

# A. Payroll: what each person owes

## What is already there
`payroll_records` and `PayrollRowModal` already carry everything UAT listed:
Μισθός, Αυξ. Μισθού, Υπερωρίες, Δώρο Χρ., Επ. Αδείας, Αποζ. Αδείας, Bonus,
**Ποσό σε Τράπεζα**, **Προκαταβολή** — per store, per month, with
`payrollCashInHand()` computing «Χέρι» = σύνολο − τράπεζα − προκαταβολή.

## What is missing
What the person owes from till shortages. That lives in `employee_charges`
(0018) keyed on `employee_user_id`, while a payroll row is a free-text `name`.
There is no join, so the two have never met.

## Migration `0025_payroll_user_link.sql`
```sql
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_payroll_user ON payroll_records (user_id) WHERE user_id IS NOT NULL;
```
Nullable on purpose: a payroll row for someone who has no login — a relative
helping out, someone who left — is still a valid row.

## Engine
`PnlPayrollRow` gains `userId: string | null` and `openCharges: number`.
`payrollCashInHand()` **does not change**. The debt is reported beside «Χέρι»,
never inside it, which is the decision above and the reason that function stays
untouched.

## UI
- `PayrollRowModal` gains a «Λογαριασμός χρήστη» selector listing the org's
  users, with «— κανένας —» as the default.
- `PayrollSheet` gains an **«Οφειλή Ταμείου»** column, showing that person's
  OPEN `employee_charges` total across all months, with a link into
  ΑΠΟΚΛΙΣΕΙΣ to settle it.
- A row with a debt and no linked account shows «—» and a quiet hint to link
  one, so an unlinked row never looks like a person who owes nothing.

## Boundary
Do **NOT** change `payrollTotal()` or `payrollCashInHand()`. Those produce the
figures the August fixture pins, and the debt is additional information, not an
adjustment to pay.

---

# B. Suppliers that actually sync with the expenses

## What is there
`suppliers` has a full schema — company name, VAT number, category, contact,
`is_active` — and **zero rows**. `ExpensesManager` already reads it and falls
back to a hardcoded preset list. Expenses store a free-text `recipient`.

That free text is how August ended up with `Hausbranft` and `HAUSBRANDT` as two
suppliers for one business, already corrected in the data on 2026-10-14.

## Backfill
From August's distinct recipients, after the correction:

```
Κάβα Ζωγρ · Hausbrandt · Κοπανης · Ostria · Πάγος · EVENT · Οικονόμου
Μοσκαχλαιδής · ΓΡΙΒΑΣ · Αρώματα · Τζάμια · Περίπτερο · S/M  (+ the rest)
```

Create one `suppliers` row per distinct `recipient` currently in
`shift_expenses`, category `OTHER` unless the name already maps to a known one,
`is_active = true`. Names are taken verbatim — this backfill must not rename
anything, because the data was deliberately normalised already.

## Entry
`ExpensesManager`'s supplier field becomes a combobox over the registry, with
«+ Νέος προμηθευτής» creating one inline from the same field and selecting it.
Staff are never blocked mid-shift by a supplier that is not on the list, and
the registry grows instead of the spelling drifting.

The expense keeps storing `recipient` as text — reporting already groups on it,
and `supplier_id` would need every historical row backfilled to be useful. The
registry's job here is to stop the drift at entry.

---

# C. Accounts for staff who have no email

## Why not the obvious thing
UAT asked whether *we* should create and send usernames and passwords. No — and
the app already does better. `api/_lib/usersInviteHandler.ts` creates the auth
user with a random placeholder password **never handed to anyone** (its own
comment, line 19), generates a Supabase invite link, and emails it; the invitee
sets their own password.

Routing credentials through the vendor would mean the vendor has possessed the
credentials of people this very app charges for till shortages. That weakens
every audit entry and every charge the system raises.

The real gap is narrower: `users.email` is `NOT NULL UNIQUE` and shop staff
often have no address.

## Migration `0026_staff_credentials.sql`
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_placeholder_email BOOLEAN NOT NULL DEFAULT FALSE;
```

## Server — extend `usersInviteHandler`
A `mode: 'CODE'` branch:
1. Generate a placeholder address, `<slug>.<4 random>@staff.shiftledger.local`.
   Never routable, so nothing is ever sent to it.
2. Generate a strong password.
3. `admin.auth.admin.createUser({ email, password, email_confirm: true })`.
4. Set `must_change_password = true`, `has_placeholder_email = true`.
5. Return the username and password **once** in the response.

The password is never stored by us, never emailed, and never logged. It exists
in the response body and on the Owner's screen, and nowhere else.

## UI
- Χρήστες & Αναθέσεις gains «Χωρίς email» beside the existing invite.
- The result panel shows the credentials once, with a copy button and an
  explicit warning that they will not be shown again.
- On sign-in, a user with `must_change_password` is sent to a mandatory
  change-password screen before anything else loads, which clears the flag.

## Boundaries
- Do **NOT** remove or weaken the existing email invite. It stays the default.
- Do **NOT** store the generated password anywhere — not in `users`, not in
  `audit_logs`, not in a console line.
- Do **NOT** let an Owner read or regenerate a password for an existing user.
  Lost credentials are handled by generating a new one, which the forced change
  then replaces.
- `must_change_password` is cleared only by the user changing it themselves.

---

## Verification

**Mechanical**: `npx tsc --noEmit`, `npx vitest run`, `npx vite build`.

**A** — a payroll row linked to a user with an open charge shows that amount in
«Οφειλή Ταμείου»; «Χέρι» is unchanged by it; the August fixture still produces
−13.040,70.

**B** — the registry lists August's suppliers after the backfill; entering an
expense offers them; creating one inline selects it; the supplier pie still
totals €5.965,86 for August, because nothing was renamed.

**C** — a staff account created without email can sign in with the generated
credentials, is forced to change the password, and after changing it the flag
is clear and a second sign-in goes straight through. The password appears in
no log and no table.

Add to `supabase/scripts/test-rls.mjs`: a user with `must_change_password` is
an ordinary user as far as RLS is concerned — the flag gates the UI, not the
data, and must not accidentally become an authorisation bypass.
