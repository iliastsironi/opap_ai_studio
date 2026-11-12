import { describe, expect, it } from 'vitest';
import { calculateEnvelope } from '../lib/shiftEnvelope.ts';
import { inspectionHandover, InspectionLine } from '../lib/shiftInspection.ts';

const line = (over: Partial<InspectionLine> & Pick<InspectionLine, 'kind'>): InspectionLine => ({
  key: over.key ?? Math.random().toString(36),
  label: over.label ?? 'x',
  expected: over.expected ?? 0,
  found: over.found ?? null,
  unitPrice: over.unitPrice,
  kind: over.kind,
});

describe('what stays in the drawer, as two numbers', () => {
  it('splits the retained total into notes and coins', () => {
    // Η οθόνη του Owner: 1.025 φάκελος, 1.250,80 μένουν. Τα 1.250,80 είναι
    // 1.000 πάγιο σε χαρτονομίσματα + 250,80 κέρματα, και αυτό θέλει να
    // διαβάζει ο επόμενος.
    const e = calculateEnvelope({ countedNotes: 2025, countedCoins: 250.8, floatNotes: 1000 });
    expect(e.amount).toBe(1025);
    expect(e.retained).toBe(1250.8);
    expect(e.retainedNotes).toBe(1000);
    expect(e.retainedCoins).toBe(250.8);
  });

  it('keeps the two halves adding up to the whole', () => {
    for (const [n, c, f] of [[2025, 250.8, 1000], [800, 0, 1000], [1000, 33.33, 1000], [0, 12.5, 150]]) {
      const e = calculateEnvelope({ countedNotes: n, countedCoins: c, floatNotes: f });
      expect(e.retainedNotes + e.retainedCoins).toBeCloseTo(e.retained, 2);
    }
  });

  it('never retains more notes than the drawer holds', () => {
    // Συρτάρι κάτω από το πάγιο: μένει ό,τι υπάρχει, όχι ό,τι θα έπρεπε.
    const e = calculateEnvelope({ countedNotes: 800, countedCoins: 40, floatNotes: 1000 });
    expect(e.retainedNotes).toBe(800);
    expect(e.retainedCoins).toBe(40);
    expect(e.isShort).toBe(true);
  });
});

describe('τα παραδοτέα της επιθεώρησης', () => {
  it('keeps notes and coins apart', () => {
    const h = inspectionHandover([
      line({ kind: 'CASH', expected: 1000 }),
      line({ kind: 'COINS', expected: 250.8 }),
    ]);
    expect(h.notes).toBe(1000);
    expect(h.coins).toBe(250.8);
    expect(h.money).toBe(1250.8);
  });

  it('prices λαχεία, because their number is stock', () => {
    const h = inspectionHandover([
      line({ kind: 'LOTTERY', expected: 20, unitPrice: 2 }),
      line({ kind: 'LOTTERY', expected: 5, unitPrice: 20 }),
    ]);
    expect(h.lotteryUnits).toBe(25);
    expect(h.lotteryValue).toBe(140);
  });

  it('never prices σκρατς, because their number is a position', () => {
    // Ο αύξων αριθμός 53 δεν είναι 53 λαχνοί. Επί 5 € θα έδινε 265 € που δεν
    // αντιστοιχούν σε τίποτα - το λάθος που έχει ήδη κοστίσει εδώ.
    const h = inspectionHandover([
      line({ kind: 'SCRATCH', expected: 53, unitPrice: 5 }),
      line({ kind: 'SCRATCH', expected: 12, unitPrice: 2 }),
    ]);
    expect(h.scratchLines).toBe(2);
    expect(h.lotteryUnits).toBe(0);
    expect(h.lotteryValue).toBe(0);
    expect(h.money).toBe(0);
  });

  it('counts every ticket line, both kinds', () => {
    const h = inspectionHandover([
      line({ kind: 'CASH', expected: 1000 }),
      line({ kind: 'SCRATCH', expected: 53, unitPrice: 5 }),
      line({ kind: 'LOTTERY', expected: 20, unitPrice: 2 }),
    ]);
    expect(h.ticketLines).toBe(2);
  });

  it('answers zero on an empty inspection', () => {
    const h = inspectionHandover([]);
    expect(h).toEqual({
      notes: 0, coins: 0, money: 0,
      lotteryUnits: 0, lotteryValue: 0, lotteryLines: 0, scratchLines: 0, ticketLines: 0,
    });
  });
});
