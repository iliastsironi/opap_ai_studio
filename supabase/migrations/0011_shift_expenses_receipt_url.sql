-- Adds photo-receipt storage to shift_expenses. Found while wiring
-- ShiftClosingWizard's expense entry onto real rows in this table (Phase 7
-- of the platform-simplification effort, closing a data-loss bug): the
-- wizard's receipt-photo upload (a base64 data URL) had nowhere valid to
-- persist to. shift_expenses had no column for it, and the `expenses`
-- field the wizard's local state and ExpensesManager's shift-sync both
-- tried to write onto the shifts row was never a real column there at all
-- (0001_schema.sql's shift_expenses comment already says this table has
-- always been the single source of truth for a shift's expenses) - every
-- update that included it was silently rejected in full by PostgREST
-- (unknown column), taking expenses_paid_cash down with it in the same
-- request.

ALTER TABLE shift_expenses
  ADD COLUMN receipt_url TEXT;
