import { describe, expect, it } from 'vitest';
import { ENTER_ADVANCE_OPT_OUT, installEnterAdvancesFocus, isAdvancingField } from '../lib/enterAdvancesFocus.ts';

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

// The real handler, run against a minimal stand-in for the document (the
// project has no DOM environment). Enough surface for what it touches:
// closest(), form, ownerDocument.querySelectorAll, focus(), select().
describe('a field can ask to keep Enter for itself', () => {
  type Fake = Record<string, any>;

  function buildDocument(scanOptsOut: boolean) {
    const focused: string[] = [];
    const listeners: Array<(e: any) => void> = [];
    const fields: Fake[] = [];
    const doc: Fake = {
      addEventListener: (_: string, fn: (e: any) => void) => listeners.push(fn),
      removeEventListener: () => {},
      querySelectorAll: () => fields,
    };
    const make = (id: string, optOut: boolean): Fake => {
      const el: Fake = {
        id, tagName: 'INPUT', type: 'text', disabled: false, readOnly: false, tabIndex: 0,
        offsetParent: {}, form: null, ownerDocument: doc,
        getAttribute: () => null,
        // closest() answers for the opt-out selector only, like the real one would
        closest: (sel: string) => (optOut && sel === ENTER_ADVANCE_OPT_OUT ? el : null),
        focus: () => focused.push(id),
        select: () => {},
      };
      return el;
    };
    const scan = make('scan', scanOptsOut);
    const search = make('search', false);
    fields.push(scan, search);
    installEnterAdvancesFocus(doc as unknown as Document);
    const press = (target: Fake) => {
      const event = { key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
        isComposing: false, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      listeners.forEach((fn) => fn(event));
      return event;
    };
    return { scan, search, press, focused };
  }

  it('Enter in an ordinary field still moves on - the app-wide behaviour is unchanged', () => {
    const { scan, press, focused } = buildDocument(false);
    const event = press(scan);
    expect(focused).toEqual(['search']);
    expect(event.defaultPrevented).toBe(true);
  });

  /**
   * The scanner sends Enter after every barcode. Without this the focus left
   * for the list's search box after the FIRST pack, and the second pack was
   * typed into the search instead of being scanned.
   */
  it('Enter in a field that opted out keeps the focus and is left alone', () => {
    const { scan, press, focused } = buildDocument(true);
    const event = press(scan);
    expect(focused).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('the opt-out is one named attribute, so it can be searched for', () => {
    expect(ENTER_ADVANCE_OPT_OUT).toBe('[data-enter-advance="off"]');
  });
});
