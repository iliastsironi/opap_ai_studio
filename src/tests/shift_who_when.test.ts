import { describe, expect, it } from 'vitest';
import { whenOpened, whoAndWhen, whoOpened } from '../lib/shiftWhoWhen.ts';

describe('who is on the till and since when', () => {
  it('writes the operator and the moment together', () => {
    // 05:15 UTC on 26/10/2026 is 07:15 in Athens (EET by then).
    expect(whoAndWhen({ opened_by_user_name: 'Γιώργος', opened_at: '2026-10-26T05:15:00Z' }))
      .toBe('Γιώργος · 26/10/2026 07:15');
  });

  // The whole point of adding the date: a till left open overnight read as
  // though it had started this morning.
  it('carries the date, not just the time', () => {
    expect(whenOpened('2026-10-24T20:40:00Z')).toContain('24/10/2026');
  });

  it('reads the clock in Athens, whatever zone the browser is in', () => {
    // 23:30 UTC is 01:30 the NEXT day in Athens.
    expect(whenOpened('2026-10-26T23:30:00Z')).toBe('27/10/2026 01:30');
  });

  it('uses a 24-hour clock', () => {
    expect(whenOpened('2026-10-26T17:05:00Z')).toBe('26/10/2026 19:05');
  });

  it('names an operator we were not told about', () => {
    expect(whoOpened(null)).toBe('Υπάλληλος');
    expect(whoOpened('   ')).toBe('Υπάλληλος');
    expect(whoAndWhen({ opened_at: '2026-10-26T05:15:00Z' })).toBe('Υπάλληλος · 26/10/2026 07:15');
  });

  // Better the name alone than a separator with nothing after it.
  it('drops the separator when the timestamp is unreadable', () => {
    expect(whoAndWhen({ opened_by_user_name: 'Μαρία', opened_at: 'ουπς' })).toBe('Μαρία');
    expect(whoAndWhen({ opened_by_user_name: 'Μαρία', opened_at: null })).toBe('Μαρία');
    expect(whenOpened(undefined)).toBe('');
  });

  it('copes with no shift at all', () => {
    expect(whoAndWhen(null)).toBe('Υπάλληλος');
  });
});
