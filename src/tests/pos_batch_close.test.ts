import { describe, expect, it } from 'vitest';
import { carriedFromStored, posBreakdownText, posFromBatchClose } from '../lib/posBatchClose.ts';
import {
  defaultMachineReadings,
  normalizeMachineReadings,
  vltMachineTotal,
} from '../lib/vltMachineCash.ts';

describe('the POS figure a PLAY till is measured against', () => {
  // The Owner's own sheet for 15/10/26 writes the POS as «=1563,50 + 20»:
  // the batch report already net of the night before, plus tonight's tail.
  it('reproduces the sheet', () => {
    const r = posFromBatchClose({ batchTotal: 1563.5, afterClose: 20, carriedAfterClose: 0 });
    expect(r.amount).toBe(1583.5);
  });

  it('takes yesterday’s tail back out of today’s report', () => {
    // Tonight's report covers 00:00-00:00, so it still holds last night's
    // €20 of small hours. Tonight's own tail is €35.
    const r = posFromBatchClose({ batchTotal: 1583.5, afterClose: 35, carriedAfterClose: 20 });
    expect(r.amount).toBe(1598.5);
  });

  // Two consecutive nights must not count the same tail twice, and must not
  // lose it either: what one night adds, the next takes back out.
  it('neither double-counts nor loses a tail across two nights', () => {
    const monday = posFromBatchClose({ batchTotal: 1000, afterClose: 120, carriedAfterClose: 0 });
    const tuesday = posFromBatchClose({ batchTotal: 900, afterClose: 80, carriedAfterClose: 120 });
    expect(monday.amount).toBe(1120);
    expect(tuesday.amount).toBe(860);
    // The two batch reports hold 1900 between them, 120 of which Monday
    // borrowed forward; the two business days must come to that plus only
    // Tuesday's own 80 still outstanding.
    expect(monday.amount + tuesday.amount).toBe(1000 + 900 - 120 + 120 + 80 - 0);
  });

  it('is just the report when nothing was struck after midnight', () => {
    const r = posFromBatchClose({ batchTotal: 740.25, afterClose: 0, carriedAfterClose: 0 });
    expect(r.amount).toBe(740.25);
  });

  it('rounds to the cent', () => {
    const r = posFromBatchClose({ batchTotal: 10.005, afterClose: 0.1, carriedAfterClose: 0.02 });
    expect(r.amount).toBe(10.09);
  });

  it('treats blanks and rubbish as zero', () => {
    const r = posFromBatchClose({ batchTotal: '', afterClose: undefined, carriedAfterClose: 'ουπς' });
    expect(r.amount).toBe(0);
    expect(r.carried).toBe(0);
  });

  it('reads a comma-free string straight from an input', () => {
    const r = posFromBatchClose({ batchTotal: '1563.5', afterClose: '20', carriedAfterClose: '0' });
    expect(r.amount).toBe(1583.5);
  });

  // The field holds what the operator typed, and in Greek that is a comma.
  // Number('1563,5') is NaN, which read the whole card total as zero - caught
  // on screen, not here, which is why it is here now.
  it('reads the comma the operator actually types', () => {
    const r = posFromBatchClose({ batchTotal: '1563,5', afterClose: '20', carriedAfterClose: '0' });
    expect(r.amount).toBe(1583.5);
  });

  it('reads a comma in the carry and in tonight’s tail too', () => {
    const r = posFromBatchClose({ batchTotal: '1583,50', afterClose: '35,25', carriedAfterClose: '20,10' });
    expect(r.amount).toBe(1598.65);
  });
});

