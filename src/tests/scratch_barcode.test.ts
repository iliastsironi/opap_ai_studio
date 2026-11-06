import { describe, expect, it } from 'vitest';
import {
  BARCODE_LENGTH, isValidGameNo, isValidPackCode, packPieces, packValue, readBarcode,
} from '../lib/scratchBarcode.ts';
import {
  getPackagePieceCount, getPackageMaxNumber, validateScratchRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

describe('ο κωδικός σπάει στα τρία', () => {
  it('ο σαρωτής δίνει 14 ψηφία', () => {
    expect(BARCODE_LENGTH).toBe(14);
    const { parts, problem } = readBarcode('01573301482014');
    expect(problem).toBeNull();
    expect(parts).toEqual({ gameNo: '0157', packCode: '3301482', ticketNo: '014' });
  });

  it('το χέρι δίνει 11 — παιχνίδι και πακέτο', () => {
    const { parts } = readBarcode('01573301482');
    expect(parts).toEqual({ gameNo: '0157', packCode: '3301482', ticketNo: null });
  });

  it('κενά και παύλες αγνοούνται', () => {
    expect(readBarcode(' 0157-3301482 014 ').parts?.packCode).toBe('3301482');
  });

  it('λάθος μήκος λέει πόσα έχεις', () => {
    const { parts, problem } = readBarcode('0157330');
    expect(parts).toBeNull();
    expect(problem).toContain('7');
  });

  it('κενό πεδίο δεν είναι σφάλμα μήκους', () => {
    expect(readBarcode('').problem).toContain('Γράψτε');
  });
});

describe('τα δύο μέρη ξεχωριστά', () => {
  it('ο αριθμός παιχνιδιού είναι 4 ψηφία', () => {
    expect(isValidGameNo('0157')).toBe(true);
    expect(isValidGameNo('060')).toBe(false);   // το λάθος που έγινε στη λίστα
    expect(isValidGameNo('01570')).toBe(false);
  });

  it('ο κωδικός πακέτου είναι 7', () => {
    expect(isValidPackCode('3301482')).toBe(true);
    expect(isValidPackCode('330148')).toBe(false);
  });
});

describe('πόσα δελτία έχει ένα πακέτο', () => {
  it('ο κανόνας των 300 €', () => {
    expect(packPieces(1)).toBe(300);
    expect(packPieces(2)).toBe(150);
    expect(packPieces(3)).toBe(100);
    expect(packPieces(5)).toBe(60);
    expect(packPieces(10)).toBe(30);
    expect(packPieces(20)).toBe(15);
  });

  it('το δηλωμένο μέγεθος νικάει τον κανόνα', () => {
    // 7ΑΡΙ Χ50: 15 δελτία, 750 €. Ο κανόνας θα έδινε 6 και 300 €.
    expect(packPieces(50)).toBe(6);
    expect(packPieces(50, 15)).toBe(15);
    expect(packValue(50, 15)).toBe(750);
    expect(packValue(50)).toBe(300);
  });

  it('τιμή που δεν διαιρεί τα 300 δεν ορίζει πακέτο', () => {
    expect(packPieces(7)).toBeNull();
    expect(packValue(7)).toBe(0);
    // Εκτός αν το δηλώσει κάποιος.
    expect(packPieces(7, 40)).toBe(40);
  });

  it('κάθε κανονικό πακέτο αξίζει 300 €', () => {
    for (const price of [1, 2, 3, 5, 10, 20]) expect(packValue(price)).toBe(300);
  });
});

describe('το ταμείο και η αποθήκη μετράνε το ίδιο πακέτο', () => {
  it('δίνει 15 δελτία στο Χ50, όχι 6', () => {
    // Ο Owner: «το σκρατς χ50€ στο ταμείο νομίζει ότι κάνει 300 και το
    // μετράει για 6τμχ, κάνει 750€ και είναι 15τμ». Ο κατάλογος το κρατούσε
    // σωστά και η αποθήκη το διάβαζε· το ταμείο είχε δικό του αντίγραφο του
    // κανόνα που δεχόταν μόνο τιμή.
    expect(getPackagePieceCount(50, 15)).toBe(15);
    expect(getPackageMaxNumber(50, 15)).toBe(14);
  });

  it('συμφωνεί με την αποθήκη σε κάθε παιχνίδι του καταλόγου', () => {
    // Μία υλοποίηση, δύο ονόματα. Αν ξαναχωρίσουν, σκάει εδώ.
    const catalogue: Array<[number, number | undefined]> = [
      [50, 15], [50, undefined], [20, undefined], [10, undefined],
      [5, undefined], [3, undefined], [2, undefined], [1, undefined], [7, undefined],
    ];
    for (const [price, declared] of catalogue) {
      expect(getPackagePieceCount(price, declared)).toBe(packPieces(price, declared));
    }
  });

  it('κρατάει τον κανόνα των 300 όπου δεν έχει δηλωθεί μέγεθος', () => {
    expect(getPackagePieceCount(50)).toBe(6);
    expect(getPackagePieceCount(10)).toBe(30);
    expect(getPackagePieceCount(7)).toBeNull();
  });

  it('η αξία του πακέτου ακολουθεί τα δελτία, όχι τα 300', () => {
    expect(packValue(50, 15)).toBe(750);
    expect(packValue(50)).toBe(300);
  });
});

describe('οι προειδοποιήσεις του Χ50 μετράνε το δικό του πακέτο', () => {
  const x50 = (over: Record<string, unknown> = {}) => ({
    id: 'x50', name: '7ΑΡΙ Χ50', category: 'Σκρατς', price: 50,
    packPieces: 15, startNo: '4', endNo: '', backStartNo: '', backEndNo: '',
    saleBundles: '', salePieces: '', manualQty: '', ...over,
  }) as any;

  const warnings = (row: any) =>
    validateScratchRow(row).errors.filter((e) => e.severity === 'warning').map((e) => e.message);

  it('δεν φωνάζει για αξία μέσα στο πακέτο', () => {
    // Η οθόνη του Owner: 4 → 17, 13 τεμάχια, 650 €. Το πακέτο αξίζει 750,
    // οπότε δεν ξεπεράστηκε τίποτα - αλλά ο έλεγχος συγκρινόταν ακόμα με
    // τη σταθερά των 300 και φώναζε από τα 350 και πάνω.
    const w = warnings(x50({ startNo: '0', endNo: '13' }));
    expect(w.filter((m) => m.includes('αξία'))).toEqual([]);
  });

  it('φωνάζει μόνο πάνω από τα 750 του πακέτου', () => {
    const w = warnings(x50({ startNo: '0', endNo: '16' }));
    expect(w.some((m) => m.includes('αξία') && m.includes('750'))).toBe(true);
  });

  it('δεν λέει πια ότι το όριο βγαίνει από την τιμή', () => {
    // «000-015 για παιχνίδι των 50€»: το όριο βγαίνει από τον κατάλογο, και
    // το 015 δεν είναι αριθμός δελτίου - τα δελτία είναι 000 έως 014.
    const w = warnings(x50({ endNo: '17' }));
    expect(w.some((m) => m.includes('15 δελτία'))).toBe(true);
    expect(w.some((m) => m.includes('000-') || m.includes('παιχνίδι των'))).toBe(false);
  });

  it('ένα παιχνίδι χωρίς δηλωμένο μέγεθος κρατάει τον κανόνα των 300', () => {
    const w = warnings(x50({ price: 10, packPieces: undefined, startNo: '0', endNo: '31' }));
    expect(w.some((m) => m.includes('30 δελτία'))).toBe(true);
  });
});
