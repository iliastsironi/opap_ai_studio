import { describe, expect, it } from 'vitest';
import { isZeroText, focusAction } from '../lib/zeroOnFocus.ts';

describe('clicking into a field that holds nothing', () => {
  it('clears a plain zero', () => {
    expect(focusAction('0')).toBe('clear');
  });

  it('clears the zero a money field shows', () => {
    for (const z of ['0.00', '0,00', '0.0', '00', '000']) {
      expect(focusAction(z)).toBe('clear');
    }
  });

  it('clears a negative zero and an already empty field', () => {
    expect(focusAction('-0')).toBe('clear');
    expect(focusAction('')).toBe('clear');
    expect(focusAction('   ')).toBe('clear');
    expect(focusAction(undefined)).toBe('clear');
  });

  it('treats a numeric zero the same as the text', () => {
    expect(focusAction(0)).toBe('clear');
  });
});

describe('clicking into a field that holds a figure', () => {
  it('selects it, so one keystroke replaces it', () => {
    for (const v of ['5', '0.01', '1234,56', '-12,50', '100']) {
      expect(focusAction(v)).toBe('select');
    }
  });

  it('does not mistake a small figure for a zero', () => {
    // 0,004 rounds to zero at two decimals but is not nothing.
    expect(isZeroText('0.004')).toBe(false);
  });

  it('selects rather than clears something it cannot read', () => {
    // Never destroy what you do not understand.
    expect(focusAction('abc')).toBe('select');
    expect(focusAction('1.2.3')).toBe('select');
  });

  it('leaves a half-typed entry alone', () => {
    expect(focusAction('-')).toBe('select');
    expect(focusAction(',')).toBe('select');
  });
});

import { parseNonNegativeAmount } from '../lib/limits.ts';

describe('an amount typed on a Greek keyboard', () => {
  it('reads a comma as the decimal separator', () => {
    // Before: «12,50» was not a number, the expense screen returned without
    // saving and without saying why, and the money never reached the books.
    expect(parseNonNegativeAmount('12,50')).toEqual({ value: 12.5, isValid: true });
  });

  it('still reads a full stop', () => {
    expect(parseNonNegativeAmount('12.50')).toEqual({ value: 12.5, isValid: true });
  });

  it('still refuses what is not an amount', () => {
    expect(parseNonNegativeAmount('-5').isValid).toBe(false);
    expect(parseNonNegativeAmount('abc').isValid).toBe(false);
    expect(parseNonNegativeAmount('1.2.3').isValid).toBe(false);
    expect(parseNonNegativeAmount('12,5,0').isValid).toBe(false);
  });

  it('still treats an empty field as nothing', () => {
    expect(parseNonNegativeAmount('')).toEqual({ value: 0, isValid: true });
  });
});
