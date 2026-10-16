-- Whether a morning shift inherits the night's coins, or starts on the float.
--
-- Both are reasonable and it depends on how a shop runs. If the ψιλά stay in
-- the drawer overnight, the morning starts on whatever was left and counting
-- out a fixed 50 would be inventing a figure. If the drawer is emptied and a
-- prepared float goes in, the previous night's coins are not there any more
-- and carrying them would be measuring the till against money that is in the
-- safe.
--
-- Default TRUE: carrying is the behaviour the agency asked for and the one
-- running now, so no store changes by this migration landing.
--
-- Either way, a night that counted no coins carries nothing - a close with no
-- ψιλά recorded is a close where nobody counted them, not a handover of an
-- empty drawer - and the configured float applies. The live data has exactly
-- that: the latest close at 101499 holds denominations with no coin keys at
-- all.

ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS morning_coins_carry_over BOOLEAN NOT NULL DEFAULT TRUE;

-- Verify:
--
--   SELECT store_id, opening_float_coins, morning_coins_carry_over
--     FROM shift_templates;
