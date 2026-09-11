-- shift_templates and credit_tier_configs both allow store_id IS NULL
-- ("org-wide default") and originally enforced "one row per (org, store)"
-- via a unique INDEX on (organization_id, COALESCE(store_id, ''), ...) -
-- a table-level UNIQUE constraint can't reference an expression like
-- COALESCE, so an index was the only way to get that at the time.
--
-- The problem, found live: saveShiftTemplateConfig() and
-- customerCreditService's credit-tier save both upsert with a plain
-- onConflict: 'organization_id,store_id[,tier]' - and PostgREST's
-- onConflict can only target an actual plain-column UNIQUE constraint,
-- never an expression index. Every upsert that hit an existing row (i.e.
-- almost every save after the first) failed with "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification" (42P10).
-- This predates this session's work entirely - not a regression from
-- anything shipped today.
--
-- NULLS NOT DISTINCT (Postgres 15+) gets a real, plain-column, ON-CONFLICT
-- -targetable UNIQUE constraint that still treats two NULL store_ids for
-- the same org as a conflict - preserving the original "one org-wide
-- default row" guarantee the expression index was written for.

DROP INDEX IF EXISTS ux_shift_templates_org_store;
ALTER TABLE shift_templates
  ADD CONSTRAINT ux_shift_templates_org_store UNIQUE NULLS NOT DISTINCT (organization_id, store_id);

DROP INDEX IF EXISTS ux_credit_tier_configs_org_store_tier;
ALTER TABLE credit_tier_configs
  ADD CONSTRAINT ux_credit_tier_configs_org_store_tier UNIQUE NULLS NOT DISTINCT (organization_id, store_id, tier);
