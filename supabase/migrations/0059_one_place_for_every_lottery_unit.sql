-- Σε τι μετριέται κάθε λαχείο, όλα μαζί σε ένα σημείο.
--
-- The unit was answered in three different places and three different
-- shapes: a boolean column per seasonal edition (0056), laiko_selling_mode
-- for the Λαϊκό, and the Εθνικό pinned in code. A column per game does not
-- scale - the scratch catalogue is editable, so a shop can add a lottery
-- nobody wrote a column for - and three shapes meant three screens, which is
-- how «την έχω σε πεντάδες και μετράει σε κομμάτια» survived as long as it
-- did.
--
-- One map, keyed by the row's own id:
--
--   BUNDLES  μόνο πεντάδες   PIECES  μόνο κομμάτια   DUAL  και τα δύο
--
-- The old columns are deliberately left in place. They are the fallback for
-- a template this backfill has not touched, and dropping a column that the
-- deployed client still reads turns a stale browser tab into an error.

ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS lottery_units JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN shift_templates.lottery_units IS
  'Μονάδα ανά λαχείο: {"scr_laiko":"BUNDLES"}. BUNDLES=πεντάδες, PIECES=κομμάτια, DUAL=και τα δύο.';

-- Every store keeps exactly what it was counting in.
UPDATE shift_templates SET lottery_units =
  jsonb_strip_nulls(
    jsonb_build_object(
      'scr_eidiki_x5',        CASE WHEN special_edition_x5_bundles  IS FALSE THEN 'PIECES' ELSE 'BUNDLES' END,
      'scr_eidiki_x10',       CASE WHEN special_edition_x10_bundles IS FALSE THEN 'PIECES' ELSE 'BUNDLES' END,
      'scr_protochroniatiko', CASE WHEN protochroniatiko_bundles    IS FALSE THEN 'PIECES' ELSE 'BUNDLES' END,
      'scr_laiko',            CASE WHEN laiko_selling_mode = 'BUNDLES_ONLY' THEN 'BUNDLES' ELSE 'DUAL' END,
      -- Εθνικό has always counted πεντάδες at 20 € each and nothing else.
      'scr_ethniko_x20',      'BUNDLES'
    )
  )
WHERE lottery_units = '{}'::jsonb;

-- Verify.
--
--   SELECT store_id, lottery_units FROM shift_templates;
--
-- Each row's map must agree with its old columns: x5/x10/proto BUNDLES where
-- the boolean was true, and scr_laiko BUNDLES only where laiko_selling_mode
-- was BUNDLES_ONLY.
