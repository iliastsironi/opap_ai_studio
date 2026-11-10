import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { COMMISSION_CONFLICT } from '../services/pnlService.ts';

/**
 * Το ON CONFLICT πρέπει να δείχνει στον δείκτη που ΥΠΑΡΧΕΙ.
 *
 * Η καταχώρηση προμηθειών έσκαγε με «duplicate key value violates unique
 * constraint "ux_pnl_commission_store_month_line"» σε κάθε διόρθωση μήνα: ο
 * κώδικας έκανε insert και υπολόγιζε να σβήσει τα παλιά μετά, αλλά ο
 * μοναδικός δείκτης τον σταματούσε πριν προλάβει.
 *
 * Τώρα γίνεται upsert πάνω σε αυτόν τον δείκτη. Αν οι στήλες του αλλάξουν σε
 * μελλοντικό migration και η σταθερά μείνει πίσω, η Postgres δεν γυρίζει
 * διορθωμένο νούμερο - γυρίζει «there is no unique or exclusion constraint
 * matching the ON CONFLICT specification», δηλαδή άλλο σφάλμα στην ίδια
 * οθόνη. Αυτό το τεστ δένει τα δύο μεταξύ τους.
 */
const INDEX_NAME = 'ux_pnl_commission_store_month_line';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');

/** Οι στήλες του δείκτη, από το τελευταίο migration που τον ορίζει. */
function indexColumns(): string {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  let found: string | null = null;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // CREATE UNIQUE INDEX ... <name> ON <table> (col, col, ...);
    const re = new RegExp(
      `CREATE\\s+UNIQUE\\s+INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${INDEX_NAME}\\s+ON\\s+\\w+\\s*\\(([^)]*)\\)`,
      'i'
    );
    const m = sql.match(re);
    if (m) found = m[1];
  }
  if (found === null) throw new Error(`Ο δείκτης ${INDEX_NAME} δεν βρέθηκε σε κανένα migration.`);
  return found
    .split(',')
    .map((c) => c.trim())
    .join(',');
}

describe('ο στόχος του upsert των προμηθειών', () => {
  it('είναι ακριβώς οι στήλες του μοναδικού δείκτη', () => {
    expect(COMMISSION_CONFLICT).toBe(indexColumns());
  });

  it('η σειρά και η μορφή είναι αυτή που θέλει το PostgREST', () => {
    // Χωρίς κενά και χωρίς εισαγωγικά: πάει αυτούσιο στο on_conflict= του URL.
    expect(COMMISSION_CONFLICT).toBe('organization_id,store_id,entry_date,line');
    expect(COMMISSION_CONFLICT).not.toMatch(/[\s"']/);
  });
});
