import { describe, expect, it } from 'vitest';
import { packPieces, packValue, PACKAGE_FACE_VALUE } from '../lib/scratchBarcode.ts';
import {
  packPieceCount, piecesLeftInPack,
  isValidPackCode as isValidFromPack, normalizePackCode,
} from '../lib/scratchPack.ts';
import { isValidPackCode as isValidFromBarcode } from '../lib/scratchBarcode.ts';
import { warnBelow, piecesRemaining } from '../lib/scratchPackWarning.ts';
import { packProgress } from '../lib/packProgress.ts';
import { getPackagePieceCount } from '../components/shifts/ScratchCalculatorTable.tsx';

/**
 * «Πόσα δελτία έχει το πακέτο;» πρέπει να έχει ΜΙΑ απάντηση.
 *
 * Είχε τρεις. Το lib/scratchBarcode σεβόταν το δηλωμένο μέγεθος του
 * καταλόγου, ενώ το ScratchCalculatorTable και το lib/scratchPack είχαν το
 * καθένα δικό του 300/τιμή. Το Χ50 (15 δελτία, 750 €) έβγαινε 6 δελτία και
 * 300 € σε δύο από τα τρία, και ο Owner το ανέφερε ΤΡΕΙΣ φορές - κάθε φορά
 * διορθωνόταν ένα σημείο και έμενε το επόμενο.
 *
 * Αυτό το αρχείο υπάρχει για να μη γίνει τέταρτη. Δεν δοκιμάζει τι κάνει
 * κάθε συνάρτηση· δοκιμάζει ότι ΣΥΜΦΩΝΟΥΝ.
 */
describe('κάθε δρόμος προς το μέγεθος πακέτου δίνει το ίδιο', () => {
  const GAMES: Array<{ name: string; price: number; declared?: number; pieces: number | null }> = [
    { name: '7ΑΡΙ Χ50', price: 50, declared: 15, pieces: 15 },
    { name: '7ΑΡΙ Χ20', price: 20, pieces: 15 },
    { name: 'Χ50 (10€)', price: 10, pieces: 30 },
    { name: 'ΜΑΓ ΚΕΡΑΣΙΑ', price: 3, pieces: 100 },
    { name: 'ΚΕΡΔΗ ΣΤΗ ΣΕΙΡΑ', price: 1, pieces: 300 },
    { name: 'μη τυπική τιμή', price: 7, pieces: null },
  ];

  for (const g of GAMES) {
    it(`${g.name} → ${g.pieces ?? 'άγνωστο'} δελτία, από κάθε σημείο`, () => {
      expect(packPieces(g.price, g.declared)).toBe(g.pieces);
      expect(packPieceCount(g.price, g.declared)).toBe(g.pieces);
      expect(getPackagePieceCount(g.price, g.declared)).toBe(g.pieces);

      if (g.pieces === null) {
        expect(piecesLeftInPack(g.price, 0, g.declared)).toBeNull();
        expect(piecesRemaining({ price: g.price, packPieces: g.declared, startNo: '0' })).toBeNull();
        expect(warnBelow(g.price, g.declared)).toBeNull();
        return;
      }

      // Από την αρχή του πακέτου, όλα λένε «όλα μέσα».
      expect(piecesLeftInPack(g.price, 0, g.declared)).toBe(g.pieces);
      expect(piecesRemaining({ price: g.price, packPieces: g.declared, startNo: '0' })).toBe(g.pieces);
      expect(packProgress({ startNo: '0', endNo: '0' } as any, g.pieces).remaining).toBe(g.pieces);
      // Και η αξία ακολουθεί τα δελτία, ποτέ τη σταθερά.
      expect(packValue(g.price, g.declared)).toBe(g.pieces * g.price);
    });
  }

  it('το δηλωμένο μέγεθος νικάει τον κανόνα, παντού', () => {
    // Χωρίς δηλωμένο: 300/50 = 6. Με δηλωμένο 15: 15. Αν κάποιο σημείο
    // αγνοήσει το δεύτερο όρισμα, σκάει εδώ.
    for (const f of [packPieces, packPieceCount, getPackagePieceCount]) {
      expect(f(50)).toBe(6);
      expect(f(50, 15)).toBe(15);
    }
  });

  it('η ονομαστική αξία είναι μία σταθερά, όχι τέσσερις', () => {
    expect(PACKAGE_FACE_VALUE).toBe(300);
    // Το 300 δεν είναι η αξία ΚΑΘΕ πακέτου - μόνο όσων ακολουθούν τον κανόνα.
    expect(packValue(50, 15)).toBe(750);
    expect(packValue(2)).toBe(300);
  });
});

describe('«έγκυρος κωδικός πακέτου» έχει κι αυτό μία απάντηση', () => {
  it('τα δύο σημεία συμφωνούν σε κάθε μορφή', () => {
    // Διαφωνούσαν: ο ένας έκανε trim, ο άλλος πετούσε τα μη-ψηφία. Ένας
    // κωδικός με παύλα ήταν έγκυρος στην αποθήκη και άκυρος στο ταμείο.
    for (const v of ['1234567', ' 1234567 ', '123-4567', '12 34567', '123456', '12345678', '', null]) {
      expect(isValidFromPack(v as any)).toBe(isValidFromBarcode(v as any));
    }
  });

  it('ο έλεγχος συμφωνεί με την κανονικοποίηση του ίδιου πεδίου', () => {
    // Ό,τι περνάει τον έλεγχο πρέπει να κανονικοποιείται σε επτά ψηφία, και
    // ό,τι κανονικοποιείται σε επτά ψηφία πρέπει να περνάει τον έλεγχο.
    for (const v of ['1234567', '123-4567', '12 34567', ' 1234567 ', '123456', 'abc']) {
      expect(isValidFromPack(v)).toBe(normalizePackCode(v).length === 7);
    }
  });
});
