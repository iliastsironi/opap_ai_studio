-- customer_credit_transactions.shift_id was NOT NULL, but the customer
-- directory (CustomerCreditDirectoryModal) is also opened standalone from
-- ShiftsManager, outside any shift context, for manual balance adjustments
-- (e.g. entering a pre-existing debt when onboarding a customer, or a
-- manager correction). Loosen to nullable so those adjustments can be
-- recorded as real, trigger-applied, audited transactions instead of a
-- silent direct UPDATE to customers.current_debt.
ALTER TABLE customer_credit_transactions ALTER COLUMN shift_id DROP NOT NULL;
ALTER TABLE customer_credit_transactions DROP CONSTRAINT customer_credit_transactions_shift_id_fkey;
ALTER TABLE customer_credit_transactions
  ADD CONSTRAINT customer_credit_transactions_shift_id_fkey
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;
