import { describe, expect, it } from 'vitest';
import {
  lineFinding, summariseInspection, inspectionStatusFor, InspectionLine,
} from '../lib/shiftInspection.ts';

const line = (over: Partial<InspectionLine>): InspectionLine => ({
  key: 'k', label: 'l', kind: 'CASH', expected: 0, found: null, ...over,
});

describe('what the morning finds', () => {
  it('charges the gap when the float is short', () => {
    // The Owner's example: expects 1000, finds 995.
    const f = lineFinding(line({ kind: 'CASH', expected: 1000, found: 995 }));
    expect(f.missingUnits).toBe(5);
    expect(f.shortfall).toBe(5);
    expect(f.corrected).toBe(true);
  });

  it('charges nothing when there is more cash than declared', () => {
    // Never a credit - the same rule the discrepancy ledger follows.
    const f = lineFinding(line({ kind: 'CASH', expected: 1000, found: 1005 }));
    expect(f.shortfall).toBe(0);
    expect(f.corrected).toBe(true);
  });

  it('treats coins the same way as notes', () => {
    expect(lineFinding(line({ kind: 'COINS', expected: 47.35, found: 40 })).shortfall).toBe(7.35);
  });

  it('counts σκρατς as missing when the pack is FURTHER along than declared', () => {
    // The Owner's example: declared 55, found 56, a 10 € game.
    const f = lineFinding(line({ kind: 'SCRATCH', expected: 55, found: 56, unitPrice: 10 }));
    expect(f.missingUnits).toBe(1);
    expect(f.shortfall).toBe(10);
  });

  it('charges nothing when σκρατς is EARLIER than declared', () => {
    // The night over-reported a sale. Not a shortfall, still a correction.
    const f = lineFinding(line({ kind: 'SCRATCH', expected: 55, found: 54, unitPrice: 10 }));
    expect(f.shortfall).toBe(0);
    expect(f.corrected).toBe(true);
  });

  it('counts λαχεία as missing when FEWER remain than declared', () => {
    // Λαχεία are a remaining stock and count down - the opposite direction to
    // σκρατς. Getting this backwards charges the wrong person.
    const f = lineFinding(line({ kind: 'LOTTERY', expected: 20, found: 19, unitPrice: 2 }));
    expect(f.missingUnits).toBe(1);
    expect(f.shortfall).toBe(2);
  });

  it('charges nothing when MORE λαχεία remain than declared', () => {
    expect(lineFinding(line({ kind: 'LOTTERY', expected: 20, found: 21, unitPrice: 2 })).shortfall).toBe(0);
  });

  it('charges the price for every missing ticket, not just one', () => {
    expect(lineFinding(line({ kind: 'SCRATCH', expected: 40, found: 45, unitPrice: 2 })).shortfall).toBe(10);
    expect(lineFinding(line({ kind: 'LOTTERY', expected: 30, found: 24, unitPrice: 5 })).shortfall).toBe(30);
  });

  it('reports nothing for a line the operator has not filled in', () => {
    const f = lineFinding(line({ kind: 'CASH', expected: 1000, found: null }));
    expect(f).toEqual({ missingUnits: 0, shortfall: 0, corrected: false });
  });
});

describe('the whole inspection', () => {
  const lines: InspectionLine[] = [
    line({ key: 'cash', kind: 'CASH', expected: 1000, found: 995 }),
    line({ key: 'coins', kind: 'COINS', expected: 50, found: 50 }),
    line({ key: 'scr_a', kind: 'SCRATCH', expected: 55, found: 56, unitPrice: 10 }),
    line({ key: 'laiko', kind: 'LOTTERY', expected: 20, found: 20, unitPrice: 2 }),
  ];

  it('adds the sections into one figure', () => {
    const s = summariseInspection(lines);
    expect(s.shortfall).toBe(15);
    expect(s.shortKeys).toEqual(['cash', 'scr_a']);
    expect(s.correctedKeys).toEqual(['cash', 'scr_a']);
    expect(s.complete).toBe(true);
  });

  it('knows when a line is still blank', () => {
    const s = summariseInspection([...lines, line({ key: 'scr_b', kind: 'SCRATCH', expected: 10, found: null })]);
    expect(s.complete).toBe(false);
    expect(s.shortfall).toBe(15);
  });

  it('is FLAGGED only when something costs money', () => {
    expect(inspectionStatusFor(summariseInspection(lines))).toBe('FLAGGED');
    // A correction the other way is recorded but charges nobody, and a charge
    // of 0 would be refused by employee_charges' amount > 0 check.
    const harmless = [line({ key: 'scr_a', kind: 'SCRATCH', expected: 55, found: 54, unitPrice: 10 })];
    const s = summariseInspection(harmless);
    expect(s.correctedKeys).toEqual(['scr_a']);
    expect(inspectionStatusFor(s)).toBe('OK');
  });

  it('reports no shortfall at all when everything matches', () => {
    const clean = lines.map((l) => ({ ...l, found: l.expected }));
    const s = summariseInspection(clean);
    expect(s.shortfall).toBe(0);
    expect(s.correctedKeys).toEqual([]);
    expect(inspectionStatusFor(s)).toBe('OK');
  });
});

