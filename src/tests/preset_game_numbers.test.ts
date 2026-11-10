import { describe, expect, it } from 'vitest';
import { DEFAULT_SCRATCH_PRESETS, isLotteryRow } from '../components/shifts/ScratchCalculatorTable.tsx';

/**
 * Το κατάστημα που γεννήθηκε χωρίς αποθήκη.
 *
 * Οι αριθμοί παιχνιδιού ζούσαν μόνο σε ένα UPDATE του 0065, πάνω στα
 * καταστήματα που υπήρχαν τότε. Η Στυλίδα δημιουργήθηκε μετά, πήρε και τα
 * δεκαέξι παιχνίδια της από αυτά εδώ τα preset - χωρίς αριθμούς - και κάθε
 * παραλαβή στην αποθήκη απαντούσε «Άγνωστος αριθμός παιχνιδιού». Κανένα
 * πακέτο δεν μπορούσε να μπει, άρα η αποθήκη δεν αναλάμβανε ποτέ.
 */
const byId = (id: string) => DEFAULT_SCRATCH_PRESETS.find((r) => r.id === id);

describe('ο σπόρος του καταλόγου κουβαλάει τους αριθμούς παιχνιδιού', () => {
  it('κάθε σκρατς έχει τον δικό του τετραψήφιο', () => {
    const scratch = DEFAULT_SCRATCH_PRESETS.filter((r) => !isLotteryRow(r));
    expect(scratch.length).toBeGreaterThan(0);
    for (const row of scratch) {
      expect(row.gameNo, `${row.name} ${row.category}`).toMatch(/^\d{4}$/);
    }
  });

  it('οι εθνικοί αριθμοί είναι αυτοί που έγραψε το 0065', () => {
    // Πανελλαδικοί: το 0157 είναι η ΓΑΤΑ 2 € σε κάθε πρακτορείο.
    expect(byId('scr_2_gata')?.gameNo).toBe('0157');
    expect(byId('scr_10_x50')?.gameNo).toBe('0150');
    expect(byId('scr_1_seria')?.gameNo).toBe('0151');
    expect(byId('scr_20_gata_x20')?.gameNo).toBe('0160');
  });

  it('κανένας αριθμός δεν δίνεται σε δύο παιχνίδια', () => {
    // Ο μοναδικός δείκτης της βάσης το επιβάλλει ανά κατάστημα· αν τα
    // preset συγκρούονταν, κάθε νέο κατάστημα θα γεννιόταν με σφάλμα.
    const numbers = DEFAULT_SCRATCH_PRESETS.map((r) => r.gameNo).filter(Boolean);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('τα λαχεία ΔΕΝ παίρνουν αριθμό — δεν μπαίνουν στην αποθήκη', () => {
    // Έχουν παραλαβή ανά κλήρωση, όχι πακέτα 300 €. Ένας επινοημένος
    // αριθμός θα τα πρόσφερε στην «Καταχώρηση παραλαβής».
    for (const row of DEFAULT_SCRATCH_PRESETS.filter(isLotteryRow)) {
      expect(row.gameNo, row.name).toBeUndefined();
    }
  });
});
