-- Πεντάδες ή κομμάτια, μία επιλογή ανά λαχείο, στη Διαμόρφωση.
--
-- The unit briefly lived on the till row as a badge the operator could
-- press. That put a third control into a line that already carries two
-- numbers, a quantity, a total and two buttons - and it is not a decision
-- that changes from one count to the next anyway. It belongs beside the
-- rest of the lottery settings, which is where the Λαϊκό's own selling mode
-- already is.
--
-- TRUE = πεντάδες, which is the default: these editions are sold in fives
-- far more often than singly. Only an explicit FALSE means μεμονωμένα
-- κομμάτια, so a NULL from any row written before this migration reads as
-- the default rather than silently switching a shop to pieces.

ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS special_edition_x5_bundles  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS special_edition_x10_bundles BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS protochroniatiko_bundles    BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN shift_templates.special_edition_x5_bundles IS
  'Ειδική Έκδοση x5: true = πεντάδες, false = μεμονωμένα κομμάτια.';
COMMENT ON COLUMN shift_templates.special_edition_x10_bundles IS
  'Ειδική Έκδοση x10: true = πεντάδες, false = μεμονωμένα κομμάτια.';
COMMENT ON COLUMN shift_templates.protochroniatiko_bundles IS
  'Πρωτοχρονιάτικο: true = πεντάδες, false = μεμονωμένα κομμάτια.';

-- Verify.
--
--   SELECT special_edition_x5_bundles, special_edition_x10_bundles,
--          protochroniatiko_bundles
--     FROM shift_templates;
--     -> t | t | t  everywhere, until an Owner changes one.
