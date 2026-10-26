import { describe, expect, it } from 'vitest';
import {
  creditsToApply,
  isWritableCredit,
  newCreditLineId,
} from '../lib/creditIdempotency.ts';

const line = (id: string, amount = 25) => ({
  id,
  customer_name: 'Σωτήρης Γιώτης',
  type: 'GRANTED',
  amount,
});

describe('a credit is written once, however many times the shift is submitted', () => {
  it('writes everything on the first submit', () => {
    expect(creditsToApply([line('a'), line('b')], []).map((l) => l.id)).toEqual(['a', 'b']);
  });

  // The bug: the second submit wrote the whole list again, and the INSERT
  // trigger added every amount to the customer's debt a second time.
  it('writes nothing on a resubmit', () => {
    expect(creditsToApply([line('a'), line('b')], ['a', 'b'])).toEqual([]);
  });

  it('writes only what is new after a correction', () => {
    expect(creditsToApply([line('a'), line('c')], ['a', 'b']).map((l) => l.id)).toEqual(['c']);
  });

  it('refuses a repeated id inside one list', () => {
    expect(creditsToApply([line('a'), line('a')], []).map((l) => l.id)).toEqual(['a']);
  });
});

// A shop can hand the same customer 25 € twice in one evening. A rule that
// spotted «duplicates» by comparing figures would refuse the second one,
// which is a worse bug than the one it replaces.
describe('two genuine credits of the same amount', () => {
  it('are both written', () => {
    const out = creditsToApply([line('a', 25), line('b', 25)], []);
    expect(out).toHaveLength(2);
  });
});

describe('lines that are not worth writing', () => {
  it('skips one with no customer', () => {
    expect(isWritableCredit({ id: 'x', customer_name: '  ', amount: 10 })).toBe(false);
  });

  it('skips a zero or negative amount', () => {
    expect(isWritableCredit({ id: 'x', customer_name: 'Α', amount: 0 })).toBe(false);
    expect(isWritableCredit({ id: 'x', customer_name: 'Α', amount: -5 })).toBe(false);
  });

  it('keeps an ordinary one', () => {
    expect(isWritableCredit(line('a'))).toBe(true);
  });

  it('drops them from the batch', () => {
    const out = creditsToApply([line('a'), { id: 'b', customer_name: '', amount: 5 }], []);
    expect(out.map((l) => l.id)).toEqual(['a']);
  });
});

describe('a line with no id of its own', () => {
  // Older rows, written before the id was stored. Refusing them would lose
  // real money; the duplicate they might cause cannot repeat, because the
  // next submit has an id.
  it('is written rather than dropped', () => {
    const out = creditsToApply([{ customer_name: 'Α', amount: 5, type: 'GRANTED' }], ['a']);
    expect(out).toHaveLength(1);
  });
});

describe('the id of a new line', () => {
  it('does not collide inside the same millisecond', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newCreditLineId()));
    expect(ids.size).toBe(500);
  });

  it('still looks like what the shift already stores', () => {
    expect(newCreditLineId().startsWith('temp_cred_')).toBe(true);
  });
});
