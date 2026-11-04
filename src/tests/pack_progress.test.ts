import { describe, expect, it } from 'vitest';
import { packProgress, progressTone } from '../lib/packProgress.ts';

describe('πού βρίσκεται ένα πακέτο', () => {
  it('καινούριο πακέτο, τίποτα πουλημένο', () => {
    expect(packProgress({ startNo: '0', endNo: '' }, 150)).toEqual({
      position: 0, sold: 0, pieces: 150, percent: 0, remaining: 150,
    });
  });

  it('το τελικό είναι η θέση μέσα στο πακέτο', () => {
    // Σε σκρατς ο αριθμός μεγαλώνει - αντίθετα από τα λαχεία.
    const p = packProgress({ startNo: '0', endNo: '45' }, 150);
    expect(p.position).toBe(45);
    expect(p.sold).toBe(45);
    expect(p.percent).toBe(30);
    expect(p.remaining).toBe(105);
  });

  it('χωρίς τελικό, μετράει το αρχικό', () => {
    // Η βάρδια άνοιξε και δεν έχει γράψει ακόμα τελικό.
    expect(packProgress({ startNo: '60', endNo: '' }, 150).position).toBe(60);
  });

  it('η πίσω πλευρά μετράει ανάποδα', () => {
    const p = packProgress({ startNo: '0', endNo: '20', backEndNo: '149', backStartNo: '139' }, 150);
    expect(p.sold).toBe(30);   // 20 μπροστά + 10 πίσω
    expect(p.percent).toBe(20);
  });

  it('χωρίς backStartNo δεν έχει φύγει τίποτα από πίσω', () => {
    // Το backEndNo είναι η βάση του νέου πακέτου, όχι πώληση.
    expect(packProgress({ startNo: '0', endNo: '10', backEndNo: '149' }, 150).sold).toBe(10);
  });

  it('τελειωμένο πακέτο', () => {
    const p = packProgress({ startNo: '0', endNo: '150' }, 150);
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
  });

  it('δεν ξεπερνάει ποτέ το 100%', () => {
    // Νούμερο πάνω από το μέγεθος είναι λάθος καταχώρηση, όχι υπερπώληση -
    // και μια μπάρα στο 110% θα έλεγε ψέματα για όλες τις υπόλοιπες.
    const p = packProgress({ startNo: '0', endNo: '200' }, 150);
    expect(p.percent).toBe(100);
    expect(p.sold).toBe(150);
    expect(p.remaining).toBe(0);
  });

  it('χωρίς γραμμή ή χωρίς μέγεθος, μηδέν', () => {
    expect(packProgress(null, 150).percent).toBe(0);
    expect(packProgress({ endNo: '50' }, 0).percent).toBe(0);
  });

  it('σκουπίδια δεν γίνονται θέση', () => {
    expect(packProgress({ startNo: 'abc', endNo: '—' }, 150).position).toBe(0);
  });
});

describe('το χρώμα της μπάρας', () => {
  it('γεμίζει όσο αδειάζει το πακέτο', () => {
    expect(progressTone(0)).toBe('LOW');
    expect(progressTone(49)).toBe('LOW');
    expect(progressTone(50)).toBe('MID');
    expect(progressTone(84)).toBe('MID');
    expect(progressTone(85)).toBe('HIGH');
    expect(progressTone(100)).toBe('HIGH');
  });
});
