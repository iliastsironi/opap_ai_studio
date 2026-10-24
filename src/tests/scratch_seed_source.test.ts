import { describe, expect, it } from 'vitest';
import { seedRowsFor, isDayFirstShift } from '../lib/scratchSeedSource.ts';

// The real 8/9 at GameHall: the day opened «Σκρατς League» at 29 and the
// morning sold one, to 30.
const dayOpeningRows = [{ id: 'league', startNo: '29', endNo: '30' }];
const morningDeclared = [{ id: 'league', startNo: '29', endNo: '30' }];
const MORNING = '2026-09-08T13:00:00Z';
const NIGHT = '2026-09-08T20:44:00Z';

const posOf = (rows: any[]) => rows[0]?.endNo;

describe('the evening of a day that already started', () => {
  const source = {
    dayOpeningRows, dayFirstOpenedAt: MORNING,
    previousRows: morningDeclared, openedAt: NIGHT,
  };

  it('is not the day’s first shift', () => {
    expect(isDayFirstShift(source)).toBe(false);
  });

  it('continues from the day’s opening, not the morning’s close', () => {
    // 29, not 30. Within a day the figures are day-to-date, so seeding from
    // the morning would report four tickets where the day sold five.
    expect(posOf(seedRowsFor(source))).toBe('29');
  });
});

describe('the shift that opened the day', () => {
  const source = {
    dayOpeningRows, dayFirstOpenedAt: MORNING,
    previousRows: [{ id: 'league', startNo: '24', endNo: '29' }],
    openedAt: MORNING,
  };

  it('is recognised as the day’s first', () => {
    expect(isDayFirstShift(source)).toBe(true);
  });

  it('takes the overnight handover - where the night left the pack', () => {
    expect(posOf(seedRowsFor(source))).toBe('29');
  });
});

describe('when there is nothing to continue', () => {
  it('falls back to the previous shift rather than leaving it blank', () => {
    expect(posOf(seedRowsFor({
      dayOpeningRows: [], dayFirstOpenedAt: MORNING,
      previousRows: [{ id: 'league', startNo: '24', endNo: '29' }], openedAt: NIGHT,
    }))).toBe('29');
  });

  it('treats a missing day opening as «this is the day’s first»', () => {
    expect(isDayFirstShift({ openedAt: NIGHT })).toBe(true);
  });

  it('gives nothing when there is nothing anywhere', () => {
    expect(seedRowsFor({ openedAt: NIGHT })).toEqual([]);
  });
});

describe('every game, the same way', () => {
  it('does not single out the game somebody added', () => {
    const rows = [
      { id: 'scr_5_gata', startNo: '27', endNo: '29' },
      { id: 'league', startNo: '29', endNo: '30' },
    ];
    const seeded = seedRowsFor({
      dayOpeningRows: rows, dayFirstOpenedAt: MORNING,
      previousRows: rows, openedAt: NIGHT,
    });
    expect(seeded.map((r) => r.endNo)).toEqual(['27', '29']);
  });
});
