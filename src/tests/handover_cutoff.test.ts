import { describe, expect, it } from 'vitest';
import { handoverCutoffBefore, isOwnShift } from '../lib/handoverCutoff.ts';

describe('asking for the handover on behalf of a shift that exists', () => {
  it('stops just short of the shift’s own start', () => {
    // The RPC compares with <=, so passing the shift's own start returns
    // the shift itself - and it inherits its own blank figures.
    const cutoff = handoverCutoffBefore('2026-09-08T13:00:00.000Z');
    expect(cutoff).toBe('2026-09-08T12:59:59.999Z');
    expect(new Date(cutoff!).getTime()).toBeLessThan(
      new Date('2026-09-08T13:00:00.000Z').getTime()
    );
  });

  it('still reaches a shift that started a minute earlier', () => {
    const cutoff = handoverCutoffBefore('2026-09-08T13:00:00.000Z');
    expect(new Date('2026-09-08T12:59:00.000Z').getTime()).toBeLessThanOrEqual(
      new Date(cutoff!).getTime()
    );
  });

  it('handles a timestamp with an offset', () => {
    expect(handoverCutoffBefore('2026-09-08T13:00:00+03:00')).toBe('2026-09-08T09:59:59.999Z');
  });

  it('asks without a cutoff when there is no start to go by', () => {
    expect(handoverCutoffBefore(undefined)).toBeUndefined();
    expect(handoverCutoffBefore(null)).toBeUndefined();
    expect(handoverCutoffBefore('όχι ημερομηνία')).toBeUndefined();
  });
});

describe('the snapshot that comes back', () => {
  it('is rejected when it is the asking shift', () => {
    // A cutoff cannot say «not this one», and two rows could share a start.
    expect(isOwnShift('abc', 'abc')).toBe(true);
  });

  it('is accepted when it is somebody else’s', () => {
    expect(isOwnShift('abc', 'def')).toBe(false);
  });

  it('does not reject on missing ids', () => {
    expect(isOwnShift(null, 'abc')).toBe(false);
    expect(isOwnShift('abc', undefined)).toBe(false);
  });
});
