-- Three Owner-only per-store settings, all requested after actually using
-- the shipped Scratch/National-Lottery features:
--
-- show_national_lottery: many stores don't run Εθνικό Λαχείο at all: lets
-- the Sidebar hide the module for them instead of showing an unused nav
-- item. DEFAULT TRUE - every store already using the feature today sees
-- zero change.
--
-- special_edition_enabled: DEFAULT_SCRATCH_PRESETS (ScratchCalculatorTable.
-- tsx) hardcodes two "Ειδική Έκδοση χ5/χ10" rows that show for every store
-- regardless of whether a real special edition is actually running right
-- now. DEFAULT FALSE (opposite direction from show_* above) - hidden until
-- an Owner turns them on for a real special edition, then off again after.
--
-- laiko_selling_mode: Λαϊκό Λαχείο (scr_laiko) is sold either as whole
-- 5-ticket bundles only, or also as loose pieces - which one varies by
-- store. DEFAULT 'PIECES_AND_BUNDLES' matches the app's current shipped
-- behavior (dual bundle+piece entry, price 2 EUR/piece = 10 EUR/bundle) so
-- nothing changes for a store that never touches this setting.

ALTER TABLE shift_templates
  ADD COLUMN show_national_lottery BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN special_edition_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN laiko_selling_mode TEXT NOT NULL DEFAULT 'PIECES_AND_BUNDLES'
    CHECK (laiko_selling_mode IN ('PIECES_AND_BUNDLES', 'BUNDLES_ONLY'));

-- Reuses the exact Owner-only enforcement already in place for
-- scratch_selling_mode (0012) - these three are the same kind of "how this
-- store counts/sells" policy setting, not a per-shift operational field.
CREATE OR REPLACE FUNCTION enforce_scratch_layout_settings_owner_only() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.show_national_lottery IS DISTINCT FROM OLD.show_national_lottery
      OR NEW.special_edition_enabled IS DISTINCT FROM OLD.special_edition_enabled
      OR NEW.laiko_selling_mode IS DISTINCT FROM OLD.laiko_selling_mode)
     AND NOT auth_is_owner() THEN
    RAISE EXCEPTION 'Μόνο ο Ιδιοκτήτης μπορεί να αλλάξει αυτή τη ρύθμιση' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_scratch_layout_settings_owner_only
  BEFORE UPDATE ON shift_templates
  FOR EACH ROW EXECUTE FUNCTION enforce_scratch_layout_settings_owner_only();
