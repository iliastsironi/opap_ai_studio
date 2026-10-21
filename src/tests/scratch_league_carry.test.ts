import { describe, expect, it } from 'vitest';
import {
  carryOverScratchInventory,
  continueDayScratchInventory,
  DEFAULT_SCRATCH_PRESETS,
} from '../components/shifts/ScratchCalculatorTable.tsx';

// Taken from the live GameHall shifts: a game the Owner added to the
// catalogue themselves, counted on 4-5/9.
const league = (over: Record<string, unknown>) => ({
  id: 'scr_custom_mvhy9okv',
  name: 'Σκρατς League',
  category: 'Σκρατς 5€',
  price: 5,
  startNo: '',
  endNo: '',
  ...over,
});

const find = (rows: any[]) => rows.filter((r) => r.id === 'scr_custom_mvhy9okv' || r.name === 'Σκρατς League');

describe('a game added to the catalogue, overnight', () => {
  it('opens the morning where the night left it', () => {
    const night = [league({ startNo: '5', endNo: '22' })];
    const rows = carryOverScratchInventory(night as any, DEFAULT_SCRATCH_PRESETS);
    const got = find(rows);
    expect(got).toHaveLength(1);
    expect(got[0].startNo).toBe('22');
  });

  it('does the same when the browser’s catalogue knows the game', () => {
    const catalog = [...DEFAULT_SCRATCH_PRESETS, league({})] as any[];
    const night = [league({ startNo: '5', endNo: '22' })];
    const rows = carryOverScratchInventory(night as any, catalog);
    const got = find(rows);
    expect(got).toHaveLength(1);
    expect(got[0].startNo).toBe('22');
  });

  it('keeps the day’s opening for the day’s second shift', () => {
    const morning = [league({ startNo: '5', endNo: '18' })];
    const rows = continueDayScratchInventory(morning as any, DEFAULT_SCRATCH_PRESETS);
    const got = find(rows);
    expect(got).toHaveLength(1);
    expect(got[0].startNo).toBe('5');
  });
});

describe('a game registered in the catalogue reaches the till', () => {
  // What the shop computer's own browser knows: nothing about the new game.
  const night = [
    { id: 'scr_5_gata', name: 'ΓΑΤΑ', category: 'Σκρατς 5€', price: 5, startNo: '10', endNo: '30' },
  ];

  it('shows up even though the previous shift never counted it', () => {
    const stored = [...DEFAULT_SCRATCH_PRESETS, league({})] as any[];
    const rows = carryOverScratchInventory(night as any, stored);
    expect(find(rows)).toHaveLength(1);
  });

  it('is missing when the till falls back to its own browser', () => {
    // The behaviour being fixed: the presets are all localStorage had.
    const rows = carryOverScratchInventory(night as any, DEFAULT_SCRATCH_PRESETS);
    expect(find(rows)).toHaveLength(0);
  });

  it('does not lose what the night did count', () => {
    const stored = [...DEFAULT_SCRATCH_PRESETS, league({})] as any[];
    const rows = carryOverScratchInventory(night as any, stored);
    expect(rows.find((r) => r.id === 'scr_5_gata')?.startNo).toBe('30');
  });
});
