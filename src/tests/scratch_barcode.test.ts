import { describe, expect, it } from 'vitest';
import {
  BARCODE_LENGTH, isValidGameNo, isValidPackCode, packPieces, packValue, readBarcode,
} from '../lib/scratchBarcode.ts';

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
