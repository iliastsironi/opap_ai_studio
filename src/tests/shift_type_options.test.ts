import { describe, expect, it } from 'vitest';
import { shiftTypeOptions, resolveShiftType, nextShiftType } from '../lib/shiftTypeOptions.ts';

describe('which shifts a store offers', () => {
  it('drops the afternoon on a two-shift store', () => {
    expect(shiftTypeOptions(2).map((o) => o.value)).toEqual(['MORNING', 'NIGHT', 'CUSTOM']);
  });

  it('offers all three on a three-shift store', () => {
    expect(shiftTypeOptions(3).map((o) => o.value))
      .toEqual(['MORNING', 'AFTERNOON', 'NIGHT', 'CUSTOM']);
  });

  it('keeps the extra shift everywhere', () => {
    // Not one of the day's regular shifts - the escape hatch for one that was
    // not planned. A shop with no label for it would pick a wrong one.
    for (const n of [2, 3]) {
      expect(shiftTypeOptions(n).some((o) => o.value === 'CUSTOM')).toBe(true);
    }
  });

  it('behaves as three when the store has no template yet', () => {
    for (const n of [null, undefined, 0, NaN]) {
      expect(shiftTypeOptions(n as any)).toHaveLength(4);
    }
  });
});

describe('keeping the selection valid', () => {
  it('leaves a selection the store still offers', () => {
    expect(resolveShiftType('NIGHT', 2)).toBe('NIGHT');
    expect(resolveShiftType('AFTERNOON', 3)).toBe('AFTERNOON');
  });

  it('falls back when the chosen shift is no longer offered', () => {
    // Switching stores with «Απογευματινή» selected would otherwise write a
    // shift type the store does not run, behind a blank select.
    expect(resolveShiftType('AFTERNOON', 2)).toBe('MORNING');
  });

  it('keeps the extra shift on a two-shift store', () => {
    expect(resolveShiftType('CUSTOM', 2)).toBe('CUSTOM');
  });
});

describe('which shift the day is on', () => {
  it('starts the day on the morning', () => {
    for (const empty of [[], null, undefined]) {
      expect(nextShiftType(empty as any, 3)).toBe('MORNING');
      expect(nextShiftType(empty as any, 2)).toBe('MORNING');
    }
  });

  it('follows the morning with the evening', () => {
    // Το παράπονο: κανείς δεν άλλαζε το «Πρωινή» στην παράδοση, οπότε η μέρα
    // έγραφε δύο πρωινές.
    expect(nextShiftType(['MORNING'], 2)).toBe('NIGHT');
    expect(nextShiftType(['MORNING'], 3)).toBe('NIGHT');
  });

  it('never suggests the afternoon, even where the store offers one', () => {
    // Τα τρία καταστήματα είναι ρυθμισμένα σε τρεις βάρδιες και δεν έχουν
    // δουλέψει ποτέ απογευματινή: 55 βάρδιες, μηδέν απογευματινές. Μια
    // πρόταση χτισμένη στο shifts_per_day θα ήταν προεπιλογή που κανείς δεν
    // προσέχει - ακριβώς το λάθος που διορθώνεται εδώ.
    for (const today of [[], ['MORNING'], ['MORNING', 'AFTERNOON'], ['CUSTOM']]) {
      expect(nextShiftType(today, 3)).not.toBe('AFTERNOON');
    }
  });

  it('still reaches the evening after a hand-picked afternoon', () => {
    expect(nextShiftType(['MORNING', 'AFTERNOON'], 3)).toBe('NIGHT');
  });

  it('calls a shift after the evening an extra one', () => {
    expect(nextShiftType(['MORNING', 'NIGHT'], 2)).toBe('CUSTOM');
    expect(nextShiftType(['MORNING', 'AFTERNOON', 'NIGHT'], 3)).toBe('CUSTOM');
  });

  it('does not let an extra shift start the day', () => {
    // Μια έκτακτη στις 08:00 δεν σημαίνει ότι η μέρα έκανε το πρωινό της.
    expect(nextShiftType(['CUSTOM'], 3)).toBe('MORNING');
    expect(nextShiftType(['CUSTOM', 'MORNING'], 3)).toBe('NIGHT');
  });

  it('reads the types the database actually stores', () => {
    // Έρχονται από το shift_day_opening, όχι από τη φόρμα.
    expect(nextShiftType([' morning ', null, undefined as any], 2)).toBe('NIGHT');
  });

  it('never suggests a shift the store does not offer', () => {
    for (const perDay of [2, 3]) {
      for (const today of [[], ['MORNING'], ['MORNING', 'NIGHT'], ['CUSTOM']]) {
        const suggested = nextShiftType(today, perDay);
        expect(shiftTypeOptions(perDay).some((o) => o.value === suggested)).toBe(true);
      }
    }
  });
});
