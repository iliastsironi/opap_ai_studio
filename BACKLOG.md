# ShiftLedger — Backlog

> Going live is tracked separately in [DEPLOYMENT.md](DEPLOYMENT.md) — what is
> still wrong with a system that is already running, ordered by what blocks what.

Running list of open work. Split by who is blocked: figures only the Owner has,
features waiting to be built, and debt worth paying before it bites.

Last updated: 2026-09-17

---

## 1. Data gaps — these distort the August P&L today

August currently reports **−12.911,80 €**. That figure is not trustworthy until
the two items below are filled in; they pull in opposite directions.

### 1.1 Payroll salaries — understates costs by ~5.866 €
The workbook's `Μισθός` column is blank for all 11 people, so each person's
Σύνολο is 0 while **6.175,89 €** actually went to their bank. That is why every
row shows a negative «Χέρι» (−666,86 € each). Missing data, not a broken
formula — pinned by a test in `src/tests/pnl_engine.test.ts`.

Needed: a monthly salary per person, plus real names for the five rows still
called «Χωρίς όνομα».

| Store | Unit | Name | To bank |
|---|---|---|---|
| 101499 | Κατάστημα | ΧΡΙΣΤΟΔΟΥΛΟΥ ΓΕΩΡΓΙΟΣ | 666,86 (+310 υπερωρίες) |
| 101499 | Κατάστημα | *Χωρίς όνομα 1* | 666,86 |
| 101499 | F&B | Νάντια Κολοβελώνη | 666,86 |
| 101499 | F&B | *Χωρίς όνομα 2* | 666,86 |
| 101498 | Κατάστημα | Κατερίνα Αχινιώτη | 666,86 |
| 101498 | Κατάστημα | Κατερίνα Μολέ | 666,86 |
| 401070 | Κατάστημα | Κριστίνα Τσιμπούκα | 756,49 |
| 401070 | Κατάστημα | Τάσος Δραχτίδης | 0 |
| 401070 | Κατάστημα | *Χωρίς όνομα 3* | 633,33 |
| 401070 | Κατάστημα | *Χωρίς όνομα 4* | 784,91 |
| 401070 | Κατάστημα | *Χωρίς όνομα 5* | 0 (προκαταβολή 305) |

Modelled at a flat 800 €: every negative «Χέρι» clears, payroll totals 9.110 €,
and August falls to −21.711,80 €. Two people land on thin margins at that
figure (Τσιμπούκα +43,51 €, Χωρίς όνομα 4 +15,09 €) and would go negative again
on a slightly lower salary.

### 1.2 401070 commissions — understates revenue by an unknown amount
Its `ΠΡΟΜΗΘΕΙΕΣ` block is empty (ALLWYN VLTs, BONUS, ΕΠΔ CT all blank,
ΣΥΝΟΛΟ 0), so the store reads **−4.050,27 €** with zero revenue — while having
counted **300.890 €** of VLT cash in August. The engine raises `NO_COMMISSIONS`
for it. The figure is missing, not zero.

### 1.3 Allwynnet figures for 8 pending VLT counts
Imported and showing «ΕΚΚΡΕΜΕΙ»: 101499 on 17/08, 24/08, 29/08 · 101498 on
29/08 · 401070 on 26/08, 27/08, 28/08, 30/08. With the official figures they
become real reconciliations instead of unmatched counts.

### 1.4 The other 27 August daily workbooks
Four of 31 are imported (27–30/08 at 101499). The import path is proven; the
rest would fill the month's «Διαχείριση Ταμείου».

---

## 2. Requested features — **deferred to future development**

Parked on 2026-10-15 at the Owner's decision. All three need file storage,
which does not exist yet; 2.1 and 2.3 cannot start without it.

### 2.1 Photo / scan of the Απόλλων report — *1–2 days*
So the Owner can verify a shift's report remotely instead of visiting.

About 80 % of the pattern already exists for expense receipts:
`shift_expenses.receipt_url` (migration 0011), a camera-capable file input in
`ShiftClosingWizard`, and display in `ShiftDetailsModal`.

**Do not copy how it stores the image.** The current code base64-encodes the
file straight into a TEXT column, and `fetchExpenses` does `select('*')` — see
§3.1. Build this on Supabase Storage (upload the file, store the path, serve
signed URLs), compress client-side first (~1600 px, JPEG 0.8 → 200–400 KB), and
add `capture="environment"` so phones open the camera directly.

