import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «Θέλω μια εντολή ώστε να αντιγράψει τον τρόπο λειτουργίας της αποθήκης της Λαμίας για όλα τα
 * καταστήματα OPAP που θα δημιουργηθούν στο μέλλον.»
 *
 * Το migration 0095 κάνει τη Λαμία κατάλογο αναφοράς και αντιγράφει τον κατάλογό της σε κάθε
 * νέο πρακτορείο. Εδώ κλειδώνουν τα όρια της εντολής, γιατί το λάθος που κοστίζει δεν είναι
 * ότι δεν αντιγράφει: είναι ότι αντιγράφει εκεί που δεν πρέπει (Play, υπάρχοντα καταστήματα,
 * πακέτα, πρότυπο βάρδιας) ή ότι ρίχνει τη δημιουργία ενός καταστήματος.
 */

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/0095_a_new_agency_starts_with_the_catalogue_that_works.sql'),
  'utf8'
);

/** Μόνο ο εκτελέσιμος κώδικας: τα σχόλια του αρχείου αναφέρουν τα πάντα, δεν αποδεικνύουν τίποτα. */
const code = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('0095: νέο πρακτορείο = ο κατάλογος της Λαμίας', () => {
  it('ξεκινά μόνο σε νέο κατάστημα τύπου OPAP_AGENCY, ποτέ στο Play', () => {
    expect(code).toMatch(/AFTER INSERT ON stores/);
    expect(code).toMatch(/WHEN \(NEW\.store_type = 'OPAP_AGENCY'\)/);
    expect(code).not.toMatch(/PLAY_STORE/);
    // Όχι UPDATE σε υπάρχοντα καταστήματα: μόνο INSERT.
    expect(code).not.toMatch(/AFTER (UPDATE|INSERT OR UPDATE)/);
  });

  it('μόνο προσθέτει: ούτε αλλάζει ούτε σβήνει γραμμή καταλόγου', () => {
    expect(code).not.toMatch(/UPDATE\s+scratch_catalog\b/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+scratch_catalog\b/i);
    expect(code).not.toMatch(/TRUNCATE/i);
    expect(code).toMatch(/INSERT INTO scratch_catalog \(/);
    // Ό,τι υπάρχει ήδη στον προορισμό (ίδιος 4ψήφιος ή κωδικός) δεν ξαναγράφεται.
    expect(code).toMatch(/AND NOT EXISTS/);
    expect(code).toMatch(/dst\.game_no = src\.game_no/);
    expect(code).toMatch(/dst\.code = src\.code/);
  });

  it('δεν αντιγράφει πακέτα ούτε αγγίζει το πρότυπο βάρδιας', () => {
    expect(code).not.toMatch(/scratch_warehouse_packs/);
    expect(code).not.toMatch(/shift_templates/);
    expect(code).not.toMatch(/\bshifts\b/);
  });

  it('δεν αντιγράφει ποτέ ανάμεσα σε οργανισμούς', () => {
    expect(code).toMatch(/v_org_source <> v_org_target/);
    expect(code).toMatch(/RAISE EXCEPTION/);
  });

  it('δεν ρίχνει ποτέ τη δημιουργία του καταστήματος', () => {
    const trigger = code.slice(code.indexOf('CREATE OR REPLACE FUNCTION seed_agency_catalog_from_reference'));
    expect(trigger).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(trigger).toMatch(/RAISE WARNING/);
    // Και η κλήση της αντιγραφής είναι ΜΕΣΑ στο μπλοκ που πιάνει το σφάλμα.
    expect(trigger.indexOf('PERFORM copy_scratch_catalog')).toBeGreaterThan(trigger.indexOf('BEGIN\n    PERFORM'));
    expect(trigger.indexOf('PERFORM copy_scratch_catalog')).toBeLessThan(trigger.indexOf('EXCEPTION WHEN OTHERS'));
  });

  it('χωρίς κατάστημα αναφοράς δεν κάνει τίποτα (άλλος οργανισμός, ή σβησμένη αναφορά)', () => {
    expect(code).toMatch(/IF v_reference IS NULL OR v_reference = NEW\.id THEN\s+RETURN NEW;/);
  });

  it('οι συναρτήσεις δεν καλούνται από την εφαρμογή', () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION copy_scratch_catalog\(TEXT, TEXT\) FROM PUBLIC, anon, authenticated/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION seed_agency_catalog_from_reference\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('ο πίνακας αναφοράς είναι κλειστός στην εφαρμογή: RLS χωρίς καμία πολιτική', () => {
    expect(code).toMatch(/ALTER TABLE scratch_catalog_reference ENABLE ROW LEVEL SECURITY/);
    expect(code).toMatch(/REVOKE ALL ON scratch_catalog_reference FROM anon, authenticated/);
    expect(code).not.toMatch(/CREATE POLICY/);
    expect(code).not.toMatch(/GRANT/);
  });

  it('η αναφορά είναι η Λαμία, και μόνο αν είναι πρακτορείο', () => {
    expect(code).toContain("s.id = 'store_1792183703991_d2vu'");
    expect(code).toMatch(/s\.store_type = 'OPAP_AGENCY'/);
    expect(code).toMatch(/ON CONFLICT \(organization_id\) DO NOTHING/);
  });

  it('ό,τι κάνει τη σάρωση να δουλεύει αντιγράφεται: 4ψήφιος και μέγεθος πακέτου', () => {
    const insert = code.slice(code.indexOf('INSERT INTO scratch_catalog ('), code.indexOf('FROM scratch_catalog src'));
    for (const column of ['game_no', 'pack_pieces', 'sort_order', 'is_active', 'bundle_size', 'kind', 'price']) {
      expect(insert, column).toContain(column);
    }
  });
});
