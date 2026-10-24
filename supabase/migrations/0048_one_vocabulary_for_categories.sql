-- One vocabulary of categories, for suppliers and for expenses.
--
-- A supplier was filed under OPAP_SERVICES, BEVERAGES_FNB,
-- OFFICE_CONSUMABLES or IT_EQUIPMENT; an expense under EXPENSES_GP,
-- EXPENSES_FNB, SUPPLIES and the rest. Two lists for one question - which
-- category does this get paid from - so the screens asked it twice, in
-- different words, and the answers had to be translated in code before the
-- supplier suggestions under an expense row could be narrowed at all.
--
-- The expense vocabulary wins because it is the one the books are kept in.
-- All 38 suppliers on record map onto it without a judgement call:
--
--   BEVERAGES_FNB       17  ->  EXPENSES_FNB
--   OTHER               12  ->  OTHER
--   CLEANING             3  ->  CLEANING
--   UTILITIES            3  ->  UTILITIES
--   OPAP_SERVICES        2  ->  EXPENSES_GP
--   OFFICE_CONSUMABLES   1  ->  SUPPLIES
--
-- IT_EQUIPMENT has no rows but is converted too, since old clients can still
-- write it until everyone has the new bundle.

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_category_check;

UPDATE suppliers SET category = CASE category
  WHEN 'OPAP_SERVICES'      THEN 'EXPENSES_GP'
  WHEN 'IT_EQUIPMENT'       THEN 'EXPENSES_GP'
  WHEN 'BEVERAGES_FNB'      THEN 'EXPENSES_FNB'
  WHEN 'OFFICE_CONSUMABLES' THEN 'SUPPLIES'
  ELSE category
END
WHERE category IN ('OPAP_SERVICES','IT_EQUIPMENT','BEVERAGES_FNB','OFFICE_CONSUMABLES');

-- The old names stay legal, so it does not matter whether this runs before
-- or after the deploy: a browser still holding the previous bundle writes a
-- value the table accepts, and the code reads both (expenseCategoryOfSupplier
-- in lib/expenseSuppliers.ts). Nothing writes the old names any more, so they
-- simply stop appearing.
ALTER TABLE suppliers ADD CONSTRAINT suppliers_category_check CHECK (
  category IS NULL OR category IN (
    'EXPENSES_GP','EXPENSES_FNB','SUPPLIES','UTILITIES','CLEANING','MAINTENANCE','OTHER',
    'OPAP_SERVICES','BEVERAGES_FNB','OFFICE_CONSUMABLES','IT_EQUIPMENT'
  )
);

-- Verify. Nothing should be left under an old name:
--
--   SELECT category, count(*) FROM suppliers GROUP BY category ORDER BY 2 DESC;
