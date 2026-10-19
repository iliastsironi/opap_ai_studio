-- Who inspects is the operator of the new shift, not whoever is logged in.
--
-- «Nobody grades their own handover» compared the inspected shift's operator
-- against auth.uid(). That was the same person until the opening screen
-- started asking who works the shift. Now an Owner routinely types on behalf
-- of staff:
--
--   2/9 night    worked by Periklis   (the Owner)
--   3/9 morning  worked by Γιώργος    - but Periklis is the one signed in
--
-- Γιώργος counts the drawer; Periklis types. The function saw «Periklis is
-- about to grade Periklis» and refused - right by the rule, wrong about the
-- room - so the morning could never inspect the night. The same mistake 0041
-- fixed in the KPIs: crediting the person at the keyboard instead of the
-- person who did the work.
--
-- The inspector now comes from the INSPECTING SHIFT rather than from a
-- parameter naming a user, so it cannot simply be asserted: that shift has to
-- exist, belong to the caller's organisation, sit at the same till, and have
-- started after the shift being inspected. Passing nothing keeps the old
-- behaviour, for a caller that has no shift of its own.
--
-- inspected_by_user_id records the person who counted. The audit row keeps
-- auth.uid(), so who typed it is not lost either.
CREATE OR REPLACE FUNCTION record_shift_inspection(
  p_shift_id UUID,
  p_status TEXT,
  p_shortfall NUMERIC DEFAULT 0,
  p_detail JSONB DEFAULT NULL,
  p_by_shift_id UUID DEFAULT NULL
)
RETURNS shifts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_by shifts%ROWTYPE;
  v_after shifts%ROWTYPE;
  v_inspector UUID;
  v_operator_name TEXT;
  v_operator_role TEXT;
  v_inspector_name TEXT;
  v_shortfall NUMERIC(12,2);
  v_charge employee_charges%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('OK', 'FLAGGED', 'SKIPPED') THEN
    RAISE EXCEPTION 'Μη έγκυρη κατάσταση επιθεώρησης: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND OR v_shift.organization_id IS DISTINCT FROM auth_org_id() THEN
    RAISE EXCEPTION 'Η βάρδια δεν βρέθηκε' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (auth_is_elevated() OR auth_worked_shift(p_shift_id)) THEN
    RAISE EXCEPTION 'Δεν έχετε πρόσβαση σε αυτή τη βάρδια' USING ERRCODE = '42501';
  END IF;

  IF v_shift.status NOT IN ('SUBMITTED', 'APPROVED') THEN
    RAISE EXCEPTION 'Η επιθεώρηση αφορά κλεισμένη βάρδια (κατάσταση: %)', v_shift.status
      USING ERRCODE = '22023';
  END IF;

  -- Who is doing the counting.
  v_inspector := auth.uid();
  IF p_by_shift_id IS NOT NULL THEN
    SELECT * INTO v_by FROM shifts WHERE id = p_by_shift_id;
    IF NOT FOUND
       OR v_by.organization_id IS DISTINCT FROM auth_org_id()
       OR v_by.store_id IS DISTINCT FROM v_shift.store_id
       OR v_by.register_id IS DISTINCT FROM v_shift.register_id
       OR v_by.opened_at <= v_shift.opened_at THEN
      RAISE EXCEPTION 'Η βάρδια που επιθεωρεί δεν ακολουθεί αυτή που επιθεωρείται'
        USING ERRCODE = '22023';
    END IF;
    v_inspector := v_by.opened_by_user_id;
  END IF;

  IF v_shift.opened_by_user_id = v_inspector THEN
    RAISE EXCEPTION 'Δεν μπορείτε να επιθεωρήσετε τη δική σας βάρδια' USING ERRCODE = '42501';
  END IF;

  IF v_shift.inspection_status IS NOT NULL AND NOT auth_is_elevated() THEN
    RAISE EXCEPTION 'Η βάρδια έχει ήδη επιθεωρηθεί' USING ERRCODE = '22023';
  END IF;

  v_shortfall := CASE WHEN p_status = 'FLAGGED'
                      THEN GREATEST(0, ROUND(COALESCE(p_shortfall, 0), 2))
                      ELSE 0 END;

  IF p_status = 'FLAGGED' AND v_shortfall = 0 THEN
    RAISE EXCEPTION 'Μια επιθεώρηση με εύρημα πρέπει να έχει ποσό' USING ERRCODE = '22023';
  END IF;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_inspector_name FROM users WHERE id = v_inspector;
  v_inspector_name := COALESCE(NULLIF(v_inspector_name, ''), 'Υπάλληλος');

  UPDATE shifts
     SET inspection_status = p_status,
         inspection_shortfall = v_shortfall,
         inspection_detail = p_detail,
         inspected_by_user_id = v_inspector,
         inspected_at = now(),
         updated_at = now()
   WHERE id = p_shift_id
  RETURNING * INTO v_after;

  IF p_status = 'FLAGGED' THEN
    SELECT role_code, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
      INTO v_operator_role, v_operator_name
      FROM users WHERE id = v_shift.opened_by_user_id;
    v_operator_name := COALESCE(NULLIF(v_operator_name, ''), v_shift.opened_by_user_name, 'Υπάλληλος');

    IF COALESCE(v_operator_role, '') NOT IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN') THEN
      INSERT INTO employee_charges (
        organization_id, store_id, shift_id, employee_user_id, employee_name,
        amount, cause, status)
      VALUES (
        v_shift.organization_id, v_shift.store_id, v_shift.id,
        v_shift.opened_by_user_id, v_operator_name, v_shortfall, 'INSPECTION', 'OPEN')
      ON CONFLICT (shift_id, cause) DO UPDATE
        SET amount = EXCLUDED.amount,
            status = CASE WHEN employee_charges.status IN ('SETTLED', 'WAIVED')
                          THEN employee_charges.status ELSE 'OPEN' END,
            updated_at = now()
      RETURNING * INTO v_charge;

      INSERT INTO notifications
        (organization_id, store_id, recipient_user_id, recipient_name, type, title, body,
         amount, shift_id, charge_id, created_by_user_id)
      VALUES
        (v_shift.organization_id, v_shift.store_id, v_shift.opened_by_user_id, v_operator_name,
         'EMPLOYEE_CHARGE', 'Χρέωση από επιθεώρηση παράδοσης',
         'Ο/Η ' || v_inspector_name || ' βρήκε διαφορά στην παράδοση της βάρδιάς σας.',
         v_shortfall, v_shift.id, v_charge.id, auth.uid());
    END IF;

    INSERT INTO notifications
      (organization_id, store_id, recipient_user_id, recipient_name, type, title, body,
       amount, shift_id, charge_id, created_by_user_id)
    SELECT v_shift.organization_id, v_shift.store_id, u.id,
           TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')),
           'INSPECTION_FLAG', 'Βάρδια προς επιθεώρηση',
           'Ο/Η ' || v_inspector_name || ' βρήκε διαφορά στην παράδοση της βάρδιας του/της '
             || v_operator_name || '.',
           v_shortfall, v_shift.id, v_charge.id, auth.uid()
      FROM users u
     WHERE u.organization_id = v_shift.organization_id
       AND u.status = 'ACTIVE'
       AND u.role_code IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER')
       AND u.id IS DISTINCT FROM auth.uid();
  END IF;

  INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, after_state)
  VALUES (v_shift.organization_id, auth.uid(), audit_actor_email(),
          'SHIFT_INSPECTION', 'shifts', v_shift.id::text,
          jsonb_build_object(
            'status', p_status,
            'shortfall', v_shortfall,
            'store_id', v_shift.store_id,
            'register_id', v_shift.register_id,
            'inspector', v_inspector_name,
            'inspector_user_id', v_inspector,
            'entered_by', auth.uid(),
            'detail', p_detail));

  RETURN v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION record_shift_inspection(UUID, TEXT, NUMERIC, JSONB, UUID) TO authenticated;

-- The four-argument form from 0036 is a different signature and still exists.
-- Dropped so there is one function and no ambiguity about which a call means.
DROP FUNCTION IF EXISTS record_shift_inspection(UUID, TEXT, NUMERIC, JSONB);
