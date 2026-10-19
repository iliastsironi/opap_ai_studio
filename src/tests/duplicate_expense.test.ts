import { describe, expect, it } from 'vitest';
import {
  normalizeRecipient, findDuplicateExpenses, duplicateGroups,
} from '../lib/duplicateExpense.ts';

describe('comparing supplier names', () => {
  it('ignores case, accents and stray space', () => {
    // Typing an accent or not is not a different supplier.
    const forms = ['Κοπάνης', 'ΚΟΠΑΝΗΣ', ' κοπανης ', 'Κοπανης'];
    const normalized = forms.map(normalizeRecipient);
    expect(new Set(normalized).size).toBe(1);
  });

  it('keeps genuinely different names apart', () => {
    expect(normalizeRecipient('Κοπάνης')).not.toBe(normalizeRecipient('Κοπάνου'));
  });
});

describe('the same supplier for the same amount, twice in a day', () => {
  const row = (id: string, description: string, amount: number, carried?: string) =>
    ({ id, description, amount, carried_from_shift_id: carried });

  it('flags a repeat inside one shift', () => {
    const found = duplicateGroups([
      row('1', 'Kopanis', 46.25),
      row('2', 'Kopanis', 46.25),
      row('3', 'Ποτά', 98),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].matches).toBe(2);
    expect(found[0].acrossShifts).toBe(false);
  });

  it('flags one against an earlier shift of the same day, and says so', () => {
    const found = duplicateGroups([
      row('1', 'Kopanis', 46.25, 'morning'),
      row('2', 'Kopanis', 46.25),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].acrossShifts).toBe(true);
  });

  it('matches however the name was typed', () => {
    expect(duplicateGroups([row('1', 'ΚΟΠΑΝΗΣ', 46.25), row('2', ' κοπάνης ', 46.25)]))
      .toHaveLength(1);
  });

  it('leaves a different amount alone', () => {
    // 46,25 and 46,26 are two purchases, and nagging over real ones is how a
    // warning gets ignored.
    expect(duplicateGroups([row('1', 'Kopanis', 46.25), row('2', 'Kopanis', 46.26)]))
      .toHaveLength(0);
  });

  it('leaves a different supplier alone', () => {
    expect(duplicateGroups([row('1', 'Kopanis', 46.25), row('2', 'Ποτά', 46.25)]))
      .toHaveLength(0);
  });

  it('never flags blank or zero rows', () => {
    // «Προσθήκη Εξόδου» creates one of those every time it is pressed; two of
    // them means somebody is still typing, not that they double-paid nothing.
    expect(duplicateGroups([row('1', '', 0), row('2', '', 0)])).toHaveLength(0);
    expect(duplicateGroups([row('1', 'Kopanis', 0), row('2', 'Kopanis', 0)])).toHaveLength(0);
    expect(duplicateGroups([row('1', '', 46.25), row('2', '', 46.25)])).toHaveLength(0);
  });

  it('counts three of the same as one finding, not three', () => {
    const found = duplicateGroups([
      row('1', 'Kopanis', 46.25), row('2', 'Kopanis', 46.25), row('3', 'Kopanis', 46.25),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].matches).toBe(3);
  });

  it('reports every row involved when asked for rows, not groups', () => {
    expect(findDuplicateExpenses([row('1', 'Kopanis', 46.25), row('2', 'Kopanis', 46.25)]))
      .toHaveLength(2);
  });

  it('survives amounts that arrived as strings', () => {
    expect(duplicateGroups([row('1', 'Kopanis', '46.25' as any), row('2', 'Kopanis', 46.25)]))
      .toHaveLength(1);
  });
});
