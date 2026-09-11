-- Εθνικό Λαχείο (National Lottery) subscriber management.
--
-- Deliberately NOT built on the `customers` table: customers is
-- purpose-built for Τεφτέρι credit identity (tier/custom_limit/
-- current_debt, all trigger-maintained) - none of that means anything for
-- a subscriber who always collects on time. national_lottery_customers is
-- its own table, with a NULLABLE `customer_id` populated lazily the first
-- time a real debt needs posting (see 0014's rollover function) - most
-- subscribers never touch the Τεφτέρι table at all, and the moment one
-- does, they graduate into a stable customers identity reused on every
-- future rollover, so debt correctly accumulates via the EXISTING
-- apply_customer_credit_transaction() trigger. No second debt system.
--
-- Draws are event rows in one ledger table (national_lottery_draw_
-- collections), not five wide status columns - this makes "the same draw
-- can't be registered twice" a real declarative constraint (a partial
-- unique index) instead of trigger logic diffing old/new wide columns,
-- and gives cancellation a natural append-only shape.
--
-- Editions are per-store (confirmed with the Owner): each store manages
-- its own edition timeline independently, matching every other per-store
-- concept in this schema (shift_templates, credit_tier_configs).

-- Owner-only check (narrower than auth_is_elevated(), which also covers
-- Area/Store Manager). Canonically introduced in
-- 0012_scratch_selling_mode.sql (Scratch Selling Mode is Owner-only too);
-- CREATE OR REPLACE'd here as well, identically, so this migration does
-- not silently depend on 0012 having already run first - these two
-- features ship as independent PR chains and may merge in either order.
CREATE OR REPLACE FUNCTION auth_is_owner() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth_role_code(), '') IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN');
$$;

-- ============================================================
-- national_lottery_editions
-- ============================================================

CREATE TABLE national_lottery_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  label TEXT NOT NULL, -- Owner-typed, e.g. "2026-14" - NEVER derived from a date/cadence
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL))
);
-- Exactly one current edition per store - the rollover function (0014)
-- relies on this to find "the" active edition to close.
CREATE UNIQUE INDEX ux_nl_editions_one_active_per_store
  ON national_lottery_editions (store_id) WHERE status = 'ACTIVE';
CREATE INDEX ix_nl_editions_org_store ON national_lottery_editions (organization_id, store_id);

-- ============================================================
-- national_lottery_customers
-- ============================================================

CREATE TABLE national_lottery_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL, -- populated lazily, see above
  full_name TEXT NOT NULL,
  phone TEXT,
  lottery_number TEXT,
  participation_type TEXT NOT NULL CHECK (participation_type IN ('FIVE', 'TEN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')), -- soft delete only
  current_edition_id UUID REFERENCES national_lottery_editions(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_nl_customers_org_store_status ON national_lottery_customers (organization_id, store_id, status);
CREATE INDEX ix_nl_customers_customer_id ON national_lottery_customers (customer_id) WHERE customer_id IS NOT NULL;

-- ============================================================
-- national_lottery_customer_editions - one row per (subscriber, edition)
-- ============================================================

CREATE TABLE national_lottery_customer_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  national_lottery_customer_id UUID NOT NULL REFERENCES national_lottery_customers(id) ON DELETE CASCADE,
  edition_id UUID NOT NULL REFERENCES national_lottery_editions(id) ON DELETE CASCADE,
  -- Frozen at enrollment - protects historical pricing even if the
  -- customer's participation_type changes on a later edition.
  participation_type_snapshot TEXT NOT NULL CHECK (participation_type_snapshot IN ('FIVE', 'TEN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (national_lottery_customer_id, edition_id)
);
CREATE INDEX ix_nl_customer_editions_edition ON national_lottery_customer_editions (edition_id);

-- ============================================================
-- national_lottery_draw_collections - the ledger: collections,
-- debt-transfers, reversals
-- ============================================================

CREATE TABLE national_lottery_draw_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  national_lottery_customer_id UUID NOT NULL REFERENCES national_lottery_customers(id) ON DELETE CASCADE,
  customer_edition_id UUID NOT NULL REFERENCES national_lottery_customer_editions(id) ON DELETE CASCADE,
  edition_id UUID NOT NULL REFERENCES national_lottery_editions(id) ON DELETE CASCADE, -- denormalized for simpler reporting
  draw_code TEXT NOT NULL CHECK (draw_code IN ('A', 'B', 'C', 'D', 'ST')),
  movement_type TEXT NOT NULL DEFAULT 'COLLECTION' CHECK (movement_type IN ('COLLECTION', 'DEBT_TRANSFER', 'REVERSAL')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0), -- server-computed, see enforce_national_lottery_draw_pricing below
  batch_id UUID NOT NULL DEFAULT gen_random_uuid(), -- shared by every row of one bulk-collection click
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL, -- which register's cash this flowed into
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id UUID REFERENCES users(id),
  cancellation_reason TEXT,
  reverses_collection_id UUID REFERENCES national_lottery_draw_collections(id),
  credit_transaction_id UUID REFERENCES customer_credit_transactions(id),
  idempotency_key TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))
);

-- The real "can't register the same draw twice for the same customer in
-- the same edition" constraint.
CREATE UNIQUE INDEX ux_nl_draw_collections_one_active_draw_per_edition
  ON national_lottery_draw_collections (customer_edition_id, draw_code)
  WHERE status = 'ACTIVE' AND movement_type <> 'REVERSAL';

-- The real double-click/refresh/retry idempotency constraint. The client
-- generates one key per logical "collect now" click (shared across every
-- row of a bulk batch) and resends the SAME key on any retry of that
-- click; a retry hitting this constraint is treated as "already
-- succeeded", not an error.
CREATE UNIQUE INDEX ux_nl_draw_collections_idempotency
  ON national_lottery_draw_collections (idempotency_key, draw_code);

