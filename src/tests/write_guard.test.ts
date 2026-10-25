import { describe, expect, it } from 'vitest';
import { NOTHING_WRITTEN, rowsWrittenProblem } from '../lib/writeGuard.ts';

describe('a save that wrote nothing', () => {
  // PostgREST answers 204 with no error when RLS filtered the row out of the
  // UPDATE. The wizard reported «Αποθηκεύτηκε» and lost the whole count.
  it('is a failure, not a success', () => {
    expect(rowsWrittenProblem(0)).toBe(NOTHING_WRITTEN);
  });

  it('says what to do instead of just failing', () => {
    expect(NOTHING_WRITTEN).toContain('υπεύθυνο');
    expect(NOTHING_WRITTEN).toContain('Μην κλείσετε την οθόνη');
  });

  it('leaves a real write alone', () => {
    expect(rowsWrittenProblem(1)).toBeNull();
    expect(rowsWrittenProblem(7)).toBeNull();
  });

  // Not every call asks PostgREST for a count. Inventing a failure from no
  // evidence would stop a close that worked perfectly well.
  it('stays quiet when the count is simply unknown', () => {
    expect(rowsWrittenProblem(null)).toBeNull();
    expect(rowsWrittenProblem(undefined)).toBeNull();
  });
});
