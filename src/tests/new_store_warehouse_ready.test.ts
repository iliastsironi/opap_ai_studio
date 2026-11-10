import { describe, expect, it } from 'vitest';
import { DEFAULT_SCRATCH_PRESETS, isLotteryRow } from '../components/shifts/ScratchCalculatorTable.tsx';
import { packPieces, packValue } from '../lib/scratchBarcode.ts';

/**
 * «Άρα η αποθήκη είναι έτοιμη για κάθε νέο μαγαζί;»
 *
 * Το fetchWarehouseGames κρατάει ένα παιχνίδι μόνο αν περάσει ΚΑΙ τα δύο
 * φίλτρα: τετραψήφιος αριθμός, και γνωστό μέγεθος πακέτου. Το δεύτερο κόβει
 * σιωπηλά - `if (pieces === null) continue` - οπότε ένα παιχνίδι με τιμή
 * που δεν διαιρεί το 300 θα έλειπε από την αποθήκη χωρίς να το πει κανείς.
 *
 * Αυτό το τεστ περνάει τον σπόρο κάθε νέου μαγαζιού από τα ίδια φίλτρα.
 */
describe('ο κατάλογος ενός νέου μαγαζιού φτάνει ολόκληρος στην αποθήκη', () => {
  const scratch = DEFAULT_SCRATCH_PRESETS.filter((r) => !isLotteryRow(r));

  it('κάθε σκρατς περνάει και τα δύο φίλτρα', () => {
    expect(scratch.length).toBeGreaterThan(0);
    for (const row of scratch) {
      expect(row.gameNo, `${row.name} ${row.category}: αριθμός`).toMatch(/^\d{4}$/);
      expect(
        packPieces(row.price, (row as any).packPieces),
        `${row.name} ${row.category}: μέγεθος πακέτου`
      ).not.toBeNull();
    }
  });

  it('κάθε πακέτο έχει αξία — τίποτα δεν μπαίνει στην αποθήκη με 0 €', () => {
    for (const row of scratch) {
      expect(packValue(row.price, (row as any).packPieces), row.name).toBeGreaterThan(0);
    }
  });

  it('οι τιμές διαιρούν το 300, που είναι ο κανόνας του πακέτου', () => {
    // 1, 2, 3, 5, 10, 20 - αν μπει ποτέ προκαθορισμένο παιχνίδι στα 7 €,
    // αυτό σπάει εδώ αντί να λείψει αθόρυβα από την αποθήκη.
    for (const row of scratch) {
      expect(300 % Number(row.price), `${row.name} @ ${row.price}€`).toBe(0);
    }
  });
});
