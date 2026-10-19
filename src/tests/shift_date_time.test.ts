import { describe, expect, it } from 'vitest';
import { normalizeTime24, splitLocalDateTime, joinLocalDateTime } from '../lib/shiftDateTime.ts';

describe('a 24-hour time, however it is typed', () => {
  it('takes the plain forms', () => {
    expect(normalizeTime24('09:30')).toBe('09:30');
    expect(normalizeTime24('21:05')).toBe('21:05');
    expect(normalizeTime24('00:00')).toBe('00:00');
    expect(normalizeTime24('23:59')).toBe('23:59');
  });

  it('takes the shorthand people actually type', () => {
    expect(normalizeTime24('9')).toBe('09:00');
    expect(normalizeTime24('09')).toBe('09:00');
    expect(normalizeTime24('930')).toBe('09:30');
    expect(normalizeTime24('0930')).toBe('09:30');
    expect(normalizeTime24('2105')).toBe('21:05');
    expect(normalizeTime24('9.30')).toBe('09:30');
    expect(normalizeTime24('9:3')).toBe('09:03');
    expect(normalizeTime24(' 13:00 ')).toBe('13:00');
  });

  it('refuses an impossible time instead of rolling it over', () => {
    // 25:00 quietly becoming 01:00 the next day would file the shift under
    // the wrong business day, which is the one thing the date field is for.
    expect(normalizeTime24('25:00')).toBeNull();
    expect(normalizeTime24('12:60')).toBeNull();
    expect(normalizeTime24('99')).toBeNull();
    expect(normalizeTime24('123456')).toBeNull();
  });

  it('treats blank as nothing entered', () => {
    expect(normalizeTime24('')).toBeNull();
    expect(normalizeTime24('   ')).toBeNull();
    expect(normalizeTime24(null)).toBeNull();
  });
});

describe('splitting and rejoining the shift start', () => {
  it('splits what the form holds', () => {
    expect(splitLocalDateTime('2026-09-02T13:26')).toEqual({ date: '2026-09-02', time: '13:26' });
    expect(splitLocalDateTime('2026-09-02T13:26:00')).toEqual({ date: '2026-09-02', time: '13:26' });
  });

  it('survives a blank or malformed value', () => {
    expect(splitLocalDateTime('')).toEqual({ date: '', time: '' });
    expect(splitLocalDateTime(null)).toEqual({ date: '', time: '' });
    expect(splitLocalDateTime('2026-09-02')).toEqual({ date: '2026-09-02', time: '' });
  });

  it('rejoins into exactly what the input expects', () => {
    expect(joinLocalDateTime('2026-09-02', '930')).toBe('2026-09-02T09:30');
    expect(joinLocalDateTime('2026-09-02', '13:26')).toBe('2026-09-02T13:26');
  });

  it('defaults an unreadable time to midnight rather than dropping the date', () => {
    // The day is what every report keys on; losing it to a half-typed time
    // would be the worse failure.
    expect(joinLocalDateTime('2026-09-02', 'ωρα')).toBe('2026-09-02T00:00');
    expect(joinLocalDateTime('', '13:00')).toBe('');
  });
});
