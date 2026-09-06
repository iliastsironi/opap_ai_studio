-- VLT terminals — replaces VltManager.tsx's hardcoded 5-row mock array with
-- real, per-store rows so meter readings can be entered and persisted
-- ("Phase 1: manual entry" per the user's own framing - a real telemetry/
-- hardware integration is a separate, later project, not attempted here).

CREATE TABLE vlt_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  game_title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ONLINE' CHECK (status IN ('ONLINE','OFFLINE','MAINTENANCE')),
  meter_in NUMERIC(12,2) NOT NULL DEFAULT 0,
  meter_out NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Generated, not app-managed, so it can never drift from its inputs -
  -- same reasoning as shifts.tora_total in 0001_schema.sql.
  net_revenue NUMERIC(12,2) GENERATED ALWAYS AS (meter_in - meter_out) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, store_id, code)
);
CREATE INDEX ix_vlt_terminals_org_store ON vlt_terminals (organization_id, store_id);

-- Meter-reading updates stay open to any org member with vlt.view (matching
-- the module's own existing permission - the entry fields were never
-- manager-gated even in the mock-data UI), but adding/removing a physical
-- terminal is elevated-only, mirroring the permission gap fix just applied
-- to ShiftClosingWizard's own POS-terminal add/remove controls.
ALTER TABLE vlt_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY vlt_terminals_select ON vlt_terminals FOR SELECT
  USING (belongs_to_org(organization_id));

CREATE POLICY vlt_terminals_update ON vlt_terminals FOR UPDATE
  USING (belongs_to_org(organization_id))
  WITH CHECK (belongs_to_org(organization_id));

CREATE POLICY vlt_terminals_insert ON vlt_terminals FOR INSERT
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

CREATE POLICY vlt_terminals_delete ON vlt_terminals FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());
