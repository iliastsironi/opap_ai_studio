import { describe, expect, it } from 'vitest';
import { previousWasCounted, resolveOpeningFloat } from '../lib/openingFloat.ts';

const configured = { notes: 150, coins: 50 };

describe('what the drawer starts with', () => {
  it('uses the configured float when the previous shift counted nothing', () => {
    // The bug this is here for: a shift opened and never used closes on zero,
    // and carrying that zero over put «Κέρματα 0,00» in front of an operator
    // at a store configured for 50.
    const empty = { countedCash: 0, openingCash: 0, notes: 0, coins: 0 };
    expect(resolveOpeningFloat(true, empty, configured)).toEqual({
      notes: 150, coins: 50, carriedOver: false,
    });
    expect(resolveOpeningFloat(false, empty, configured)).toEqual({
      notes: 150, coins: 50, carriedOver: false,
    });
  });

  it('uses the configured float when there is no previous shift at all', () => {
    expect(resolveOpeningFloat(true, null, configured)).toEqual({
      notes: 150, coins: 50, carriedOver: false,
    });
  });

  it('resets the notes each morning but carries the coins', () => {
    // The night's notes go to the safe; the ψιλά stay in the drawer.
    const lastNight = { countedCash: 812.37, notes: 800, coins: 12.37 };
    expect(resolveOpeningFloat(true, lastNight, configured)).toEqual({
      notes: 150, coins: 12.37, carriedOver: false,
    });
  });

  it('falls back to the configured coins when the night counted none', () => {
    // The live data has exactly this: the latest close at 101499 recorded
    // denominations holding notes and no coin keys, so its counted coins are
    // genuinely zero. Carrying that zero meant the configured float never
    // applied at the one store with history - and somebody still has to put
    // ψιλά in the drawer, which is what a float is for.
    const noCoins = { countedCash: 11522.11, notes: 11522.11, coins: 0 };
    expect(resolveOpeningFloat(true, noCoins, configured)).toEqual({
      notes: 150, coins: 50, carriedOver: false,
    });
  });

  it('starts the morning on the float when the store does not carry coins', () => {
    // A shop that empties the drawer overnight and prepares a float: last
    // night's coins are in the safe, so carrying them would measure the till
    // against money that is not in it.
    const lastNight = { countedCash: 812.37, notes: 800, coins: 12.37 };
    expect(
      resolveOpeningFloat(true, lastNight, { ...configured, morningCoinsCarryOver: false })
    ).toEqual({ notes: 150, coins: 50, carriedOver: false });
  });

  it('carries the coins when the store does, which is the default', () => {
    const lastNight = { countedCash: 812.37, notes: 800, coins: 12.37 };
    expect(resolveOpeningFloat(true, lastNight, { ...configured, morningCoinsCarryOver: true }))
      .toEqual({ notes: 150, coins: 12.37, carriedOver: false });
    // Undefined behaves as the carrying it replaced.
    expect(resolveOpeningFloat(true, lastNight, configured).coins).toBe(12.37);
  });

  it('leaves afternoon and evening alone whichever way the setting goes', () => {
    // The setting is about the morning. Later shifts carry everything,
    // because the drawer has not been emptied between them.
    const earlier = { countedCash: 500, notes: 480, coins: 20 };
    for (const carry of [true, false]) {
      expect(resolveOpeningFloat(false, earlier, { ...configured, morningCoinsCarryOver: carry }))
        .toEqual({ notes: 480, coins: 20, carriedOver: true });
    }
  });

  it('carries everything into an afternoon or evening shift', () => {
    const earlier = { countedCash: 812.37, notes: 800, coins: 12.37 };
    expect(resolveOpeningFloat(false, earlier, configured)).toEqual({
      notes: 800, coins: 12.37, carriedOver: true,
    });
  });

  it('counts a shift that only ever had an opening float as counted', () => {
    // It was handed a drawer even if it never recorded a close, so there is
    // something real to carry rather than a default to fall back on.
    expect(previousWasCounted({ countedCash: 0, openingCash: 200 })).toBe(true);
    expect(previousWasCounted({ countedCash: 0, openingCash: 0 })).toBe(false);
    expect(previousWasCounted(null)).toBe(false);
  });

  it('never reports a carried-over float it did not carry', () => {
    // carriedOver is what locks the fields and lights the AUTO badge, so it
    // must only be true when the figures really came from a previous count.
    expect(resolveOpeningFloat(true, null, configured).carriedOver).toBe(false);
    expect(resolveOpeningFloat(false, { countedCash: 0 }, configured).carriedOver).toBe(false);
  });
});
