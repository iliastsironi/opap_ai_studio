-- Org/store-level defaults for Σκρατς/Λαχεία counting mode (Phase 4 of the
-- configurable counting-modes feature; Phases 1-3 shipped the per-row
-- override itself). Lets an owner set what a never-explicitly-configured
-- row should default to, instead of every row silently following the
-- historical hardcoded rule forever. Booleans, not part of custom_fields
-- (whose TemplateFieldConfig shape has no case for "per-game counting
-- default" without inventing one that doesn't generalize) - same reasoning
-- as every other show_* column already on this table.
--
-- DEFAULT values match today's implicit per-row inference exactly
-- (scratch_backside_default TRUE = Σκρατς already defaults to front+back;
-- lottery_bundle_default FALSE = Λαχεία already defaults to plain pieces),
-- so every existing org/store row gets zero visible change the moment
-- this migration runs - only a later, explicit toggle in the Configurator
-- changes anything.

ALTER TABLE shift_templates
  ADD COLUMN scratch_backside_default BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN lottery_bundle_default BOOLEAN NOT NULL DEFAULT FALSE;
