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

import { parseLooseNumber, isPartialNumber } from '../lib/looseNumber.ts';

describe('a customer charge typed with a comma', () => {
  it('is read as the amount, not the half of it', () => {
    // `parseFloat('12,50')` stops at the comma and answers 12 - the half the
    // customer owes. That is what the charge field used to record.
    expect(parseFloat('12,50')).toBe(12);
    expect(parseLooseNumber('12,50')).toBe(12.5);
  });

  it('survives the comma being typed', () => {
    // `type="number"` reports «12,» as an empty string, so the keystroke
    // vanished before any parse got near it. Here the comma is a legal
    // character, the field keeps «12,» on screen to type into, and the
    // committed figure follows the decimals as they arrive.
    expect(isPartialNumber('12,')).toBe(true);
    expect(parseLooseNumber('12,')).toBe(12);
    expect(parseLooseNumber('12,5')).toBe(12.5);
    expect(parseLooseNumber('12,50')).toBe(12.5);
  });

  it('still reads a full stop, for anyone who types one', () => {
    expect(parseLooseNumber('12.50')).toBe(12.5);
  });
});

describe('why a number-storing field needs NumericField', () => {
  it('«24,» is not yet an amount, so parsing every keystroke loses it', () => {
    // The expense row in the till stores a NUMBER. Parsing the text on each
    // keystroke means the moment the comma is typed the value becomes 0 and
    // the field wipes itself - which is «δε με αφήνει να βάλω δεκαδικά».
    expect(parseNonNegativeAmount('24,').isValid).toBe(false);
    expect(parseNonNegativeAmount('24,').value).toBe(0);
  });

  it('but it is a number in progress, which is what the field holds', () => {
    // NumericField keeps the text as typed and commits what parses, so the
    // decimals can arrive.
    expect(parseLooseNumber('24,')).toBe(24);
    expect(parseLooseNumber('24,2')).toBe(24.2);
    expect(parseLooseNumber('24,20')).toBe(24.2);
  });

  it('and the finished figure validates', () => {
    expect(parseNonNegativeAmount('24,20')).toEqual({ value: 24.2, isValid: true });
  });
});
