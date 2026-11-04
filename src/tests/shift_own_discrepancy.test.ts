import { describe, expect, it } from 'vitest';
import { ownDiscrepancy, settleShift, toleranceFor } from '../lib/shiftOwnDiscrepancy.ts';

describe('τι ανήκει σε αυτή τη βάρδια', () => {
  it('η πρώτη της ημέρας κρατάει όλη τη σωρευτική', () => {
    expect(ownDiscrepancy(-2.16, 0)).toBe(-2.16);
  });

  it('η δεύτερη αφαιρεί ό,τι είχε η ημέρα όταν άνοιξε', () => {
    // 11/10: πρωινή −2,16, σωρευτική στο κλείσιμο της μεσημεριανής +0,24.
    // Η μεσημεριανή πλήρωνε το μείον του προηγούμενου μέσα στο νούμερό της.
    expect(ownDiscrepancy(0.24, -2.16)).toBe(2.4);
  });

  it('το άθροισμα της ημέρας μένει ίδιο', () => {
    const first = ownDiscrepancy(-2.16, 0);
    const second = ownDiscrepancy(0.24, -2.16);
    expect(Math.round((first + second) * 100) / 100).toBe(0.24);
  });

  it('σκουπίδια διαβάζονται ως μηδέν', () => {
    expect(ownDiscrepancy(null, undefined)).toBe(0);
    expect(ownDiscrepancy('abc', 5)).toBe(-5);
  });
});

describe('η ανοχή', () => {
  it('πλήρης σε κάθε βάρδια, όχι μοιρασμένη', () => {
    expect(toleranceFor(5)).toBe(5);
  });

  it('αρνητική ανοχή δεν χρεώνει παραπάνω από το έλλειμμα', () => {
    expect(toleranceFor(-5)).toBe(0);
  });
});

describe('πώς τακτοποιείται', () => {
  it('έλλειμμα μέσα στην ανοχή το απορροφά το ταμείο', () => {
    expect(settleShift(-1.5, 0, 2)).toEqual({ own: -1.5, absorbed: -1.5, charged: 0 });
  });

  it('έλλειμμα πέρα από την ανοχή σπάει στα δύο', () => {
    expect(settleShift(-5, 0, 2)).toEqual({ own: -5, absorbed: -2, charged: 3 });
  });

  it('πλεόνασμα απορροφάται ολόκληρο, καμία χρέωση', () => {
    expect(settleShift(4, 0, 2)).toEqual({ own: 4, absorbed: 4, charged: 0 });
  });

  it('η δεύτερη βάρδια δεν χρεώνεται το μείον της πρώτης', () => {
    // Πρωινή −10 με ανοχή 2: χρεώνεται 8. Σωρευτική στο κλείσιμο της
    // μεσημεριανής −10 επίσης, δηλαδή η μεσημεριανή δεν έχασε τίποτα.
    expect(settleShift(-10, 0, 2).charged).toBe(8);
    expect(settleShift(-10, -10, 2)).toEqual({ own: 0, absorbed: 0, charged: 0 });
  });

  it('και χρεώνεται κανονικά τη δική της', () => {
    // Σωρευτική −15 μετά από πρωινή −10: δική της −5, χρέωση 3.
    expect(settleShift(-15, -10, 2)).toEqual({ own: -5, absorbed: -2, charged: 3 });
  });
});
