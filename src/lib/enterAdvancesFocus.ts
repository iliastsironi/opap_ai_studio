/**
 * Enter moves to the next field, everywhere.
 *
 * Counting a till is a long run of numbers typed one after another, and
 * reaching for the mouse or the Tab key between each one is the slow part. The
 * agency asked for Enter to behave the way it does in a spreadsheet.
 *
 * One listener on the document rather than a handler on several hundred
 * inputs: the behaviour is the same everywhere, including on screens written
 * later, and no input has to opt in.
 */

/** Types where Enter means «next field» rather than «newline» or «submit». */
const ADVANCING_TYPES = new Set([
  'text', 'number', 'email', 'tel', 'url', 'search', 'password',
  'date', 'datetime-local', 'month', 'time', 'week',
]);

export function isAdvancingField(el: Element | null | undefined): boolean {
  if (!el || el.tagName !== 'INPUT') return false;
  const input = el as HTMLInputElement;
  if (input.disabled || input.readOnly) return false;
  // A checkbox or a radio is toggled with Space and submitted with Enter;
  // a file picker and the buttons are not text entry at all.
  return ADVANCING_TYPES.has((input.type || 'text').toLowerCase());
}

function isReachable(el: HTMLElement): boolean {
  const field = el as HTMLInputElement;
  if (field.disabled || field.readOnly) return false;
  if (el.tabIndex === -1) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  // offsetParent is null for display:none and for anything inside it. Cheap,
  // and enough to skip a collapsed section's inputs.
  return el.offsetParent !== null;
}

/**
 * The field Enter should land on, or null when there is none.
 *
 * Scoped to the form when there is one, so Enter in the last box of a dialog
 * does not jump to whatever sits behind it.
 */
export function nextFieldAfter(current: HTMLElement): HTMLElement | null {
  const scope: ParentNode =
    (current as HTMLInputElement).form ?? current.ownerDocument;
  const fields = Array.from(
    scope.querySelectorAll<HTMLElement>('input, select, textarea')
  ).filter(isReachable);

  const index = fields.indexOf(current);
  if (index === -1 || index === fields.length - 1) return null;
  return fields[index + 1];
}

/**
 * Returns a teardown. Call once, from the app root.
 */
export function installEnterAdvancesFocus(doc: Document = document): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    // An open autocomplete list uses Enter to choose an item.
    if (event.isComposing) return;

    const target = event.target as HTMLElement | null;
    if (!isAdvancingField(target)) return;

    const next = nextFieldAfter(target!);
    // No next field means this is the last one, and Enter keeps its usual
    // meaning: submit. That is what makes a two-box sign-in form still work -
    // Enter in the email goes to the password, Enter in the password signs in.
    if (!next) return;

    event.preventDefault();
    next.focus();
    // Select rather than place a caret, so the next number overwrites the
    // figure already sitting there instead of being appended to it.
    const field = next as HTMLInputElement;
    if (typeof field.select === 'function' && isAdvancingField(next)) {
      field.select();
    }
  };

  doc.addEventListener('keydown', onKeyDown);
  return () => doc.removeEventListener('keydown', onKeyDown);
}
