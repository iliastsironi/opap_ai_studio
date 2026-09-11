-- Edition rollover ("Νέα Έκδοση"): the one Feature-2 write that genuinely
-- needs a server-side transaction, not a plain client insert. A Postgres
-- function body executes as a single transaction - either every
-- customer's debt-insert-and-reset commits together, or a failure
-- anywhere rolls back entirely. That is the only available guarantee that
-- draws are never reset without their debt having been durably recorded
-- first. This is the first supabase.rpc()-callable function in this
-- codebase - every other write here is a plain client .insert()/.upsert()
-- guarded by triggers; this one operation is uniquely high-stakes
-- (multi-row, multi-table, must-be-atomic) enough to justify the new
-- pattern.

CREATE OR REPLACE FUNCTION rollover_national_lottery_edition(
  p_org_id TEXT,
  p_store_id TEXT,
  p_new_edition_label TEXT,
  p_actor_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_edition_id UUID;
  v_new_edition_id UUID;
  v_customer RECORD;
  v_pending TEXT[];
  v_debt NUMERIC;
  v_customer_id UUID;
  v_tx_id UUID;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so this function must authorize itself -
  -- it cannot rely on the table-level RLS policies (0013) alone.
  IF NOT auth_is_owner() THEN
    RAISE EXCEPTION 'Μόνο ο Ιδιοκτήτης μπορεί να δημιουργήσει νέα έκδοση' USING ERRCODE = '42501';
  END IF;

  IF p_new_edition_label IS NULL OR btrim(p_new_edition_label) = '' THEN
    RAISE EXCEPTION 'Απαιτείται όνομα για τη νέα έκδοση' USING ERRCODE = '22023';
  END IF;

  -- Row lock: a concurrent double-click on "Νέα Έκδοση" blocks here until
  -- the first call commits, rather than racing. Once the first call
  -- commits (closing this row), the second call's blocked SELECT
  -- re-evaluates against the now-CLOSED row and finds nothing - it just
  -- creates one harmless extra edition with zero pending debts to
  -- transfer, never a double-charge.
  SELECT id INTO v_old_edition_id FROM national_lottery_editions
    WHERE store_id = p_store_id AND status = 'ACTIVE' FOR UPDATE;

  -- Close the old edition BEFORE inserting the new one - both cannot be
  -- 'ACTIVE' for the same store_id at once (ux_nl_editions_one_active_
  -- per_store, 0013), and the new row defaults to 'ACTIVE'. Inserting
  -- first, as an earlier version of this function did, deadlocks against
  -- that exact constraint whenever an old edition already exists -
  -- caught by live testing against a real Postgres instance before ship.
  IF v_old_edition_id IS NOT NULL THEN
    UPDATE national_lottery_editions SET status = 'CLOSED', closed_at = now() WHERE id = v_old_edition_id;
  END IF;

  INSERT INTO national_lottery_editions (organization_id, store_id, label, created_by_user_id)
    VALUES (p_org_id, p_store_id, p_new_edition_label, p_actor_user_id)
    RETURNING id INTO v_new_edition_id;

  IF v_old_edition_id IS NOT NULL THEN
    FOR v_customer IN
      SELECT nlc.id, nlc.customer_id, nlc.full_name, nlc.participation_type,
             nlce.id AS customer_edition_id, nlce.participation_type_snapshot
      FROM national_lottery_customers nlc
      JOIN national_lottery_customer_editions nlce ON nlce.national_lottery_customer_id = nlc.id
      WHERE nlce.edition_id = v_old_edition_id AND nlc.status = 'ACTIVE'
    LOOP
      -- Pending = the 5 draw codes minus ones already covered by an
      -- ACTIVE, non-REVERSAL row (a real cash COLLECTION, or a
      -- DEBT_TRANSFER from an even-earlier rollover that somehow never
      -- got collected - can't happen today since a customer always moves
      -- forward to a new edition, kept as a defensive, not load-bearing,
      -- case).
      SELECT array_agg(code) INTO v_pending FROM unnest(ARRAY['A','B','C','D','ST']) code
        WHERE code NOT IN (
          SELECT draw_code FROM national_lottery_draw_collections
          WHERE customer_edition_id = v_customer.customer_edition_id
            AND status = 'ACTIVE' AND movement_type <> 'REVERSAL');

      IF v_pending IS NOT NULL AND array_length(v_pending, 1) > 0 THEN
        v_debt := array_length(v_pending, 1) * national_lottery_draw_price(v_customer.participation_type_snapshot);
        v_customer_id := v_customer.customer_id;

        -- Graduate into a real Τεφτέρι identity the first time this
        -- subscriber ever needs one. Reused on every future rollover for
        -- the same person (national_lottery_customers.customer_id is
        -- persisted below), so "customer with many old debts" correctly
        -- accumulates against one customers.id via the existing trigger.
        IF v_customer_id IS NULL THEN
          INSERT INTO customers (organization_id, store_id, name, tier)
            VALUES (p_org_id, p_store_id, v_customer.full_name, 'B')
            RETURNING id INTO v_customer_id;
          UPDATE national_lottery_customers SET customer_id = v_customer_id WHERE id = v_customer.id;
        END IF;

        -- ONE credit transaction per customer per rollover - the existing
        -- apply_customer_credit_transaction() AFTER INSERT trigger
        -- (0001_schema.sql) maintains customers.current_debt/total_granted
        -- from this insert exactly as it does for every other grant
        -- today. No new balance logic anywhere.
        INSERT INTO customer_credit_transactions
          (organization_id, store_id, shift_id, customer_id, customer_name_snapshot,
           customer_tier_snapshot, type, amount, source, source_reference_id, notes, created_by_user_id)
          VALUES (p_org_id, p_store_id, NULL, v_customer_id, v_customer.full_name, 'B', 'GRANTED', v_debt,
                  'NATIONAL_LOTTERY', v_customer.customer_edition_id,
                  format('Εθνικό Λαχείο — Έκδοση κλειστή — Εκκρεμείς κληρώσεις: %s', array_to_string(v_pending, ', ')),
                  p_actor_user_id)
          RETURNING id INTO v_tx_id;

        -- One DEBT_TRANSFER row per pending draw - row-level traceability
        -- to customer + (old) edition + specific draw + amount + store +
        -- date, and also what makes that (customer_edition_id, draw_code)
        -- pair no longer "pending" if this function were ever re-examined
        -- for the same old edition (see ix_nl_draw_collections_one_active_
        -- draw_per_edition, 0013).
        INSERT INTO national_lottery_draw_collections
          (organization_id, store_id, national_lottery_customer_id, customer_edition_id, edition_id,
           draw_code, movement_type, amount, shift_id, credit_transaction_id, idempotency_key, created_by_user_id)
        SELECT p_org_id, p_store_id, v_customer.id, v_customer.customer_edition_id, v_old_edition_id,
               code, 'DEBT_TRANSFER', national_lottery_draw_price(v_customer.participation_type_snapshot),
               NULL, v_tx_id, gen_random_uuid()::TEXT, p_actor_user_id
        FROM unnest(v_pending) code;
      END IF;

      -- Every active customer moves to the new edition regardless of
      -- whether they had pending debt - their new-edition draws all start
      -- pending (there are simply no collection rows yet for the new
      -- customer_edition_id). Lottery number and participation_type carry
      -- over unchanged on national_lottery_customers itself; only the
      -- per-edition snapshot is a fresh row.
      INSERT INTO national_lottery_customer_editions
        (organization_id, store_id, national_lottery_customer_id, edition_id, participation_type_snapshot)
        VALUES (p_org_id, p_store_id, v_customer.id, v_new_edition_id, v_customer.participation_type);

      UPDATE national_lottery_customers SET current_edition_id = v_new_edition_id, updated_at = now()
        WHERE id = v_customer.id;
    END LOOP;
  END IF;

  RETURN v_new_edition_id;
END;
$$;
