-- Per-store hard ceiling on Scratch back-side selling ("Scratch Selling
-- Mode": Front only / Front + Back), distinct from the existing soft
-- per-row default (scratch_backside_default, added in 0010) which a
-- manager can still override per row. This column is the strict mode the
-- Owner switches per store; scratch_backside_default is untouched and
-- keeps its existing soft-default meaning.
--
-- Default 'FRONT_AND_BACK' matches every store's current behavior exactly
-- (hasBackSide() has never had a hard ceiling before this) - this
-- migration changes nothing until an Owner explicitly switches a store.

ALTER TABLE shift_templates
  ADD COLUMN scratch_selling_mode TEXT NOT NULL DEFAULT 'FRONT_AND_BACK'
    CHECK (scratch_selling_mode IN ('FRONT_AND_BACK', 'FRONT_ONLY'));

-- Owner-only check, narrower than auth_is_elevated() (which also covers
-- Area/Store Manager) - first consumer is the trigger below; reused by the
-- National Lottery edition-rollover function.
CREATE OR REPLACE FUNCTION auth_is_owner() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth_role_code(), '') IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN');
$$;

-- Tightens shift_templates writes: a scratch_selling_mode CHANGE
-- specifically is Owner-only (spec: "Owner-facing... Owner can change it
-- anytime"), narrower than the table's existing auth_is_elevated()-gated
-- write policy which still lets Store/Area Manager write every other
-- column (show_*, custom_fields, scratch_backside_default) freely. Only
-- fires on an actual change to this one column, so it can never reject an
-- unrelated shift_templates write.
CREATE OR REPLACE FUNCTION enforce_scratch_selling_mode_owner_only() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scratch_selling_mode IS DISTINCT FROM OLD.scratch_selling_mode AND NOT auth_is_owner() THEN
    RAISE EXCEPTION 'Μόνο ο Ιδιοκτήτης μπορεί να αλλάξει τη λειτουργία πώλησης Σκρατς' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_scratch_selling_mode_owner_only
  BEFORE UPDATE ON shift_templates
  FOR EACH ROW EXECUTE FUNCTION enforce_scratch_selling_mode_owner_only();
