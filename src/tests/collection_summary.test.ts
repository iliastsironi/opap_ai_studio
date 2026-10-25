import { describe, expect, it } from 'vitest';
import {
  shouldShowCollection, collectionSummary, normalizeCollectionMode,
  DEFAULT_COLLECTION_MODE,
} from '../lib/collectionSummary.ts';

describe('when the summary appears', () => {
  it('on the day’s last shift, which is when somebody comes round', () => {
    expect(shouldShowCollection({ mode: 'LAST_SHIFT_ONLY', isLastOfDay: true })).toBe(true);
    expect(shouldShowCollection({ mode: 'LAST_SHIFT_ONLY', isLastOfDay: false })).toBe(false);
  });

  it('on every shift, where the shop collects at each handover', () => {
    expect(shouldShowCollection({ mode: 'EVERY_SHIFT', isLastOfDay: false })).toBe(true);
  });

  it('defaults to the last shift when the store has never chosen', () => {
    // Which matters before 0050 runs: the column is simply not there yet.
    expect(normalizeCollectionMode(undefined)).toBe(DEFAULT_COLLECTION_MODE);
    expect(normalizeCollectionMode('ΚΑΤΙ ΑΛΛΟ')).toBe('LAST_SHIFT_ONLY');
    expect(shouldShowCollection({ isLastOfDay: true })).toBe(true);
  });
});

describe('what there is to pick up', () => {
  // A day at one till: the morning left 300 in the safe and sent 30 in
  // coins; the evening has 1.295 in notes against a 1.000 float.
  const day = [
    {
      shift_id: 'm', shift_type: 'MORNING', opened_by_user_name: 'Περικλής',
      notes: 1150, coins: 95.2, floatNotes: 1000, safe_drop: 300, coin_handover: 30,
    },
    {
      shift_id: 'n', shift_type: 'NIGHT', opened_by_user_name: 'Γιώργος',
      notes: 1295, coins: 59.1, floatNotes: 1000, safe_drop: 0, coin_handover: 0,
    },
  ];

  it('adds the day’s envelopes', () => {
    expect(collectionSummary(day).envelopes).toBe(445); // 150 + 295
  });

  it('adds the safe drops, which are already in the safe', () => {
    expect(collectionSummary(day).safeDrops).toBe(300);
  });

  it('adds the cups of coins, which travel beside the envelopes', () => {
    expect(collectionSummary(day).coins).toBe(30);
  });

  it('totals what somebody physically picks up', () => {
    expect(collectionSummary(day).total).toBe(775);
  });

  it('names each shift, so a figure can be traced to whoever counted it', () => {
    const lines = collectionSummary(day).lines;
    expect(lines.map((l) => l.label)).toEqual([
      'Πρωινή — Περικλής', 'Βραδινή — Γιώργος',
    ]);
    expect(lines[0].total).toBe(480); // 150 + 300 + 30
  });

  it('uses the same envelope rule the operator was shown', () => {
    // Notes above the float, with the coins staying in the drawer - not the
    // whole counted total. Two calculations of one sum is how they come to
    // disagree.
    expect(collectionSummary([day[1]]).envelopes).toBe(295);
  });

  it('copes with a day that has nothing', () => {
    expect(collectionSummary([]).total).toBe(0);
    expect(collectionSummary(null).lines).toEqual([]);
  });

  it('never counts a negative drawer as money to collect', () => {
    const short = [{ shift_id: 's', notes: 900, coins: 10, floatNotes: 1000 }];
    expect(collectionSummary(short).total).toBe(0);
  });
});
