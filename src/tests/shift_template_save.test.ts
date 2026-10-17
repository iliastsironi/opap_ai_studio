import { describe, expect, it } from 'vitest';
import { unknownColumnFrom } from '../services/supabase.ts';

// PostgREST refuses the whole statement when the payload names something that
// is not a column, so one new field loses every setting on the screen. That
// happens on every deploy that lands before its migration - the normal order
// here, since code ships on push and SQL is run by hand. Reading the column
// name out of the message is what lets the save drop it and carry on.
describe('reading the offending column out of a PostgREST error', () => {
  it('finds it in the message Supabase actually returns', () => {
    expect(
      unknownColumnFrom(
        "Could not find the 'morning_coins_carry_over' column of 'shift_templates' in the schema cache"
      )
    ).toBe('morning_coins_carry_over');
  });

  it('returns null for an error that is about something else', () => {
    expect(unknownColumnFrom('duplicate key value violates unique constraint "x"')).toBeNull();
    expect(unknownColumnFrom('new row violates row-level security policy')).toBeNull();
  });

  it('survives an empty or absent message', () => {
    expect(unknownColumnFrom('')).toBeNull();
    expect(unknownColumnFrom(null)).toBeNull();
    expect(unknownColumnFrom(undefined)).toBeNull();
  });

  it('does not match a column name spanning quotes it did not open', () => {
    // The capture stops at the first closing quote, so a message mentioning
    // two quoted things cannot be read as one long column name.
    expect(
      unknownColumnFrom("Could not find the 'a' column of 'shift_templates' in the schema cache")
    ).toBe('a');
  });
});