CREATE INDEX ix_nl_draw_collections_shift ON national_lottery_draw_collections (shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX ix_nl_draw_collections_org_store_created ON national_lottery_draw_collections (organization_id, store_id, created_at DESC);
CREATE INDEX ix_nl_draw_collections_customer ON national_lottery_draw_collections (national_lottery_customer_id, created_at DESC);

-- ============================================================
-- Central pricing - backend-authoritative. Never trust an amount sent by
-- the client: this trigger overwrites whatever NEW.amount was on insert.
-- ============================================================

CREATE OR REPLACE FUNCTION national_lottery_draw_price(p_type TEXT) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type WHEN 'FIVE' THEN 20.00 WHEN 'TEN' THEN 40.00 ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION enforce_national_lottery_draw_pricing() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT participation_type_snapshot INTO v_type
  FROM national_lottery_customer_editions WHERE id = NEW.customer_edition_id;

  NEW.amount := national_lottery_draw_price(v_type);
  IF NEW.amount IS NULL THEN
    RAISE EXCEPTION 'Άγνωστος τύπος συμμετοχής για τον υπολογισμό ποσού' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- Only fires for COLLECTION rows - DEBT_TRANSFER rows get their amount
-- from the same national_lottery_draw_price() call inside the rollover
-- function (0014); REVERSAL rows copy the amount from the row they
-- reverse (enforced by the immutability trigger below allowing that one
-- specific insert pattern at the application layer, not by this trigger).
CREATE TRIGGER trg_nl_draw_collections_pricing
  BEFORE INSERT ON national_lottery_draw_collections
  FOR EACH ROW WHEN (NEW.movement_type = 'COLLECTION')
  EXECUTE FUNCTION enforce_national_lottery_draw_pricing();

-- ============================================================
-- Immutability: never a destructive delete or a post-hoc rewrite. The
-- ONLY permitted UPDATE is a transition into CANCELLED (and only once) -
-- mirrors enforce_scratch_field_locks' OLD-vs-NEW comparison approach
-- (0006_scratch_backside_lock.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_national_lottery_collection_immutability() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'CANCELLED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Μια ακυρωμένη καταχώρηση δεν μπορεί να αλλάξει κατάσταση ξανά' USING ERRCODE = '42501';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.store_id IS DISTINCT FROM OLD.store_id
     OR NEW.national_lottery_customer_id IS DISTINCT FROM OLD.national_lottery_customer_id
     OR NEW.customer_edition_id IS DISTINCT FROM OLD.customer_edition_id
     OR NEW.edition_id IS DISTINCT FROM OLD.edition_id
     OR NEW.draw_code IS DISTINCT FROM OLD.draw_code
     OR NEW.movement_type IS DISTINCT FROM OLD.movement_type
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
     OR NEW.reverses_collection_id IS DISTINCT FROM OLD.reverses_collection_id
     OR NEW.credit_transaction_id IS DISTINCT FROM OLD.credit_transaction_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Μόνο η ακύρωση (status/cancelled_at/cancelled_by_user_id/cancellation_reason) μπορεί να τροποποιηθεί' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nl_draw_collections_immutability
  BEFORE UPDATE ON national_lottery_draw_collections
  FOR EACH ROW EXECUTE FUNCTION enforce_national_lottery_collection_immutability();

-- ============================================================
-- RLS - follows the established belongs_to_org()/auth_is_elevated() shape.
-- auth_is_owner() is defined in 0012_scratch_selling_mode.sql.
-- ============================================================

ALTER TABLE national_lottery_editions ENABLE ROW LEVEL SECURITY;
CREATE POLICY nl_editions_select ON national_lottery_editions FOR SELECT USING (belongs_to_org(organization_id));
-- Owner-only, mirroring "Owner: ...create new editions" - defense-in-depth
-- alongside the rollover RPC's own internal auth_is_owner() check (0014).
CREATE POLICY nl_editions_insert ON national_lottery_editions FOR INSERT
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_owner());
CREATE POLICY nl_editions_update ON national_lottery_editions FOR UPDATE
  USING (belongs_to_org(organization_id) AND auth_is_owner())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_owner());
-- No DELETE: editions are never deleted, only closed.

ALTER TABLE national_lottery_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY nl_customers_select ON national_lottery_customers FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY nl_customers_insert ON national_lottery_customers FOR INSERT
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());
CREATE POLICY nl_customers_update ON national_lottery_customers FOR UPDATE
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());
-- No DELETE: soft-delete only (status='INACTIVE').

ALTER TABLE national_lottery_customer_editions ENABLE ROW LEVEL SECURITY;
CREATE POLICY nl_customer_editions_select ON national_lottery_customer_editions FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY nl_customer_editions_insert ON national_lottery_customer_editions FOR INSERT
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());
-- No UPDATE/DELETE: append-only link, same reasoning as customer_credit_transactions.

ALTER TABLE national_lottery_draw_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY nl_draw_collections_select ON national_lottery_draw_collections FOR SELECT USING (belongs_to_org(organization_id));
-- No elevated requirement on INSERT - Employees must be able to register
-- collections, mirroring customer_credit_transactions' identical existing
-- policy (credit_tx_insert, 0002_rls.sql).
CREATE POLICY nl_draw_collections_insert ON national_lottery_draw_collections FOR INSERT
  WITH CHECK (belongs_to_org(organization_id));
-- Cancellation only (enforced by the immutability trigger above); the
-- Owner confirmed Store/Area Manager should also be able to reverse a
-- mistaken collection, matching how other financial corrections work.
CREATE POLICY nl_draw_collections_update ON national_lottery_draw_collections FOR UPDATE
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());
-- No DELETE ever.
