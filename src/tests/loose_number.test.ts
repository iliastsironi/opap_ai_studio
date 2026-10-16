import { describe, expect, it } from 'vitest';
import {
  clampNumber,
  formatLooseNumber,
  isPartialNumber,
  parseLooseNumber,
} from '../lib/looseNumber.ts';

// On a Greek keyboard the decimal separator is a comma, so it is the first
// key pressed after the whole euros. `<input type="number">` reports «5,» as
// an empty string, and a field bound to `Number(value) || 0` therefore wiped
// itself the moment somebody reached for the decimals.
describe('reading a number while it is still being typed', () => {
  it('accepts a comma as the decimal separator', () => {
    expect(parseLooseNumber('5,5')).toBe(5.5);
    expect(parseLooseNumber('150,00')).toBe(150);
  });

  it('accepts a full stop too', () => {
    expect(parseLooseNumber('5.5')).toBe(5.5);
  });

  it('says «not yet a number» rather than zero for an unfinished entry', () => {
    // Returning 0 here is what cleared the field: the separator was pressed,
    // the value parsed as nothing, and nothing became zero.
    expect(parseLooseNumber('')).toBeNull();
    expect(parseLooseNumber('-')).toBeNull();
    expect(parseLooseNumber(',')).toBeNull();
    expect(parseLooseNumber('.')).toBeNull();
  });

  it('reads the whole part while the decimals are still coming', () => {
    expect(parseLooseNumber('5,')).toBe(5);
    expect(parseLooseNumber('150.')).toBe(150);
  });

  it('rejects text that is not a number at all', () => {
    expect(parseLooseNumber('abc')).toBeNull();
    expect(parseLooseNumber('1,2,3')).toBeNull();
  });

  it('allows the keystrokes a number is built from', () => {
    for (const t of ['', '-', '5', '5,', '5,0', '5.25', '0,05', '-3,5']) {
      expect(isPartialNumber(t), t).toBe(true);
    }
    for (const t of ['5,,', 'a', '5 5', '1.2.3']) {
      expect(isPartialNumber(t), t).toBe(false);
    }
  });

  it('clamps only when a bound is given', () => {
    expect(clampNumber(25, 1, 20)).toBe(20);
    expect(clampNumber(-5, 0)).toBe(0);
    expect(clampNumber(-5)).toBe(-5);
  });

  it('shows a committed value without trailing zeros it did not need', () => {
    expect(formatLooseNumber(150)).toBe('150');
    expect(formatLooseNumber(5.5)).toBe('5.5');
    expect(formatLooseNumber(0.05)).toBe('0.05');
    expect(formatLooseNumber(2.4, 0)).toBe('2');
  });
});
