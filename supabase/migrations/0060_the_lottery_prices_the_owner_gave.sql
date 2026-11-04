-- Οι τιμές των λαχειών, όπως τις έδωσε ο Owner.
--
--   Ειδική Έκδοση χ5    κομμάτι  1 €    πεντάδα  5 €
--   Ειδική Έκδοση χ10   κομμάτι  2 €    πεντάδα 10 €
--   Λαϊκό               κομμάτι  2 €    πεντάδα 10 €
--   Πρωτοχρονιάτικο     κομμάτι  5 €    - καμία πεντάδα
--   Εθνικό                              πεντάδα 20 €
--
-- scratch_catalog held the two Ειδικές with their πεντάδα price sitting in
-- the κομμάτι field and no bundle behind it - 5 € and 10 € - because those
-- rows were written before a πεντάδα existed on them. Read as a piece price
-- against a five-piece bundle, that is 25 € and 50 € a πεντάδα: exactly the
-- figure the Owner reported from the counter.
--
-- The code pins these five on every read now, so the till is already right.
-- This puts the stored list back in agreement with it, because a catalogue
-- that disagrees with the app is a trap for whoever opens it next: they see
-- 5 €, correct nothing, and the next person to touch the code wonders which
-- of the two numbers was the real one.
--
-- price IS the per-piece price and bundle_size is how many pieces a πεντάδα
-- holds. The Εθνικό is the exception the whole file turns on: its 20 € IS
-- the πεντάδα and it has no piece behind it, so bundle_size stays NULL.
-- Modelling it as 4 € × 5 would agree on a whole πεντάδα and quarter every
-- serial already recorded.

UPDATE scratch_catalog AS c
SET    price       = t.price,
       bundle_size = t.bundle_size,
       updated_at  = now()
FROM (
  VALUES
    ('scr_eidiki_x5',         1::numeric, 5::int),
    ('scr_eidiki_x10',        2::numeric, 5::int),
    ('scr_laiko',             2::numeric, 5::int),
    ('scr_protochroniatiko',  5::numeric, NULL::int),
    ('scr_ethniko_x20',      20::numeric, NULL::int)
) AS t(code, price, bundle_size)
WHERE c.code = t.code
  AND (c.price IS DISTINCT FROM t.price OR c.bundle_size IS DISTINCT FROM t.bundle_size);

-- Τι έγινε.
SELECT c.code,
       c.name,
       c.price        AS "τιμή κομματιού",
       c.bundle_size  AS "κομμάτια ανά πεντάδα",
       CASE
         WHEN c.code = 'scr_ethniko_x20' THEN c.price
         WHEN c.bundle_size IS NULL      THEN NULL
         ELSE c.price * c.bundle_size
       END            AS "τιμή πεντάδας"
FROM   scratch_catalog c
WHERE  c.code IN ('scr_eidiki_x5', 'scr_eidiki_x10', 'scr_laiko',
                  'scr_protochroniatiko', 'scr_ethniko_x20')
ORDER  BY c.code;
