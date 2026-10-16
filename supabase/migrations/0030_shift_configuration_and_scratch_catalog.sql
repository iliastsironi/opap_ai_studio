-- Round 3 of UAT: the settings that decide how a store counts move out of the
-- browser and into the database, where the Owner sets them once and every
-- device obeys.
--
-- Two things were kept in localStorage and nowhere else:
--
--   shiftledger_scratch_catalog_v2      which scratch games exist, and at what price
--   shiftledger_shared_pos_count_<store> how many Tora/POS terminals the store has
--
-- Both are per browser. The Owner curates the catalogue on their laptop, the
-- employee counts on the till computer, and the two see different games at
-- different prices - with no way for either to notice. Staff use phones, till
-- computers and tablets, so this is three answers per store, not two.

-- ============================================================
-- 1. Per-store counting policy (shift_templates)
-- ============================================================
-- All Owner-set, all previously either hardcoded or typed per shift by whoever
-- happened to open it.
ALTER TABLE shift_templates
  -- Was an input on the shift-opening screen, editable by the employee whose
  -- till it measures.
  ADD COLUMN IF NOT EXISTS discrepancy_threshold NUMERIC(12,2) NOT NULL DEFAULT 15
    CHECK (discrepancy_threshold >= 0),
  -- The float a shift is expected to start on. Same reason: the person counted
  -- against it should not be the person setting it.
  ADD COLUMN IF NOT EXISTS opening_float_notes NUMERIC(12,2) NOT NULL DEFAULT 150
    CHECK (opening_float_notes >= 0),
  ADD COLUMN IF NOT EXISTS opening_float_coins NUMERIC(12,2) NOT NULL DEFAULT 50
    CHECK (opening_float_coins >= 0),
  ADD COLUMN IF NOT EXISTS opening_float_employee_editable BOOLEAN NOT NULL DEFAULT FALSE,
  -- Two or three shifts a day, per store.
  ADD COLUMN IF NOT EXISTS shifts_per_day SMALLINT NOT NULL DEFAULT 3
    CHECK (shifts_per_day IN (2, 3)),
  -- Whether an employee may add a προσαύξηση themselves, or only the Owner.
  ADD COLUMN IF NOT EXISTS topup_employee_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  -- How many Tora/POS terminals the store has. stores.pos_count already exists
  -- but means card terminals for the «Τερματικά» count on the stores screen;
  -- this is the shift-counting view of the same shop floor and belongs with
  -- the other counting policy.
  ADD COLUMN IF NOT EXISTS pos_terminal_count SMALLINT NOT NULL DEFAULT 2
    CHECK (pos_terminal_count BETWEEN 1 AND 20);

-- ============================================================
-- 2. The scratch & lottery catalogue
-- ============================================================
CREATE TABLE IF NOT EXISTS scratch_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,   -- NULL = org-wide
  -- Stable key carried over from the localStorage rows, so a browser's edits
  -- can be matched to a row rather than duplicated beside it.
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  -- «Σκρατς» and «Λαχεία» are counted together today and add up into one
  -- figure. They are different products and the agency wants them apart, on
  -- screen and in the totals.
  kind TEXT NOT NULL DEFAULT 'SCRATCH' CHECK (kind IN ('SCRATCH', 'LOTTERY')),
  category TEXT NOT NULL DEFAULT 'Σκρατς',
  price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  -- Λαϊκό is sold either as a single piece or as a πεντάδα. The bundle is not
  -- a discount or a multiple to be inferred - it is its own price.
  bundle_size SMALLINT CHECK (bundle_size IS NULL OR bundle_size > 1),
  bundle_price NUMERIC(10,2) CHECK (bundle_price IS NULL OR bundle_price >= 0),
  back_side_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- The Owner's order, which is the order the till counts in.
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A table-level UNIQUE only accepts plain columns, and store_id is nullable
-- here (NULL meaning org-wide), so this is an expression index - the same
-- shape credit_tier_configs uses for exactly the same reason.
CREATE UNIQUE INDEX IF NOT EXISTS ux_scratch_catalog_org_store_code
  ON scratch_catalog (organization_id, COALESCE(store_id, ''), code);

CREATE INDEX IF NOT EXISTS ix_scratch_catalog_org_sort
  ON scratch_catalog (organization_id, sort_order);

ALTER TABLE scratch_catalog ENABLE ROW LEVEL SECURITY;

-- Everyone in the organisation reads it - the employee counting the till needs
-- the games and their prices. Only the Owner changes it, matching
-- scratch_selling_mode and the other counting policy from 0012 and 0017.
DROP POLICY IF EXISTS scratch_catalog_select ON scratch_catalog;
CREATE POLICY scratch_catalog_select ON scratch_catalog
  FOR SELECT USING (belongs_to_org(organization_id));
DROP POLICY IF EXISTS scratch_catalog_write ON scratch_catalog;
CREATE POLICY scratch_catalog_write ON scratch_catalog
  FOR ALL USING (belongs_to_org(organization_id) AND auth_is_owner())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON scratch_catalog TO authenticated;

-- Verify. The first must list the new columns, the second must be empty but
-- readable, and the third must refuse because the SQL editor is not an Owner
-- session:
--
--   SELECT discrepancy_threshold, opening_float_notes, opening_float_coins,
--          opening_float_employee_editable, shifts_per_day,
--          topup_employee_allowed, pos_terminal_count
--     FROM shift_templates;
--
--   SELECT count(*) FROM scratch_catalog;

-- APPLIED 2026-10-16, verified rather than taken from the editor: the seven
-- columns read back, scratch_catalog is present and readable, a duplicate
-- (organization, store, code) is refused with 23505 and a kind outside the two
-- products with 23514. Probe rows removed.
--
-- Noted while verifying: shift_templates holds no rows at all, so no store has
-- ever saved a configuration and every store runs on
-- DEFAULT_OPAP_SHIFT_TEMPLATE. The defaults above were chosen to match it.
