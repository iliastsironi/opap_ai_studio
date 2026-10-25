import { describe, expect, it } from 'vitest';
import {
  dayLabel,
  groupShiftsByDay,
  shiftDayKey,
  shiftTypeLabel,
} from '../lib/inspectionDayGroups.ts';

const base = { store_id: 'store_1', store_name: 'GameHall', register_id: 'REG-01' };

// A real Saturday at one shop: the morning hands over to the evening, and the
// evening is the one somebody actually inspects.
const morning = {
  ...base, id: 'm', shift_type: 'MORNING',
  opened_at: '2026-10-24T05:00:00Z', discrepancy: 0.4,
};
const evening = {
  ...base, id: 'e', shift_type: 'NIGHT',
  opened_at: '2026-10-24T13:00:00Z', discrepancy: -1.2,
};

describe('a day is one card', () => {
  it('puts the morning and the evening in the same group', () => {
    const groups = groupShiftsByDay([morning, evening]);
    expect(groups).toHaveLength(1);
    expect(groups[0].shifts.map((s) => s.id)).toEqual(['e', 'm']);
  });

  it('heads the group with the day’s last till', () => {
    expect(groupShiftsByDay([morning, evening])[0].lastShift.id).toBe('e');
  });

  it('finds the same last till whatever order they arrive in', () => {
    expect(groupShiftsByDay([evening, morning])[0].lastShift.id).toBe('e');
  });

  it('adds the day’s discrepancies up for the header', () => {
    expect(groupShiftsByDay([morning, evening])[0].totalDiscrepancy).toBe(-0.8);
  });

  it('keeps a lone shift as its own day', () => {
    const groups = groupShiftsByDay([morning]);
    expect(groups).toHaveLength(1);
    expect(groups[0].lastShift.id).toBe('m');
  });

  it('handles nothing at all', () => {
    expect(groupShiftsByDay([])).toEqual([]);
    expect(groupShiftsByDay(null)).toEqual([]);
  });
});

describe('what separates one day from another', () => {
  it('splits two calendar days', () => {
    const friday = { ...base, id: 'f', opened_at: '2026-10-23T13:00:00Z', discrepancy: 0 };
    expect(groupShiftsByDay([morning, evening, friday])).toHaveLength(2);
  });

  it('puts the most recent day first', () => {
    const friday = { ...base, id: 'f', opened_at: '2026-10-23T13:00:00Z', discrepancy: 0 };
    const groups = groupShiftsByDay([friday, morning, evening]);
    expect(groups.map((g) => g.day)).toEqual(['2026-10-24', '2026-10-23']);
  });

  it('does not merge two shops on the same date', () => {
    const other = {
      ...morning, id: 'o', store_id: 'store_2', store_name: 'Περικλής',
    };
    expect(groupShiftsByDay([morning, evening, other])).toHaveLength(2);
  });

  it('does not merge two tills of the same shop', () => {
    const till2 = { ...morning, id: 't2', register_id: 'REG-02' };
    expect(groupShiftsByDay([morning, evening, till2])).toHaveLength(2);
  });

  it('orders two shops of the same day by name, not by Map order', () => {
    const periklis = { ...morning, id: 'p', store_id: 'store_2', store_name: 'Αθηνά' };
    const groups = groupShiftsByDay([morning, periklis]);
    expect(groups.map((g) => g.storeName)).toEqual(['Αθηνά', 'GameHall']);
  });
});

describe('the day comes from Athens, from opened_at', () => {
  // 23:30 Athens on the 24th is 20:30 UTC. A night till opened then belongs to
  // the 24th - the day it opened - not to the 25th it closes in.
  it('keeps a late night shift on the day it opened', () => {
    const night = { ...base, id: 'n', opened_at: '2026-10-24T20:30:00Z', discrepancy: 0 };
    expect(groupShiftsByDay([night])[0].day).toBe('2026-10-24');
    expect(shiftDayKey(night)).toBe('store_1|REG-01|2026-10-24');
  });

  // 00:30 Athens on the 24th is 21:30 UTC on the 23rd. Read as UTC this would
  // land on the 23rd and split the day in half.
  it('keeps an after-midnight shift on the Athens day', () => {
    const afterMidnight = { ...base, id: 'a', opened_at: '2026-10-23T21:30:00Z', discrepancy: 0 };
    expect(groupShiftsByDay([afterMidnight])[0].day).toBe('2026-10-24');
  });

  // Midnight ends the business day, by the same rule the scratch serials and
  // the P&L use. A till opened at 23:00 and one opened at 00:40 are two days,
  // and the manager inspects them as two - which is what the agency does.
  it('starts a new day at midnight, not at the next handover', () => {
    const before = { ...base, id: 'b', opened_at: '2026-10-24T20:00:00Z', discrepancy: 0 };
    const after = { ...base, id: 'a', opened_at: '2026-10-24T21:40:00Z', discrepancy: 0 };
    const groups = groupShiftsByDay([before, after]);
    expect(groups.map((g) => g.day)).toEqual(['2026-10-25', '2026-10-24']);
  });
});

describe('labels', () => {
  it('names the day the way a manager reads it', () => {
    expect(dayLabel('2026-10-24')).toBe('Σάββατο 24 Οκτωβρίου');
  });

  it('does not slide the date into the day before', () => {
    expect(dayLabel('2026-01-01')).toContain('1 Ιανουαρίου');
  });

  it('names every shift type, and anything else too', () => {
    expect(shiftTypeLabel('MORNING')).toBe('Πρωινή');
    expect(shiftTypeLabel('AFTERNOON')).toBe('Απογευματινή');
    expect(shiftTypeLabel('NIGHT')).toBe('Βραδινή');
    expect(shiftTypeLabel('CUSTOM')).toBe('Βάρδια');
    expect(shiftTypeLabel(undefined)).toBe('Βάρδια');
  });
});
