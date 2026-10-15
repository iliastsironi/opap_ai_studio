import { describe, expect, it } from 'vitest';
import { buildShiftDailySeries } from '../lib/shiftDailySeries.ts';
import { Shift } from '../types/index.ts';

const shift = (over: Partial<Shift> = {}): Shift =>
  ({
    id: 's', organization_id: 'org_1', store_id: 'store_1', register_id: 'Ταμείο 1',
    shift_type: 'MORNING', status: 'APPROVED', opened_by_user_id: 'u1',
    opened_at: '2026-08-27T06:00:00Z', closed_at: '2026-08-27T14:00:00Z',
    opap_gross_sales: 0, vlts_cash_in: 0, vlts_cash_out: 0, vlts_net: 0,
    fnb_sales: 0, expenses_paid_cash: 0,
    ...over,
  }) as Shift;

describe('the daily series behind the overview chart', () => {
  it('leaves out a shift that has not closed', () => {
    // The live data had exactly this: an untouched DRAFT_CLOSING shift that
    // charted as a day of zero revenue, dragging the line to the floor. The
    // empty-state text has always said «κλεισμένες βάρδιες»; nothing enforced it.
    const series = buildShiftDailySeries([
      shift({ id: 'a', opap_gross_sales: 100 }),
      shift({ id: 'b', status: 'DRAFT_CLOSING', closed_at: null, opened_at: '2026-10-15T06:00:00Z' }),
      shift({ id: 'c', status: 'OPEN', closed_at: null, opened_at: '2026-10-16T06:00:00Z' }),
    ]);
    expect(series.map((p) => p.day)).toEqual(['2026-08-27']);
  });

  it('adds up the shifts that share a day instead of drawing each one', () => {
    const series = buildShiftDailySeries([
      // Both inside the same Athens day. 22:00 UTC would not be: Athens is
      // UTC+3 in August, so that is 01:00 the next morning.
      shift({ id: 'a', closed_at: '2026-08-27T09:00:00Z', opap_gross_sales: 100, fnb_sales: 10 }),
      shift({ id: 'b', closed_at: '2026-08-27T18:00:00Z', opap_gross_sales: 250, fnb_sales: 5 }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].revenue).toBe(365);
  });

  it('orders days oldest to newest whatever order they arrive in', () => {
    // The shift list comes back newest-first, and the previous code just
    // reversed it - which is only the same thing while one shift is one day.
    const series = buildShiftDailySeries([
      shift({ id: 'c', closed_at: '2026-08-30T14:00:00Z' }),
      shift({ id: 'a', closed_at: '2026-08-27T14:00:00Z' }),
      shift({ id: 'b', closed_at: '2026-08-29T14:00:00Z' }),
    ]);
    expect(series.map((p) => p.day)).toEqual(['2026-08-27', '2026-08-29', '2026-08-30']);
    expect(series.map((p) => p.date)).toEqual(['27/8', '29/8', '30/8']);
  });

  it('keeps a gap as a gap, by simply not inventing the missing days', () => {
    // 30/8 to 22/9 is 23 days with nothing recorded. Those days are absent
    // rather than present-and-zero: nobody traded zero, nobody traded at all.
    const series = buildShiftDailySeries([
      shift({ id: 'a', closed_at: '2026-08-30T14:00:00Z', opap_gross_sales: 5000 }),
      shift({ id: 'b', closed_at: '2026-09-22T14:00:00Z' }),
    ]);
    expect(series.map((p) => p.date)).toEqual(['30/8', '22/9']);
  });

  it('adds VLT cash out, because it is stored already negative', () => {
    // The live shifts carry out = -307 with net = -307, so net is in + out.
    // Deriving it as in - out flips the sign of every payout.
    const derived = buildShiftDailySeries([
      shift({ vlts_net: null, vlts_cash_in: 1000, vlts_cash_out: -300 } as Partial<Shift>),
    ]);
    expect(derived[0].vlt).toBe(700);

    const recorded = buildShiftDailySeries([shift({ vlts_net: -427 })]);
    expect(recorded[0].vlt).toBe(-427);
  });

  it('keeps only the most recent days when there are more than asked for', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      shift({ id: `s${i}`, closed_at: `2026-09-${String(i + 1).padStart(2, '0')}T14:00:00Z` })
    );
    const series = buildShiftDailySeries(many, 15);
    expect(series).toHaveLength(15);
    expect(series[0].day).toBe('2026-09-06');
    expect(series[14].day).toBe('2026-09-20');
  });
});
