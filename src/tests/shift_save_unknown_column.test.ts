import { describe, it, expect } from 'vitest';
import { unknownColumnFrom } from '../services/supabase.ts';

// The drop-and-retry in updateShiftInFirestore, exercised without a network:
// the loop is "ask which column PostgREST rejected, remove it, go again".
// Reproduced here because the real failure mode - losing a twenty-minute till
// count to a column that does not exist yet - is not something to find out
// about in production for the third time.
function retryWithoutUnknownColumns(
  payload: Record<string, unknown>,
  knownColumns: string[]
): { sent: Record<string, unknown>; dropped: string[]; attempts: number } {
  let current = { ...payload };
  const dropped: string[] = [];

  for (let attempt = 0; attempt <= Object.keys(payload).length; attempt += 1) {
    const offender = Object.keys(current).find((k) => !knownColumns.includes(k));
    if (!offender) return { sent: current, dropped, attempts: attempt + 1 };

    const message = `Could not find the '${offender}' column of 'shifts' in the schema cache`;
    const missing = unknownColumnFrom(message);
    expect(missing).toBe(offender);

    const { [missing!]: _gone, ...rest } = current;
    current = rest;
    dropped.push(missing!);
  }
  throw new Error('did not converge');
}

describe('a shift save survives a column the database does not have yet', () => {
  const known = ['counted_cash', 'discrepancy', 'discrepancy_threshold', 'updated_at'];

  it('keeps the count and drops only the unknown field', () => {
    const r = retryWithoutUnknownColumns(
      {
        counted_cash: 1842.5,
        discrepancy: -5,
        discrepancy_threshold: 2,
        discrepancy_settlement: 'PAID_CASH',
        updated_at: 'now',
      },
      known
    );
    expect(r.dropped).toEqual(['discrepancy_settlement']);
    expect(r.sent.counted_cash).toBe(1842.5);
    expect(r.sent.discrepancy).toBe(-5);
    expect('discrepancy_settlement' in r.sent).toBe(false);
  });

  it('drops several unknown columns rather than giving up after one', () => {
    const r = retryWithoutUnknownColumns(
      { counted_cash: 10, discrepancy_settlement: 'CHARGE', some_future_field: 1, updated_at: 'now' },
      known
    );
    expect(r.dropped.sort()).toEqual(['discrepancy_settlement', 'some_future_field']);
    expect(r.sent).toEqual({ counted_cash: 10, updated_at: 'now' });
  });

  it('sends an all-known payload untouched on the first attempt', () => {
    const payload = { counted_cash: 1, discrepancy: 0, updated_at: 'now' };
    const r = retryWithoutUnknownColumns(payload, known);
    expect(r.attempts).toBe(1);
    expect(r.dropped).toEqual([]);
    expect(r.sent).toEqual(payload);
  });

  // The guard that keeps the loop from eating a real error: anything that is
  // not a missing column must be rethrown, not retried.
  it('does not mistake an RLS refusal or a unique violation for a bad column', () => {
    expect(unknownColumnFrom('new row violates row-level security policy for table "shifts"')).toBeNull();
    expect(unknownColumnFrom('duplicate key value violates unique constraint "ux_shifts_one_active_per_register"')).toBeNull();
  });
});
