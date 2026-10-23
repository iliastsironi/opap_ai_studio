import { describe, expect, it } from 'vitest';
import { dayAlreadyOpened, previousWasCounted, resolveOpeningFloat } from '../lib/openingFloat.ts';

const configured = { notes: 150, coins: 50 };

describe("the day's first shift", () => {
  it('uses the configured float when the previous shift counted nothing', () => {
    // The bug this is here for: a shift opened and never used closes on zero,
    // and carrying that zero over put «Κέρματα 0,00» in front of an operator
    // at a store configured for 50.
    const empty = { countedCash: 0, openingCash: 0, notes: 0, coins: 0 };
    expect(resolveOpeningFloat(empty, configured)).toEqual({
      notes: 150, coins: 50, carriedOver: false, topUpsInherited: 0,
    });
  });

  it('uses the configured float when there is no previous shift at all', () => {
    expect(resolveOpeningFloat(null, configured)).toEqual({
      notes: 150, coins: 50, carriedOver: false, topUpsInherited: 0,
    });
  });

  it('resets the notes but carries the coins across the night', () => {
    // The night's notes left in the envelope; the ψιλά stay in the drawer.
    const lastNight = { countedCash: 812.37, notes: 800, coins: 12.37 };
    expect(resolveOpeningFloat(lastNight, configured)).toEqual({
      notes: 150, coins: 12.37, carriedOver: false, topUpsInherited: 0,
    });
  });

  it('falls back to the configured coins when the night counted none', () => {
    // The live data has exactly this: the latest close at 101499 recorded
    // denominations holding notes and no coin keys, so its counted coins are
    // genuinely zero. Carrying that zero meant the configured float never
    // applied at the one store with history - and somebody still has to put
    // ψιλά in the drawer, which is what a float is for.
    const noCoins = { countedCash: 11522.11, notes: 11522.11, coins: 0 };
    expect(resolveOpeningFloat(noCoins, configured)).toEqual({
      notes: 150, coins: 50, carriedOver: false, topUpsInherited: 0,
    });
  });

  it('starts on the float when the store does not carry coins overnight', () => {
    // A shop that empties the drawer overnight and prepares a float: last
    // night's coins are in the safe, so carrying them would measure the till
    // against money that is not in it.
    const lastNight = { countedCash: 812.37, notes: 800, coins: 12.37 };
    expect(
      resolveOpeningFloat(lastNight, { ...configured, morningCoinsCarryOver: false })
    ).toEqual({ notes: 150, coins: 50, carriedOver: false, topUpsInherited: 0 });
  });

  it('carries the coins when the store does, which is the default', () => {
    const lastNight = { countedCash: 812.37, notes: 800, coins: 12.37 };
    expect(resolveOpeningFloat(lastNight, { ...configured, morningCoinsCarryOver: true }))
      .toEqual({ notes: 150, coins: 12.37, carriedOver: false, topUpsInherited: 0 });
    // Undefined behaves as the carrying it replaced.
    expect(resolveOpeningFloat(lastNight, configured).coins).toBe(12.37);
  });

  it('starts a day that opens in the afternoon on the float, not on last night', () => {
    // A store whose first shift of the day is not the morning one is still
    // starting its day. The old rule keyed on «is this the morning» and gave
    // this shift the whole of last night's takings as its opening.
    const lastNight = { countedCash: 812.37, notes: 800, coins: 12.37 };
    expect(resolveOpeningFloat(lastNight, configured, null)).toEqual({
      notes: 150, coins: 12.37, carriedOver: false, topUpsInherited: 0,
    });
  });
});

describe('every later shift of the same day', () => {
  // This is the rule that changed. A later shift used to open on the previous
  // shift's COUNTED cash - the morning's takings - because the old comment
  // assumed the drawer «has not been emptied between them». It has: everything
  // above the float left in an envelope.
  const morningTook = { countedCash: 1842.5, notes: 1830, coins: 12.5 };
  const dayOpening = { notes: 1000, coins: 47.35 };

  it('opens on the day’s opening, not on what the previous shift counted', () => {
    expect(resolveOpeningFloat(morningTook, configured, dayOpening)).toEqual({
      notes: 1000, coins: 47.35, carriedOver: true, topUpsInherited: 0,
    });
  });

  it('gives the third shift of the day the same figures as the second', () => {
    const second = resolveOpeningFloat(morningTook, configured, dayOpening);
    const third = resolveOpeningFloat(
      { countedCash: 2401.8, notes: 2390, coins: 11.8 }, configured, dayOpening
    );
    expect(third).toEqual(second);
  });

  it('ignores the coins setting, which is only about the night', () => {
    for (const carry of [true, false]) {
      expect(
        resolveOpeningFloat(morningTook, { ...configured, morningCoinsCarryOver: carry }, dayOpening)
      ).toEqual({ notes: 1000, coins: 47.35, carriedOver: true, topUpsInherited: 0 });
    }
  });

  it('falls back to the configured coins when the day’s opening recorded none', () => {
    // A real row: a 101499 shift opened on 200 notes with a flat 0 for coins.
    // Continuing that literally hands 0,00 to every later shift of the day,
    // in front of a tray that does have ψιλά in it.
    expect(resolveOpeningFloat(morningTook, configured, { notes: 1000, coins: 0 })).toEqual({
      notes: 1000, coins: 50, carriedOver: true, topUpsInherited: 0,
    });
  });

  it('does not continue a day whose opening is empty', () => {
    // All-zero is not «the day started on nothing», it is no usable snapshot,
    // and continuing it would put 0,00 in front of the operator.
    expect(resolveOpeningFloat(morningTook, configured, { notes: 0, coins: 0 })).toEqual({
      notes: 150, coins: 12.5, carriedOver: false, topUpsInherited: 0,
    });
    expect(dayAlreadyOpened({ notes: 0, coins: 0 })).toBe(false);
    expect(dayAlreadyOpened(null)).toBe(false);
    expect(dayAlreadyOpened({ notes: 1000, coins: 0 })).toBe(true);
  });
});

