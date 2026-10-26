-- Κάθε εποχική έκδοση ξεχωριστά.
--
-- Ειδική Έκδοση x5, Ειδική Έκδοση x10 and Πρωτοχρονιάτικο shared a single
-- switch. They do not arrive together and they do not stop selling together:
-- the Πρωτοχρονιάτικο sits on the counter for a few weeks around the new
-- year while the Ειδικές come and go on their own schedule. One switch meant
-- that turning on the edition you ARE selling also put the two you are not
-- into every operator's list - the exact clutter the switch was added to
-- prevent.
--
-- Nullable on purpose. NULL means «this store has not answered the new
-- question yet», and the client falls back to the old single switch for it,
-- so a store keeps seeing precisely what it saw until somebody sets one.
-- The backfill below then answers it for every store that already exists,
-- which makes today's behaviour explicit rather than inherited.

ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS special_edition_x5_enabled  BOOLEAN,
  ADD COLUMN IF NOT EXISTS special_edition_x10_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS protochroniatiko_enabled    BOOLEAN;

COMMENT ON COLUMN shift_templates.special_edition_x5_enabled IS
  'Ειδική Έκδοση x5 στη λίστα του ταμείου. NULL = ακολουθεί το παλιό special_edition_enabled.';
COMMENT ON COLUMN shift_templates.special_edition_x10_enabled IS
  'Ειδική Έκδοση x10 στη λίστα του ταμείου. NULL = ακολουθεί το παλιό special_edition_enabled.';
COMMENT ON COLUMN shift_templates.protochroniatiko_enabled IS
  'Πρωτοχρονιάτικο στη λίστα του ταμείου. NULL = ακολουθεί το παλιό special_edition_enabled.';

-- Every store that exists keeps exactly what it had.
UPDATE shift_templates
   SET special_edition_x5_enabled  = COALESCE(special_edition_x5_enabled,  special_edition_enabled, false),
       special_edition_x10_enabled = COALESCE(special_edition_x10_enabled, special_edition_enabled, false),
       protochroniatiko_enabled    = COALESCE(protochroniatiko_enabled,    special_edition_enabled, false);

-- Verify.
--
--   SELECT special_edition_enabled,
--          special_edition_x5_enabled, special_edition_x10_enabled,
--          protochroniatiko_enabled
--     FROM shift_templates;
--
-- Every row's three new columns match what its old single switch said.
