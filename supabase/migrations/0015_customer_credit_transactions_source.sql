-- Tags a customer_credit_transactions row with where it came from, so a
-- National-Lottery-sourced debt is identifiable (debt warnings, "must not
-- double-count" auditing) without a second, parallel debt system.
--
-- Plain TEXT, not a CHECK-constrained enum - matches this table's existing
-- free-form `notes` style, and every existing call site
-- (adjustCustomerDebt, applyShiftCustomerCredits in
-- src/services/customerCreditService.ts) needs ZERO code changes: omitting
-- the column on insert takes the safe 'MANUAL' default, identical to
-- today's actual behavior for every existing credit adjustment.
--
-- source_reference_id points at whatever produced this transaction - for
-- 'NATIONAL_LOTTERY' rows, the OLD edition's national_lottery_customer_
-- editions.id (see 0014's rollover function), giving a queryable join
-- back to exactly which edition/participation produced the debt. Not a
-- foreign key: this column is deliberately polymorphic (its target table
-- depends on `source`), matching how this app has no cross-table
-- polymorphic-FK precedent to follow, so a plain UUID column (validated
-- at the application layer, not the DB layer) is the simplest correct
-- choice here rather than inventing one.

ALTER TABLE customer_credit_transactions
  ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN source_reference_id UUID;

CREATE INDEX ix_credit_tx_source ON customer_credit_transactions (source, customer_id) WHERE source <> 'MANUAL';
