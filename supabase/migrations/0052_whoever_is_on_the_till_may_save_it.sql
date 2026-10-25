-- Όποιος δουλεύει το ταμείο πρέπει να μπορεί να το αποθηκεύσει.
--
-- 0022 scoped shift visibility, and gave SELECT and UPDATE different answers
-- to the same question. SELECT deliberately keeps a shift that is still in
-- progress visible to colleagues - the comment there says so, so the
-- double-open guard keeps working and records can be attached to the live
-- shift. UPDATE was left at «elevated, or the person who OPENED it».
--
-- So a shop where one person opens the till and another closes it - which is
-- what a handover IS, and what this agency's own history shows on almost
-- every shift - had employees who could see the closing screen, fill in a
-- whole count, and write to nothing. Row level security does not raise on a
-- row it filters out of an UPDATE: the statement is legal and matches zero
-- rows, PostgREST answers 204, and the client called that success. The
-- screen printed «Αποθηκεύτηκε», and the entire count went when the screen
-- was left.
--
-- The client now checks the affected count and refuses to call that a save
-- (lib/writeGuard.ts). This is the other half: the person on the till is
-- allowed to save it.
--
-- UPDATE is brought in line with SELECT, and no further. A shift that has
-- been submitted or approved is NOT covered - enforce_shift_immutability
-- (0002) still raises 42501 for anyone who is not elevated, so the record a
-- manager has signed off stays exactly as locked as it was. What opens up is
-- only the window where the till is still being worked.
--
-- The WITH CHECK clause carries closed_by_user_id for one reason: submitting
-- moves the row to SUBMITTED, and the operator doing it stamps themselves as
-- the closer in the same statement. Without that term the new row would fall
-- outside the policy and the submit itself would be refused.

DROP POLICY IF EXISTS shifts_update ON shifts;
CREATE POLICY shifts_update ON shifts FOR UPDATE
  USING (
    belongs_to_org(organization_id)
    AND (
      auth_is_elevated()
      OR opened_by_user_id = auth.uid()
      OR closed_by_user_id = auth.uid()
      -- The same four the SELECT policy calls «still in progress».
      OR status IN ('OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED')
    )
  )
  WITH CHECK (
    belongs_to_org(organization_id)
    AND (
      auth_is_elevated()
      OR opened_by_user_id = auth.uid()
      OR closed_by_user_id = auth.uid()
      OR status IN ('OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED')
    )
  );

-- Verify.
--
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_clause
--     FROM pg_policy WHERE polname = 'shifts_update';
--
-- Then, signed in as an employee who did NOT open a shift that is still in
-- DRAFT_CLOSING at their own store:
--
--   UPDATE shifts SET employee_notes = 'δοκιμή' WHERE id = '<that shift>';
--     -> UPDATE 1   (it was UPDATE 0, silently, before this)
--
-- And on one that is APPROVED, the trigger still refuses:
--     -> ERROR: Shift ... is locked (status=APPROVED)   [42501]
