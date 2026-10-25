import React from 'react';
import { isPartialNumber } from '../../lib/looseNumber.ts';
import { focusAction } from '../../lib/zeroOnFocus.ts';

/**
 * A money field you can actually type into.
 *
 * It replaces `<input type="number">`, which fought the operator three ways:
 *
 *   the comma  a Greek keyboard's decimal separator. The browser reports
 *              «5,» as an empty string, so the field wiped itself the moment
 *              anybody reached for the decimals. NumericField solved this
 *              for the configurator; the closing screen never got it.
 *   the minus  typing «-» also reads back as an empty string, so a negative
 *              figure simply could not be entered - the keystroke vanished.
 *   the zero   a field sitting at «0» had to be deleted before anything
 *              could be typed, so every entry began with a backspace.
 *
 * Holding the text as typed fixes the first two. The third is `focusAction`:
 * a zero is cleared on focus, because an empty money field already reads as
 * nothing everywhere in this app, and anything else is selected so one
 * keystroke still replaces it without risking a figure clicked into by
 * mistake.
 *
 * The value stays a string, exactly as the screens already keep it, so every
 * safeNum() downstream is untouched.
 */
export const MoneyField: React.FC<{
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  /** Passed through to the input, so a form still refuses to submit empty. */
  required?: boolean;
  id?: string;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  title?: string;
  'aria-label'?: string;
  /**
   * Refuse a leading «-».
   *
   * Off by default, and deliberately not switched on wherever the old
   * `min="0"` sat: swallowing the keystroke is the field fighting the
   * operator, which is the whole complaint. A figure that may not be
   * negative is caught by the screen's own validation, which can say so.
   */
  nonNegative?: boolean;
}> = ({
  value,
  onChange,
  onBlur,
  required,
  id,
  disabled,
  readOnly,
  placeholder = '0.00',
  className,
  title,
  'aria-label': ariaLabel,
  nonNegative,
}) => (
  <input
    id={id}
    type="text"
    inputMode="decimal"
    value={value}
    disabled={disabled}
    readOnly={readOnly}
    placeholder={placeholder}
    className={className}
    title={title}
    aria-label={ariaLabel}
    required={required}
    onBlur={onBlur}
    onFocus={(e) => {
      if (readOnly || disabled) return;
      if (focusAction(e.target.value) === 'clear') onChange('');
      else e.target.select();
    }}
    onChange={(e) => {
      const raw = e.target.value;
      // Refuse what could never become a number, rather than accepting it
      // and parsing it into something else later.
      if (!isPartialNumber(raw)) return;
      if (nonNegative && raw.trim().startsWith('-')) return;
      onChange(raw);
    }}
  />
);