### 2.2 Barcode scanner for scratch αρχικό/τελικό — *2–3 days*
Tickets carry a barcode, so this is real rather than OCR guesswork.

- **Android**: the browser's native `BarcodeDetector` — fast, no dependency.
- **iPhone**: not supported by WebKit and unlikely to be soon, so a JS/WASM
  decoder (ZXing) is needed as a fallback. Load it as its own lazy chunk so it
  costs nothing until someone taps «Σάρωση».

Fits the existing locks neatly: «Τελικό» (`endNo`) is the number that changes
each shift and is user-editable, while «Αρχικό» is Owner-locked and auto-carries
from the previous shift. The employee scans exactly the field they may write.

Worth prototyping on two or three rows before building fully — twenty game rows
means twenty camera aims per close, and if each takes four seconds, typing three
digits wins. Hence «προαιρετικά».

### 2.3 Store compliance document vault — *~3 days, ~2 after Storage exists*
Per store, grouped by the authority that inspects it: πυρασφάλεια, συμβάσεις,
πίνακες εργαζομένων, πληρωμές, βιβλίο αδειών, and so on. When an inspector
arrives, filter to that authority and everything they will ask for is there.

Nothing like it exists today — `stores` has no document concept at all.

What makes it worth building in-app rather than a shared drive:

- **Expiry tracking.** Πυρασφάλεια and συμβάσεις expire. A document with an
  expiry date produces a reminder ahead of it, reusing the cron + notifications
  built for the lottery reminder (migration 0020, `/api/lottery-cancel-reminder`).
- **Grouping by authority**, so an inspection is one filter rather than a search.
- **Audit trail** — who uploaded what, when.

Shares the Supabase Storage work with §2.1, which is why the two should be
sequenced together.

**Access — decided: Owner and Manager, not employees.** That maps exactly onto
the existing `auth_is_elevated()` (ORG_OWNER, PLATFORM_ADMIN, AREA_MANAGER,
STORE_MANAGER, ORG_ADMIN), so the policy is one line and needs no new
permission:

```sql
USING (belongs_to_org(organization_id) AND auth_is_elevated())
```

Same shape as `vlt_reconciliations` and `roster_schedules` already use.

One consequence to accept or reject before building: **a Store Manager will see
every store's documents, not only their own.** `user_store_assignments` is empty
(0 rows) and nothing in the app writes it, so "that manager's store" is not
derivable — the same reason migration 0018 made notification audiences
organization-level. Narrowing it later means populating store assignments first,
which is its own piece of work affecting more than this feature.

Still open, both low-stakes:
- **Authorities.** Proposed: a fixed starter list the Owner can extend,
  following the P&L's default-lines pattern.
- **Expiry** is optional per document — πυρασφάλεια has one, βιβλίο αδειών does
  not.

---

## 3. Known debt

### 3.1 Receipt photos are base64 in a TEXT column — **deferred**

**Not currently biting, and that is the point.** As of 2026-10-15 there are
zero receipts stored: no Storage bucket exists and `receipt_url` is empty on
all 96 expenses. So the cost of fixing it today is zero rows migrated. Every
receipt uploaded from here makes it a real data migration instead. Parked at
the Owner's decision, with that trade recorded rather than forgotten.

`ShiftClosingWizard.handleFileUpload` stores a data URL in
`shift_expenses.receipt_url`. A phone photo is 2–5 MB and base64 adds ~33 %;
`fetchExpenses` selects `*`, so every expense list would pull every photo in
full.

**Currently harmless — 0 rows have a receipt** — but it breaks the first time
staff use the feature. Fix it as part of §2.1's Storage work and migrate any
rows created in the meantime.

### 3.2 Vercel Skew Protection is implemented but inert
`vite.config.ts` pins `?dpl=` onto built asset URLs, guarded so it no-ops unless
Vercel says the feature is on. It requires a **Pro plan**, the toggle under
Settings → Advanced, and «Enable access to System Environment Variables». On
Hobby it does nothing and `lazyWithRetry` remains the safety net. Worth raising
Maximum Age above the default one day, since staff keep the app open for long
shifts.

---

## 4. Verified this session, no action needed

- Manager role correctly sees no «Οικονομικό P&L» tab — and the six P&L tables
  are Owner-only at the database level too (`auth_is_owner()`), so bypassing the
  UI returns nothing.
- The August import's one-day date offset is corrected; 63 cells now match the
  workbook exactly.
- Fabricated sample rows no longer ship — the invented figures exist only in
  `src/tests/no_sample_data.test.ts`.