describe('when the carry cannot be right', () => {
  it('flags a yesterday bigger than today’s whole report', () => {
    const r = posFromBatchClose({ batchTotal: 50, afterClose: 10, carriedAfterClose: 400 });
    expect(r.carryExceedsBatch).toBe(true);
  });

  // Clamping at zero would balance the till on a figure nobody checked, so
  // the arithmetic is left as it falls and the flag does the warning.
  it('does not clamp the result into looking sane', () => {
    const r = posFromBatchClose({ batchTotal: 50, afterClose: 10, carriedAfterClose: 400 });
    expect(r.amount).toBe(-340);
  });

  it('stays quiet on an ordinary night', () => {
    expect(
      posFromBatchClose({ batchTotal: 1583.5, afterClose: 35, carriedAfterClose: 20 })
        .carryExceedsBatch
    ).toBe(false);
  });

  it('says the sum out loud for the operator', () => {
    const r = posFromBatchClose({ batchTotal: 1583.5, afterClose: 35, carriedAfterClose: 20 });
    expect(posBreakdownText(r)).toBe('1583,50 − 20,00 (χθεσινό) + 35,00 (απόψε)');
  });
});

describe('reading the night back on the approval screen', () => {
  it('recovers the carry the operator was shown', () => {
    const r = posFromBatchClose({ batchTotal: 1583.5, afterClose: 35, carriedAfterClose: 20 });
    expect(carriedFromStored(r.batchTotal, r.afterClose, r.amount)).toBe(20);
  });

  it('round-trips a night with no tail either side', () => {
    const r = posFromBatchClose({ batchTotal: 740.25, afterClose: 0, carriedAfterClose: 0 });
    expect(carriedFromStored(r.batchTotal, r.afterClose, r.amount)).toBe(0);
  });

  it('round-trips the cents', () => {
    const r = posFromBatchClose({ batchTotal: 1583.5, afterClose: 35.25, carriedAfterClose: 20.1 });
    expect(carriedFromStored(r.batchTotal, r.afterClose, r.amount)).toBe(20.1);
  });

  it('reads a carry bigger than the report without flipping its sign', () => {
    const r = posFromBatchClose({ batchTotal: 50, afterClose: 10, carriedAfterClose: 400 });
    expect(carriedFromStored(r.batchTotal, r.afterClose, r.amount)).toBe(400);
  });
});

describe('the cash inside the machines', () => {
  it('totals the Owner’s two ILinks', () => {
    expect(vltMachineTotal([
      { label: 'ILink #1', amount: 8900 },
      { label: 'ILink #2', amount: 7375 },
    ])).toBe(16275);
  });

  it('starts a shop off with two machines at zero', () => {
    expect(defaultMachineReadings()).toEqual([
      { label: 'ILink #1', amount: 0 },
      { label: 'ILink #2', amount: 0 },
    ]);
  });

  it('gives a hall as many rows as it has machines', () => {
    expect(defaultMachineReadings(6)).toHaveLength(6);
    expect(defaultMachineReadings(6)[5].label).toBe('ILink #6');
  });

  it('keeps a stored reading, label and all', () => {
    expect(normalizeMachineReadings([{ label: 'Μηχάνημα Α', amount: '125.5' }])).toEqual([
      { label: 'Μηχάνημα Α', amount: 125.5 },
    ]);
  });

  it('totals what the operator typed, commas and all', () => {
    expect(vltMachineTotal([
      { label: 'ILink #1', amount: '8900,50' },
      { label: 'ILink #2', amount: '7375,25' },
    ])).toBe(16275.75);
  });

  it('names an unlabelled row by its position', () => {
    expect(normalizeMachineReadings([{ amount: 10 }, { amount: 20 }])[1].label).toBe('ILink #2');
  });

  it('falls back to the default when the column holds nothing usable', () => {
    expect(normalizeMachineReadings(null)).toHaveLength(2);
    expect(normalizeMachineReadings([])).toHaveLength(2);
    expect(normalizeMachineReadings('ουπς')).toHaveLength(2);
  });

  it('totals nothing as nothing', () => {
    expect(vltMachineTotal([])).toBe(0);
    expect(vltMachineTotal(null)).toBe(0);
  });
});
