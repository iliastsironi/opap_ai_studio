-- Η πάγια παραγγελία του Λαϊκού.
--
-- Every agency gets the same delivery of Λαϊκό for each draw, standing and
-- unchanging - this one takes 40 πεντάδες. It is a fact about the shop, not
-- about the shift, so the Owner writes it once in «Διαμόρφωση» and the till
-- never asks again: pressing «Νέο πακέτο» on a Λαϊκό row opens the shelf at
-- whatever the shop actually receives.
--
-- In πεντάδες, which is the unit the shop orders, counts and cancels in.
-- The rows themselves hold pieces (bundleSize 5), and lib/laikoCancellation.ts
-- converts between the two in one place rather than scattering ×5 through
-- the screens.
--
-- 0 is the default and means «not set», so nothing changes for a shop that
-- has not told us its order - the dialog keeps asking for the figure by hand
-- exactly as it does today.

ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS laiko_standing_order_bundles INTEGER NOT NULL DEFAULT 0
    CHECK (laiko_standing_order_bundles >= 0);

COMMENT ON COLUMN shift_templates.laiko_standing_order_bundles IS
  'Πάγια παραγγελία Λαϊκού σε πεντάδες, ανά κατάστημα. 0 = δεν έχει οριστεί.';

-- Verify.
--
--   SELECT laiko_standing_order_bundles FROM shift_templates LIMIT 1;
--     -> 0
--
-- And, after the Owner sets it in «Διαμόρφωση», that store's row reads 40.
