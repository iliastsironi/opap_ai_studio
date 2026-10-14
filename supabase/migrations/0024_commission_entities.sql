-- Commissions become the three entities that actually pay them.
--
-- Until now a commission was one of eight product lines per store - ALLWYN,
-- HL, HR, TORA, ΕΘΝΙΚΟ, ΑΜΒ ΚΕΝΤΙΡΚΟΥ, BONUS, CP - or one of three for a PLAY
-- store, taken from the shape of the Excel workbook. UAT replaced that with the
-- monthly report Allwyn actually sends, which breaks down by legal entity:
--
--   Allwyn ΑΕ · Ελληνικά Λαχεία ΑΕ · Tora Wallet ΑΕ
--
-- That report is the real gross profit, so it becomes the single source of
-- τζίρος. One report per store, one set of three figures per store per month.
--
-- The table itself is kept. pnl_commission_entries already has the right shape
-- - org, store, date, line, amount - carries Owner-only RLS from 0019, and is
-- read by the engine, the service and the Excel export. The change is about
-- which line names are allowed, not about storage, and replacing the table
-- would mean rewriting all three for no gain.

-- Exactly two rows have ever been written, both of them TORA: 794,50 for
-- store_101499 and 268,60 for store_101498, dated 2026-08-31, from the
-- P&L_0826 import. No other line value has been used, so there is nothing
-- else to place.
UPDATE pnl_commission_entries
   SET line = 'Tora Wallet ΑΕ'
 WHERE line = 'TORA';

-- The Allwyn report is a restatement, not an addition. Without this, entering
-- a month a second time quietly doubles that month's τζίρος instead of
-- correcting it, and the UI's upsert has nothing to conflict against.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pnl_commission_store_month_line
  ON pnl_commission_entries (organization_id, store_id, entry_date, line);

-- Deliberately NO CHECK constraint on `line`. The entity names are Greek text a
-- provider may restate, and a CHECK would turn a rename into a migration. The
-- UI offers exactly three; uniqueness is the constraint that protects the
-- figures.

-- APPLIED 2026-10-14, in two halves. The UPDATE was run through the service
-- role after the pasted statement reported success without changing a row; the
-- index was created from the SQL editor. Both are verified present: the two
-- August rows carry the new name and a deliberate duplicate insert is rejected
-- with 23505.

-- Verify. Expect one row: Tora Wallet ΑΕ | 2 | 1063.10
--
--   SELECT line, count(*), sum(amount) FROM pnl_commission_entries GROUP BY line;
