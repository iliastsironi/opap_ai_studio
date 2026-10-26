-- Μια χρέωση γράφεται μία φορά, όσες φορές κι αν υποβληθεί η βάρδια.
--
-- applyShiftCustomerCredits inserted every line of the shift's credit list
-- every time it ran, and it runs on submit. A shift submitted twice - a
-- retry, a double click, a correction sent back and resubmitted - wrote the
-- whole list again.
--
-- That is not a cosmetic duplicate. trg_apply_customer_credit (0001) fires
-- AFTER INSERT and adds the amount to customers.current_debt, so a second
-- copy charged the customer a second time. The agency's own data shows it:
-- the same 25 € to the same customer on the same shift, twenty-five seconds
-- apart.
--
-- Every line already carries an id made when the operator added the row and
-- stored with the shift. source_reference_id could not hold it - that column
-- is UUID and these ids are not - so the line id gets a column of its own,
-- and a unique index makes a second write impossible rather than merely
-- unlikely.
--
-- The index is plain, not partial. NULLs do not conflict with each other in
-- Postgres, so every historical row - all of which have no line id - is
-- exempt, and the index can be created on live data without first cleaning
-- anything up.

ALTER TABLE customer_credit_transactions
  ADD COLUMN IF NOT EXISTS client_line_id TEXT;

COMMENT ON COLUMN customer_credit_transactions.client_line_id IS
  'Το id της γραμμής στο κλείσιμο βάρδιας. Κάνει την εγγραφή ιδεμποτή: δεύτερη υποβολή δεν ξαναγράφει.';

CREATE UNIQUE INDEX IF NOT EXISTS credit_tx_shift_line_uniq
  ON customer_credit_transactions (shift_id, client_line_id);

-- Verify.
--
--   SELECT COUNT(*) FROM customer_credit_transactions WHERE client_line_id IS NOT NULL;
--     -> 0, until a shift is submitted after this ships.
--
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'credit_tx_shift_line_uniq';
