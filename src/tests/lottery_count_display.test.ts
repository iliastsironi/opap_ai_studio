import { describe, expect, it } from 'vitest';
import { displayedRowCount } from '../components/shifts/ScratchCalculatorTable.tsx';

// Το πλήθος μετριέται στη μονάδα που κοστολογείται η γραμμή.
describe('τι δείχνει η στήλη του πλήθους', () => {
  it('Λαϊκό σε πεντάδες: 337 κομμάτια είναι 67 πεντάδες', () => {
    // 2 €/κομμάτι με πεντάδα 5 - το πλήθος είναι κομμάτια, άρα διαιρείται.
    expect(displayedRowCount(337, 5, true)).toBe(67);
  });

  it('Εθνικό: 337 πεντάδες μένουν 337', () => {
    // Η τιμή ΕΙΝΑΙ η πεντάδα (bundleSize 0), άρα το πλήθος είναι ήδη
    // πεντάδες. Η διαίρεση το εμφάνιζε ως 67 - «μετράει κομμάτια».
    expect(displayedRowCount(337, 0, true)).toBe(337);
  });

  it('μία πεντάδα Εθνικού είναι μία, όχι μηδέν', () => {
    // floor(1 / 5) = 0: μία πεντάδα πωλημένη εμφανιζόταν ως τίποτα.
    expect(displayedRowCount(1, 0, true)).toBe(1);
  });

  it('χωρίς πεντάδες, το πλήθος περνάει ανέπαφο', () => {
    expect(displayedRowCount(337, 5, false)).toBe(337);
    expect(displayedRowCount(12, 0, false)).toBe(12);
  });

  it('ένα bundleSize που δεν είναι αριθμός δεν διαιρεί τίποτα', () => {
    expect(displayedRowCount(40, undefined, true)).toBe(40);
    expect(displayedRowCount(40, null, true)).toBe(40);
    expect(displayedRowCount(40, 'πεντάδα', true)).toBe(40);
    expect(displayedRowCount(40, -5, true)).toBe(40);
  });
});
