import { describe, expect, it } from 'vitest';
import {
  warnBelow, piecesRemaining, packWarning, packWarningText,
} from '../lib/scratchPackWarning.ts';

describe('when a game is worth flagging', () => {
  it('scales with the pack, which is not the same size for every price', () => {
    expect(warnBelow(1)).toBe(10);   // 300 per pack; a tenth would be too eager
    expect(warnBelow(2)).toBe(10);   // 150
    expect(warnBelow(5)).toBe(6);    // 60
    expect(warnBelow(10)).toBe(3);   // 30
    expect(warnBelow(20)).toBe(3);   // 15, so the floor applies
    expect(warnBelow(50)).toBe(3);   // 6
  });

  it('says nothing for a price with no defined pack', () => {
    // A 7 EUR game does not divide 300, so there is no pack size to be a
    // tenth of, and inventing one would warn about tickets that may not exist.
    expect(warnBelow(7)).toBeNull();
    expect(warnBelow(0)).toBeNull();
    expect(warnBelow(undefined)).toBeNull();
  });
});

describe('how much is left in the pack', () => {
  it('counts from where the shift has reached, not where it started', () => {
    expect(piecesRemaining({ price: 5, startNo: '29', endNo: '56' })).toBe(4);
  });

  it('falls back to the opening when nothing has been counted yet', () => {
    expect(piecesRemaining({ price: 5, startNo: '56', endNo: '' })).toBe(4);
  });

  it('never reports a negative, past the end of a pack', () => {
    expect(piecesRemaining({ price: 5, startNo: '0', endNo: '70' })).toBe(0);
  });

  it('is unknowable for a row nobody has touched', () => {
    expect(piecesRemaining({ price: 5, startNo: '', endNo: '' })).toBeNull();
  });
});

describe('the warning itself', () => {
  it('stays quiet while there is plenty left', () => {
    // 60 in a 5 EUR pack, counted to 20: forty still on the shelf.
    expect(packWarning({ price: 5, startNo: '20', endNo: '' })).toBeNull();
  });

  it('speaks up as the pack runs down', () => {
    const w = packWarning({ price: 5, startNo: '55', endNo: '' })!;
    expect(w.state).toBe('ending');
    expect(w.remaining).toBe(5);
    expect(packWarningText(w)).toBe('Τελειώνει — 5 δελτία');
  });

  it('gets the singular right', () => {
    expect(packWarningText(packWarning({ price: 5, startNo: '59', endNo: '' })!))
      .toBe('Τελειώνει — 1 δελτίο');
  });

  it('says a finished pack is finished, not that it is ending', () => {
    const w = packWarning({ price: 5, startNo: '60', endNo: '' })!;
    expect(w.state).toBe('finished');
    expect(packWarningText(w)).toBe('Τελείωσε — ανοίξτε νέο πακέτο');
  });

  it('warns AT the threshold, and stays quiet one above it', () => {
    // 5 EUR, 60 to a pack, flagged at six left.
    expect(packWarning({ price: 5, startNo: '53', endNo: '' })).toBeNull();           // 7 left
    expect(packWarning({ price: 5, startNo: '54', endNo: '' })?.remaining).toBe(6);   // at it
    expect(packWarning({ price: 5, startNo: '55', endNo: '' })?.state).toBe('ending');
  });

  it('holds its tongue where it cannot know', () => {
    expect(packWarning({ price: 7, startNo: '40', endNo: '' })).toBeNull();
    expect(packWarning({ price: 5, startNo: '', endNo: '' })).toBeNull();
  });

  it('gives an expensive game the same three tickets’ notice', () => {
    // A 20 EUR pack holds 15, so a tenth would be a single ticket.
    expect(packWarning({ price: 20, startNo: '12', endNo: '' })?.remaining).toBe(3);
    expect(packWarning({ price: 20, startNo: '11', endNo: '' })).toBeNull();
  });
});