describe('what counts as something to carry', () => {
  it('counts a shift that only ever had an opening float as counted', () => {
    // It was handed a drawer even if it never recorded a close, so there is
    // something real to carry rather than a default to fall back on.
    expect(previousWasCounted({ countedCash: 0, openingCash: 200 })).toBe(true);
    expect(previousWasCounted({ countedCash: 0, openingCash: 0 })).toBe(false);
    expect(previousWasCounted(null)).toBe(false);
  });

  it('reports carriedOver only for the day’s established opening', () => {
    // carriedOver is what locks the fields and lights the badge, so it must
    // never be true for a figure the operator is allowed to set.
    expect(resolveOpeningFloat(null, configured).carriedOver).toBe(false);
    expect(resolveOpeningFloat({ countedCash: 0 }, configured).carriedOver).toBe(false);
    expect(resolveOpeningFloat(null, configured, { notes: 1000, coins: 50 }).carriedOver).toBe(true);
  });
});

describe('coins carried across the night', () => {
  // The real figures from the live tenant: a close counting 86×1€, 32×2€,
  // 18×0,10, 36×0,20 and 29×0,50 - which is 173,50 in coins, not banknotes.
  // 1 € and 2 € are coins, and treating anything under 5 as a coin is what
  // makes that true.
  const lastNight = { countedCash: 4038.5, notes: 3865, coins: 173.5 };
  const configured = { notes: 1000, coins: 183.7 };

  it('starts the morning on the night’s counted coins, not the float', () => {
    expect(resolveOpeningFloat(lastNight, configured, null)).toEqual({
      notes: 1000, coins: 173.5, carriedOver: false, topUpsInherited: 0,
    });
  });
});

describe('a προσαύξηση made earlier the same day', () => {
  const configured = { notes: 1000, coins: 50 };

  it('is in the drawer, so the next shift opens on it', () => {
    // 1/9 at GameHall: the morning opened on 1000 + 183,70 and fetched 700
    // from the safe. The envelope takes only what is above the float, and a
    // top-up IS float, so the evening's drawer holds it.
    const float = resolveOpeningFloat(null, configured, {
      notes: 1000, coins: 183.7, topUpsToday: 700,
    });
    expect(float.notes).toBe(1700);
    expect(float.coins).toBe(183.7);
    expect(float.notes + float.coins).toBe(1883.7);
  });

  it('says how much of the float it is', () => {
    const float = resolveOpeningFloat(null, configured, {
      notes: 1000, coins: 183.7, topUpsToday: 700,
    });
    expect(float.topUpsInherited).toBe(700);
  });

  it('changes nothing on a day that had none', () => {
    const float = resolveOpeningFloat(null, configured, { notes: 1000, coins: 95.2 });
    expect(float.notes).toBe(1000);
    expect(float.topUpsInherited).toBe(0);
  });

  it('does not cross the night', () => {
    // Yesterday's top-ups left in yesterday's last envelope.
    const float = resolveOpeningFloat(
      { countedCash: 1800, coins: 47.35 }, configured, null
    );
    expect(float.notes).toBe(1000);
    expect(float.topUpsInherited).toBe(0);
  });

  it('ignores a negative, which is not a top-up', () => {
    const float = resolveOpeningFloat(null, configured, {
      notes: 1000, coins: 50, topUpsToday: -200,
    });
    expect(float.notes).toBe(1000);
    expect(float.topUpsInherited).toBe(0);
  });

  it('keeps the cents honest', () => {
    const float = resolveOpeningFloat(null, configured, {
      notes: 1000.1, coins: 50, topUpsToday: 0.2,
    });
    expect(float.notes).toBe(1000.3);
  });
});

describe('which box the προσαύξηση shows in', () => {
  const configured = { notes: 1000, coins: 50 };

  it('changes the total by the same amount either way', () => {
    // It may be notes or coins. Only the total is measured against the till,
    // so the split is presentation - see the note in openingFloat.ts.
    const float = resolveOpeningFloat(null, configured, {
      notes: 1000, coins: 95.2, topUpsToday: 700,
    });
    expect(float.notes + float.coins).toBe(1795.2);
  });

  it('leaves the coins line meaning ψιλά', () => {
    // Whatever is in that box is what a later overnight carry falls back to
    // when no denominations were counted, so it must not absorb a top-up.
    const float = resolveOpeningFloat(null, configured, {
      notes: 1000, coins: 95.2, topUpsToday: 700,
    });
    expect(float.coins).toBe(95.2);
  });
});
