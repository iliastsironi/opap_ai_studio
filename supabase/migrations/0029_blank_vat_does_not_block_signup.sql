-- The second agency to sign up cannot, because the first one's blank ΑΦΜ took
-- the only slot for it.
--
-- organizations.vat_number is NOT NULL UNIQUE. Nobody types an ΑΦΜ during
-- sign-up, so every new tenant's organisation is created with ''. The first
-- registration takes the empty string; every one after it is rejected with
-- 23505 - and the client tolerated 23505 as «the demo organisation already
-- existed», so it carried on with no organisation row at all. The users insert
-- that follows then fails on its foreign key, and the new owner is left with
-- an account that half exists.
--
-- Sign-up is open to anyone (disable_signup is false), so this is reachable by
-- the second person who ever registers, not only by a second paying agency.
--
-- Measured before writing this, against this project: two organisations
-- inserted with vat_number '' - the first lands, the second is rejected with
-- 23505 on organizations_vat_number_key. Both were removed again.
--
-- Two agencies must still not share a real ΑΦΜ; that is a genuine constraint
-- and it stays. Blank is not a real ΑΦΜ, it is the absence of one, so the
-- uniqueness becomes partial: it binds every value somebody has actually
-- entered and ignores the placeholder.

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_vat_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_organizations_vat_number
  ON organizations (vat_number)
  WHERE vat_number <> '';

-- Verify. Two blanks must both land; a duplicate of a real ΑΦΜ must not.
--
--   INSERT INTO organizations (id, legal_name, trade_name, vat_number)
--        VALUES ('probe_a','A','A',''), ('probe_b','B','B','');
--   -- expect: INSERT 0 2
--
--   INSERT INTO organizations (id, legal_name, trade_name, vat_number)
--        VALUES ('probe_c','C','C', (SELECT vat_number FROM organizations
--                                     WHERE id = 'org_opap_demo'));
--   -- expect: ERROR, duplicate key ... ux_organizations_vat_number
--
--   DELETE FROM organizations WHERE id LIKE 'probe_%';
