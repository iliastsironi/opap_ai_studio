import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «Τα παιχνίδια σαν κωδικοί υπάρχουν γενικά στην αποθήκη, απλά πρέπει να γίνεται η παραλαβή και η
 * καταχώρηση των κωδικών. Μη ξεχνάς ότι κάθε μαγαζί μπορεί να είναι ξεχωριστό.»
 *
 * Το 0095 αντιγράφει τον κατάλογο της Λαμίας σε καταστήματα του ΙΔΙΟΥ οργανισμού. Το 0096
 * προσθέτει τον πανελλαδικό κατάλογο για τα μαγαζιά ΑΛΛΩΝ πελατών. Εδώ κλειδώνει ότι ο
 * πανελλαδικός δεν κουβαλά τίποτα από κανέναν πελάτη και ότι ο κανόνας δεν μπερδεύει τα δύο.
 */

const read = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), 'supabase/migrations', name), 'utf8');

/** Μόνο ο εκτελέσιμος κώδικας: τα σχόλια του αρχείου αναφέρουν τα πάντα, δεν αποδεικνύουν τίποτα. */
const executable = (sql: string) =>
  sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

const code = executable(read('0096_a_new_customer_agency_starts_with_the_national_catalogue.sql'));

/** Το σώμα μιας συνάρτησης: από το CREATE της μέχρι το επόμενο REVOKE. */
const body = (name: string) => {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf('REVOKE ALL ON FUNCTION', start));
};

describe('0096: ο πανελλαδικός κατάλογος δεν ανήκει σε κανέναν πελάτη', () => {
  const table = code.slice(
    code.indexOf('CREATE TABLE IF NOT EXISTS scratch_catalog_default'),
    code.indexOf('CREATE UNIQUE INDEX')
  );

  it('δεν έχει στήλη οργανισμού ούτε καταστήματος ούτε ό,τι μπορεί να κρύψει ο πελάτης', () => {
    expect(table).not.toMatch(/organization_id/);
    expect(table).not.toMatch(/store_id/);
    // Το «κρυμμένο» είναι απόφαση του κάθε πελάτη και δεν ταξιδεύει.
    expect(table).not.toMatch(/is_active/);
  });

  it('είναι κλειστός στην εφαρμογή: RLS χωρίς καμία πολιτική', () => {
    expect(code).toMatch(/ALTER TABLE scratch_catalog_default ENABLE ROW LEVEL SECURITY/);
    expect(code).toMatch(/REVOKE ALL ON scratch_catalog_default FROM anon, authenticated/);
    expect(code).not.toMatch(/CREATE POLICY/);
    expect(code).not.toMatch(/GRANT/);
  });

  it('ο ίδιος αριθμός παιχνιδιού δεν υπάρχει δύο φορές', () => {
    expect(code).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_scratch_catalog_default_game_no\s+ON scratch_catalog_default \(game_no\)/);
  });

  it('γεμίζει από τη Λαμία, μόνο αν υπάρχει και είναι πρακτορείο', () => {
    expect(code).toContain("s.id = 'store_1792183703991_d2vu'");
    expect(code).toMatch(/s\.store_type = 'OPAP_AGENCY'/);
  });

  it('η ανανέωση προσθέτει και ενημερώνει, δεν σβήνει ποτέ', () => {
    const refresh = body('refresh_scratch_catalog_default');
    expect(refresh).toMatch(/ON CONFLICT \(code\) DO UPDATE/);
    expect(refresh).not.toMatch(/DELETE/i);
    expect(refresh).not.toMatch(/TRUNCATE/i);
    // Διαβάζει μόνο τον κατάλογο ΕΝΟΣ καταστήματος.
    expect(refresh).toMatch(/WHERE src\.store_id = p_source/);
  });
});

describe('0096: ο πανελλαδικός κατάλογος σε ένα νέο κατάστημα', () => {
  const apply = body('apply_default_scratch_catalog');

  it('γράφει στον οργανισμό του ΙΔΙΟΥ του καταστήματος, ποτέ σε άλλον', () => {
    expect(apply).toMatch(/SELECT organization_id INTO v_org FROM stores WHERE id = p_target/);
    expect(apply).toMatch(/INSERT INTO scratch_catalog \(/);
    expect(apply).toMatch(/\bv_org, p_target,/);
  });

  it('όλα τα παιχνίδια μπαίνουν ενεργά, ό,τι κι αν είχε κρύψει η πηγή', () => {
    expect(apply).toMatch(/d\.sort_order, TRUE,/);
  });

  it('μόνο προσθέτει: ό,τι υπάρχει ήδη (4ψήφιος, κωδικός, όνομα λαχείου) δεν ξαναγράφεται', () => {
    expect(apply).toMatch(/WHERE NOT EXISTS/);
    expect(apply).toMatch(/dst\.game_no = d\.game_no/);
    expect(apply).toMatch(/dst\.code = d\.code/);
    expect(apply).not.toMatch(/UPDATE\s+scratch_catalog\b/i);
    expect(apply).not.toMatch(/DELETE/i);
  });

  it('δεν αγγίζει πακέτα, πρότυπο βάρδιας ή βάρδιες', () => {
    expect(code).not.toMatch(/scratch_warehouse_packs/);
    expect(code).not.toMatch(/shift_templates/);
    expect(code).not.toMatch(/\bshifts\b/);
  });
});

describe('0096: ο κανόνας του νέου πρακτορείου', () => {
  const rule = body('seed_agency_catalog_from_reference');

  it('οργανισμός χωρίς αναφορά → πανελλαδικός· με αναφορά → ο ζωντανός κατάλογός της', () => {
    expect(rule).toMatch(/IF v_reference IS NULL THEN\s+PERFORM apply_default_scratch_catalog\(NEW\.id\);/);
    expect(rule).toMatch(/ELSIF v_reference <> NEW\.id THEN\s+PERFORM copy_scratch_catalog\(v_reference, NEW\.id\);/);
  });

  it('δεν ρίχνει ποτέ τη δημιουργία του καταστήματος, και οι δύο διαδρομές είναι μέσα στο μπλοκ', () => {
    expect(rule).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(rule).toMatch(/RAISE WARNING/);
    const guarded = rule.slice(rule.indexOf('BEGIN\n    IF'), rule.indexOf('EXCEPTION WHEN OTHERS'));
    expect(guarded).toContain('apply_default_scratch_catalog');
    expect(guarded).toContain('copy_scratch_catalog');
  });

  it('αντικαθιστά μόνο τη συνάρτηση: το trigger του 0095 μένει όπως είναι (μόνο πρακτορεία, μόνο INSERT)', () => {
    expect(code).not.toMatch(/CREATE TRIGGER/);
    expect(code).not.toMatch(/DROP TRIGGER/);
    expect(code).not.toMatch(/PLAY_STORE/);
    const trigger = executable(read('0095_a_new_agency_starts_with_the_catalogue_that_works.sql'));
    expect(trigger).toMatch(/AFTER INSERT ON stores/);
    expect(trigger).toMatch(/WHEN \(NEW\.store_type = 'OPAP_AGENCY'\)/);
  });

  it('οι συναρτήσεις δεν καλούνται από την εφαρμογή', () => {
    for (const fn of [
      'refresh_scratch_catalog_default\\(TEXT\\)',
      'apply_default_scratch_catalog\\(TEXT\\)',
      'seed_agency_catalog_from_reference\\(\\)',
    ]) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated`));
    }
  });
});
