import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Ένα πεδίο που δεν γράφτηκε ποτέ δεν έχει αλλάξει.
 *
 * Ο υπάλληλος στη Λαμία δεν μπορούσε να σώσει τίποτα: «Το πεδίο Πίσω -
 * Τελικό είναι κλειδωμένο...», χωρίς να έχει αγγίξει κανένα νούμερο. Η
 * γραμμή του παιχνιδιού ήταν αποθηκευμένη ΧΩΡΙΣ το κλειδί, η οθόνη έστελνε
 * κενό, και στην Postgres `NULL IS DISTINCT FROM ''` είναι TRUE.
 *
 * Βρέθηκε και διορθώθηκε στο 0007. Το 0080 ξαναέγραψε τη συνάρτηση για την
 * εξαίρεση του ανοίγματος πακέτου και δεν μετέφερε τα COALESCE· το 0081 τα
 * κουβάλησε κι αυτό. Μια διόρθωση που ζει μόνο μέσα σε ένα σώμα συνάρτησης
 * χάνεται στο επόμενο CREATE OR REPLACE, σιωπηλά - εκτός αν κάτι την
 * κρατάει δεμένη. Αυτό το τεστ είναι αυτό το κάτι.
 */

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const MARKER = 'CREATE OR REPLACE FUNCTION enforce_scratch_field_locks()';

/** Το σώμα της συνάρτησης, από το ΤΕΛΕΥΤΑΙΟ migration που την ορίζει. */
function latestLockBody(): { file: string; body: string } {
  let found: { file: string; body: string } | null = null;
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const at = sql.lastIndexOf(MARKER);
    if (at === -1) continue;
    const end = sql.indexOf('$$;', at);
    found = { file, body: sql.slice(at, end === -1 ? undefined : end) };
  }
  if (!found) throw new Error('δεν βρέθηκε ορισμός του enforce_scratch_field_locks');
  return found;
}

describe('ο φύλακας των κλειδωμένων πεδίων', () => {
  const { file, body } = latestLockBody();

  it(`συγκρίνει με COALESCE, ώστε απόν = κενό (${file})`, () => {
    for (const field of ['startNo', 'backEndNo']) {
      expect(
        body,
        `το ${field} πρέπει να συγκρίνεται με COALESCE και στις δύο πλευρές`
      ).toContain(
        `COALESCE(old_item->>'${field}', '') IS DISTINCT FROM COALESCE(new_item->>'${field}', '')`
      );
    }
  });

  it('δεν συγκρίνει ποτέ τις ωμές τιμές', () => {
    // Αυτή ακριβώς η γραμμή ήταν το 0080: μοιάζει σωστή, και σκάει μόνο
    // όταν το κλειδί λείπει από το αποθηκευμένο αντικείμενο.
    for (const field of ['startNo', 'backEndNo']) {
      expect(body, field).not.toContain(
        `(old_item->>'${field}') IS DISTINCT FROM (new_item->>'${field}')`
      );
    }
  });

  it('κρατάει την εξαίρεση του ανοίγματος πακέτου', () => {
    // Η διόρθωση δεν επαναφέρει το 0007 σβήνοντας το 0080/0081: ο υπάλληλος
    // που ανοίγει πακέτο στον πάγκο πρέπει να συνεχίσει να περνάει.
    expect(body).toContain('scratch_pack_opening_allowed(');
  });

  it('αφήνει πάντα τους διευθυντικούς ρόλους να γράψουν', () => {
    expect(body).toContain('auth_is_elevated()');
  });
});
