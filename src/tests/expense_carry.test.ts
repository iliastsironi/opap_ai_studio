import { describe, expect, it } from 'vitest';
import { isCarriedExpense } from '../lib/expenseCarry.ts';

const SHIFT = 'evening';
const OPENED = '2026-09-01T13:00:00Z';

describe('which of the day’s expenses this shift inherited', () => {
  it('inherits one tied to an earlier shift', () => {
    // The case that was costing money: the morning's expenses arrived from
    // the server and were discarded, so the evening reconciled without them
    // and its till came out over by exactly their amount.
    expect(isCarriedExpense({ shift_id: 'morning' }, SHIFT, OPENED)).toBe(true);
  });

  it('keeps its own as its own', () => {
    expect(isCarriedExpense({ shift_id: SHIFT }, SHIFT, OPENED)).toBe(false);
  });

  it('inherits an untied one entered before it opened', () => {
    // What the Έξοδα screen produces when somebody records a purchase with
    // no shift open. Counting it as this shift's own would let the operator
    // edit a figure from hours before they arrived.
    expect(isCarriedExpense(
      { shift_id: null, created_at: '2026-09-01T09:30:00Z' }, SHIFT, OPENED
    )).toBe(true);
  });

  it('keeps an untied one entered during it', () => {
    expect(isCarriedExpense(
      { shift_id: null, created_at: '2026-09-01T15:45:00Z' }, SHIFT, OPENED
    )).toBe(false);
  });

  it('treats an unusable timestamp as this shift’s own, never as locked', () => {
    // Wrong in the editable direction on purpose: an operator who can still
    // correct a figure is better off than one staring at a locked row that
    // nobody owns.
    expect(isCarriedExpense({ shift_id: null, created_at: null }, SHIFT, OPENED)).toBe(false);
    expect(isCarriedExpense({ shift_id: null, created_at: 'όχι ημερομηνία' }, SHIFT, OPENED)).toBe(false);
    expect(isCarriedExpense({ shift_id: null, created_at: OPENED }, SHIFT, null)).toBe(false);
  });
});
