-- Μεταφορά μετρητών από μαγαζί σε μαγαζί.
--
-- Today this is typed as an ordinary expense with the other shop's code in
-- the recipient field - there is a 2.000 € row on 8/9 that reads «401070».
-- Three things are wrong with that, and all three are money:
--
--   it is not an expense. The cash did not leave the company, it changed
--   drawer. The monthly P&L counts it as a cost, so the company shows
--   2.000 € less profit than it made.
--   the other shop never hears about it. The money arrives in somebody's
--   hand and the receiving till knows nothing, so it reads as a surplus
--   when it is counted - or as nothing at all, if it never arrives.
--   nobody signs for it. A sum that large moving between shops on one
--   person's say-so leaves no record that the other end agreed.
--
-- So a transfer becomes its own thing, with two ends and a signature.
--
-- The Owner settled the four questions that decide the shape:
--
--   * neutral in the P&L. The sender's till still loses the cash, because
--     it did; the company's books do not call it a cost.
--   * PENDING until accepted. Until then it is in neither till - the
--     receiving operator is not asked to account for money they have not
--     seen, and no shortage is charged to anybody over it.
--   * only a manager or the owner may accept. An employee sees it and
--     cannot sign for it.
--   * a rejection carries a reason and goes back to the sender, who
--     corrects or cancels it. Nothing moves while it is disputed.

CREATE TABLE IF NOT EXISTS store_cash_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  from_store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  to_store_id   TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- A shop cannot send money to itself; that is a safe drop.
  CONSTRAINT store_cash_transfers_distinct_stores CHECK (from_store_id <> to_store_id),

  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  notes TEXT,

  -- The shift whose drawer the cash left, and the expense row that records
  -- it there. Nullable so a transfer can be entered outside a shift.
  from_shift_id   UUID REFERENCES shifts(id) ON DELETE SET NULL,
  from_expense_id UUID REFERENCES shift_expenses(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')),

  sent_by_user_id   UUID NOT NULL REFERENCES users(id),
  sent_by_user_name TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Filled in by whoever signs for it. The shift is where the προσαύξηση
  -- lands, which is why acceptance is recorded against one.
  settled_by_user_id   UUID REFERENCES users(id),
  settled_by_user_name TEXT,
  settled_at           TIMESTAMPTZ,
  to_shift_id          UUID REFERENCES shifts(id) ON DELETE SET NULL,
  -- Why it was sent back. Required for a rejection, by the trigger below.
  rejection_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_transfers_to_store
  ON store_cash_transfers (to_store_id, status);
CREATE INDEX IF NOT EXISTS ix_transfers_from_store
  ON store_cash_transfers (from_store_id, status);

-- A rejection without a reason is the thing the sender cannot act on, so it
-- is refused rather than merely discouraged.
CREATE OR REPLACE FUNCTION enforce_transfer_settlement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'REJECTED'
     AND COALESCE(TRIM(NEW.rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'Η απόρριψη χρειάζεται αιτιολογία' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('ACCEPTED', 'REJECTED') AND NEW.settled_at IS NULL THEN
    NEW.settled_at := now();
  END IF;

  -- Settled is settled. Reopening one would move money that both ends have
  -- already counted.
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('ACCEPTED', 'REJECTED', 'CANCELLED')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Η μεταφορά έχει ήδη κλείσει (%)', OLD.status
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transfer_settlement ON store_cash_transfers;
CREATE TRIGGER trg_transfer_settlement
  BEFORE INSERT OR UPDATE ON store_cash_transfers
  FOR EACH ROW EXECUTE FUNCTION enforce_transfer_settlement();

ALTER TABLE store_cash_transfers ENABLE ROW LEVEL SECURITY;

-- Both ends can see it: the shop that sent it and the shop receiving it.
CREATE POLICY transfers_read ON store_cash_transfers
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY transfers_insert ON store_cash_transfers
  FOR INSERT WITH CHECK (organization_id = auth_org_id());

-- Accepting or rejecting is a manager's or the owner's signature. The policy
-- is the enforcement; hiding the button is only courtesy.
CREATE POLICY transfers_settle ON store_cash_transfers
  FOR UPDATE USING (organization_id = auth_org_id() AND auth_is_elevated())
  WITH CHECK (organization_id = auth_org_id() AND auth_is_elevated());

GRANT SELECT, INSERT, UPDATE ON store_cash_transfers TO authenticated;

-- Verify.
--
--   INSERT INTO store_cash_transfers
--     (organization_id, from_store_id, to_store_id, amount, sent_by_user_id)
--   VALUES ('<org>', '<a>', '<a>', 100, '<user>');
--     -> refused: store_cash_transfers_distinct_stores
--
--   UPDATE store_cash_transfers SET status = 'REJECTED' WHERE id = '<id>';
--     -> refused: Η απόρριψη χρειάζεται αιτιολογία
