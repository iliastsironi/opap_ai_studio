import { describe, expect, it } from 'vitest';
import { isAdvancingField } from '../lib/enterAdvancesFocus.ts';

// The decision of which controls Enter should move on from. The focus walk
// itself needs a real document and is verified in the browser; this is the
// table most likely to drift - someone adding 'checkbox' here would break
// toggling with the keyboard everywhere at once.
const field = (over: Record<string, unknown> = {}) =>
  ({ tagName: 'INPUT', type: 'text', disabled: false, readOnly: false, ...over }) as unknown as Element;

describe('which fields Enter moves on from', () => {
  it('advances from the boxes a till is counted in', () => {
    for (const type of ['text', 'number', 'email', 'tel', 'search', 'password', 'date']) {
      expect(isAdvancingField(field({ type })), type).toBe(true);
    }
  });

  it('leaves a textarea alone, so Enter still makes a new line', () => {
    expect(isAdvancingField(field({ tagName: 'TEXTAREA' }))).toBe(false);
  });

  it('leaves checkboxes, radios and buttons alone', () => {
    // Enter on a checkbox submits the form; Space toggles it. Taking Enter
    // away would be a different control, not a faster one.
    for (const type of ['checkbox', 'radio', 'submit', 'button', 'file', 'range']) {
      expect(isAdvancingField(field({ type })), type).toBe(false);
    }
  });

  it('leaves a select alone, where Enter confirms the open list', () => {
    expect(isAdvancingField(field({ tagName: 'SELECT' }))).toBe(false);
  });

  it('skips a field nobody can type in anyway', () => {
    expect(isAdvancingField(field({ disabled: true }))).toBe(false);
    expect(isAdvancingField(field({ readOnly: true }))).toBe(false);
  });

  it('treats an input with no type as text, which is what the browser does', () => {
    expect(isAdvancingField(field({ type: '' }))).toBe(true);
  });

  it('survives being handed nothing', () => {
    expect(isAdvancingField(null)).toBe(false);
    expect(isAdvancingField(undefined)).toBe(false);
  });
});
