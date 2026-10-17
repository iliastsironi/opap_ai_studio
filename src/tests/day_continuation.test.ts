import { describe, expect, it } from 'vitest';
import { continueDayScratchInventory, carryOverScratchInventory } from '../components/shifts/ScratchCalculatorTable.tsx';

// A minimal catalogue, passed explicitly so the test does not depend on
// whatever is in localStorage.
const catalog = [
  { id: 'scr_a', name: 'Σκρατς 2€', category: 'Σκρατς', price: 2 },
  { id: 'scr_laiko', name: 'Λαϊκό Λαχείο', category: 'Λαχεία', price: 2, bundleSize: 5 },
] as any[];

describe('scratch positions inside one day', () => {
  // The day opened on these; the morning then sold down to its own closing.
  const dayOpening = [
    { id: 'scr_a', name: 'Σκρατς 2€', category: 'Σκρατς', price: 2, startNo: '040', endNo: '075', backEndNo: '150', backStartNo: '120' },
    { id: 'scr_laiko', name: 'Λαϊκό Λαχείο', category: 'Λαχεία', price: 2, bundleSize: 5, startNo: '20', endNo: '12', backEndNo: '', backStartNo: '' },
  ] as any[];

  it('opens a later shift on the day’s opening, not on the morning’s close', () => {
    const rows = continueDayScratchInventory(dayOpening, catalog);
    const a = rows.find((r) => r.id === 'scr_a')!;
    // 040, where the DAY started - not 075, where the morning ended.
    expect(a.startNo).toBe('040');
    expect(a.backEndNo).toBe('150');
    // Nothing sold yet in this shift.
    expect(a.endNo).toBe('');
    expect(a.backStartNo).toBe('');
  });

  it('gives the third shift of the day the same opening as the second', () => {
    const second = continueDayScratchInventory(dayOpening, catalog);
    const third = continueDayScratchInventory(dayOpening, catalog);
    expect(third.map((r) => [r.id, r.startNo, r.backEndNo]))
      .toEqual(second.map((r) => [r.id, r.startNo, r.backEndNo]));
  });

  it('keeps the λαχείο starting figure the day began with', () => {
    const laiko = continueDayScratchInventory(dayOpening, catalog)
      .find((r) => r.id === 'scr_laiko')!;
    expect(laiko.startNo).toBe('20');
    expect(laiko.endNo).toBe('');
  });

  // The overnight rule is the opposite, and must stay that way: there a close
  // really does become the next opening.
  it('still turns last night’s close into this morning’s opening', () => {
    const lastNight = [
      { id: 'scr_a', name: 'Σκρατς 2€', category: 'Σκρατς', price: 2, startNo: '040', endNo: '075', backEndNo: '150', backStartNo: '120' },
    ] as any[];
    const morning = carryOverScratchInventory(lastNight, catalog).find((r) => r.id === 'scr_a')!;
    expect(morning.startNo).toBe('075');
    expect(morning.backEndNo).toBe('120');
  });

  it('falls back to a blank catalogue when the day has no scratch rows', () => {
    const rows = continueDayScratchInventory([], catalog);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.endNo === '')).toBe(true);
  });

  it('survives an undefined day snapshot', () => {
    expect(continueDayScratchInventory(undefined, catalog)).toHaveLength(2);
  });
});
