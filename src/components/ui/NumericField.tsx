import React, { useEffect, useRef, useState } from 'react';
import {
  clampNumber,
  formatLooseNumber,
  isPartialNumber,
  parseLooseNumber,
} from '../../lib/looseNumber.ts';
import { focusAction } from '../../lib/zeroOnFocus.ts';

/**
 * A number field that lets you finish typing the number.
 *
 * `<input type="number">` bound to `Number(e.target.value) || 0` cannot: the
 * browser reports «5,» as an empty string, the parse gives 0, and the field
 * clears itself the moment somebody reaches for the decimals. On a Greek
 * keyboard the decimal separator is a comma, so that is the first key pressed
 * after the whole euros - the field wiped itself on nearly every entry.
 *
 * This keeps the text as typed and reports the number it currently means,
 * committing nothing while the entry is unfinished. It is `type="text"` with
 * `inputMode="decimal"` so a phone still offers a numeric keypad and a comma
 * is a legal character rather than an invalid one.
 */
export const NumericField: React.FC<{
  value: number;
  onChange: (next: number) => void;
  onBlur?: () => void;
  /** Passed through to the input, so a form still refuses to submit empty. */
  required?: boolean;
  id?: string;
  min?: number;
  max?: number;
  /** 0 for whole numbers, 2 for money. Only affects how a value is shown. */
  decimals?: number;
  disabled?: boolean;
  placeholder?: string;
  /**
   * Show nothing instead of «0» when the value is zero, so the placeholder
   * reads through. For a field that starts empty - a charge nobody has typed
   * yet - where a solid 0 looks like somebody entered one.
   */
  blankWhenZero?: boolean;
  className?: string;
  title?: string;
  'aria-label'?: string;
}> = ({
  value,
  onChange,
  onBlur,
  required,
  id,
  min,
  max,
  decimals = 2,
  disabled,
  placeholder,
  blankWhenZero,
  className,
  title,
  'aria-label': ariaLabel,
}) => {
  const shown = (n: number): string =>
    blankWhenZero && n === 0 ? '' : formatLooseNumber(n, decimals);

  const [text, setText] = useState(() => shown(value));
  const focused = useRef(false);

  // Follow the value from outside, but never while somebody is typing into
  // it - that is what would reformat «5,» back to «5» mid-keystroke.
  useEffect(() => {
    if (!focused.current) setText(shown(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, blankWhenZero]);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      className={className}
      title={title}
      aria-label={ariaLabel}
      onFocus={(e) => {
        focused.current = true;
        // A zero carries no information, so it is cleared outright rather
        // than left to be deleted; anything else is selected, so one
        // keystroke still replaces it. Same rule as MoneyField.
        if (focusAction(e.target.value) === 'clear') setText('');
        else e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        // Settle on the committed value, so a field left as «5,» reads «5».
        setText(shown(value));
        onBlur?.();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Refuse keystrokes that could never be part of a number, rather than
        // accepting them and silently parsing to something else.
        if (!isPartialNumber(raw)) return;
        setText(raw);

        const parsed = parseLooseNumber(raw);
        // Null means the entry is unfinished - «», «-», «,». Nothing is
        // committed, so the previous value stands until there is a new one.
        if (parsed !== null) onChange(clampNumber(parsed, min, max));
      }}
    />
  );
};