import { buildInspectionLines, applyInspectionToScratchRows } from '../components/shifts/ShiftInspectionPanel.tsx';

describe('building the lines from a real handover', () => {
  const declared = [
    { id: 'scr_a', name: 'Σκρατς 10€', category: 'Σκρατς', price: 10, startNo: '040', endNo: '055' },
    { id: 'scr_laiko', name: 'Λαϊκό Λαχείο', category: 'Λαχεία', price: 2, startNo: '25', endNo: '20' },
    { id: 'scr_untouched', name: 'Σκρατς 2€', category: 'Σκρατς', price: 2, startNo: '010', endNo: '' },
  ];

  it('puts cash and coins first, then a line per game', () => {
    const lines = buildInspectionLines({ notes: 1000, coins: 47.35 }, declared);
    expect(lines.slice(0, 2).map((l) => [l.kind, l.expected]))
      .toEqual([['CASH', 1000], ['COINS', 47.35]]);
    expect(lines).toHaveLength(5);
  });

  it('reads λαχεία as a remaining count and σκρατς as a serial', () => {
    const lines = buildInspectionLines({ notes: 0, coins: 0 }, declared);
    const scratch = lines.find((l) => l.key === 'scr_a')!;
    const laiko = lines.find((l) => l.key === 'scr_laiko')!;
    expect([scratch.kind, scratch.expected]).toEqual(['SCRATCH', 55]);
    expect([laiko.kind, laiko.expected]).toEqual(['LOTTERY', 20]);
  });

  it('uses the opening position for a pack the night never touched', () => {
    const untouched = buildInspectionLines({ notes: 0, coins: 0 }, declared)
      .find((l) => l.key === 'scr_untouched')!;
    expect(untouched.expected).toBe(10);
  });

  it('measures against the resolved float, not the configured one', () => {
    // Opening on 995 after a correction means 995 is what the drawer must
    // hold. Measuring against 1000 would hand this operator the gap.
    const lines = buildInspectionLines({ notes: 995, coins: 30 }, []);
    expect(lines[0].expected).toBe(995);
  });
});

describe('a correction becomes the next shift’s opening', () => {
  const declared = [
    { id: 'scr_a', name: 'Σκρατς 10€', category: 'Σκρατς', price: 10, startNo: '040', endNo: '055' },
    { id: 'scr_untouched', name: 'Σκρατς 2€', category: 'Σκρατς', price: 2, startNo: '010', endNo: '' },
  ];

  it('writes the corrected serial onto the closing the carry-over reads', () => {
    const lines = buildInspectionLines({ notes: 0, coins: 0 }, declared)
      .map((l) => (l.key === 'scr_a' ? { ...l, found: 56 } : l));
    const out = applyInspectionToScratchRows(declared, lines)!;
    expect(out.find((r) => r.id === 'scr_a').endNo).toBe('56');
  });

  it('corrects the opening instead when the pack was never closed', () => {
    const lines = buildInspectionLines({ notes: 0, coins: 0 }, declared)
      .map((l) => (l.key === 'scr_untouched' ? { ...l, found: 12 } : l));
    const out = applyInspectionToScratchRows(declared, lines)!;
    const row = out.find((r) => r.id === 'scr_untouched');
    expect(row.startNo).toBe('12');
    expect(row.endNo).toBe('');
  });

  it('leaves every untouched row exactly as declared', () => {
    const lines = buildInspectionLines({ notes: 0, coins: 0 }, declared);
    expect(applyInspectionToScratchRows(declared, lines)).toEqual(declared);
    expect(applyInspectionToScratchRows(declared, null)).toEqual(declared);
    expect(applyInspectionToScratchRows(null, lines)).toBeNull();
  });
});
