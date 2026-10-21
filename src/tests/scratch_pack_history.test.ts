import { describe, expect, it } from 'vitest';
import {
  openPack, undoLastPack, canUndoPack, lastPackOpened,
} from '../lib/scratchPackHistory.ts';

// A 2 € game found at position 6, sold through, and replaced.
const row = () => ({
  id: 'scr_a', price: 2,
  startNo: '6', endNo: '20', backStartNo: '', backEndNo: '149',
  saleBundles: '', salePieces: '', packCode: '1111111', isNewPack: false,
  closedPackQty: 0, closedPackCodes: [] as string[],
}) as any;

describe('opening a pack', () => {
  it('banks the finished pack and restarts the numbering', () => {
    const after = openPack(row(), { code: '2222222', soldOut: 144, startNo: '0', backEndNo: '149' });
    expect(after.closedPackQty).toBe(144);
    expect(after.packCode).toBe('2222222');
    expect(after.startNo).toBe('0');
    expect(after.endNo).toBe('');
    expect(after.isNewPack).toBe(true);
  });

  it('keeps the finished pack’s code, so the chain survives', () => {
    const after = openPack(row(), { code: '2222222', soldOut: 144, startNo: '0' });
    expect(after.closedPackCodes).toEqual(['1111111']);
  });

  it('records nothing for a row that had no previous code', () => {
    const fresh = { ...row(), packCode: '' };
    expect(openPack(fresh, { code: '2222222', soldOut: 0, startNo: '0' }).closedPackCodes)
      .toEqual([]);
  });
});

describe('taking it back', () => {
  it('restores the row exactly as it stood', () => {
    const before = row();
    const after = openPack(before, { code: '2222222', soldOut: 144, startNo: '0', backEndNo: '149' });
    const undone = undoLastPack(after);

    expect(undone.startNo).toBe('6');
    expect(undone.endNo).toBe('20');
    expect(undone.packCode).toBe('1111111');
    expect(undone.closedPackQty).toBe(0);
    expect(undone.closedPackCodes).toEqual([]);
    expect(undone.isNewPack).toBe(false);
    expect(canUndoPack(undone)).toBe(false);
  });

  it('does not merely subtract the quantity', () => {
    // The new pack had already sold some before the mistake was noticed.
    // Subtracting 144 back out would leave the row at the NEW pack's
    // numbering, which is not where it was.
    const after = { ...openPack(row(), { code: '2222222', soldOut: 144, startNo: '0' }), endNo: '9' };
    const undone = undoLastPack(after);
    expect(undone.startNo).toBe('6');
    expect(undone.endNo).toBe('20');
  });

  it('undoes two wrong packs, one at a time', () => {
    const first = openPack(row(), { code: '2222222', soldOut: 144, startNo: '0' });
    const second = openPack(first, { code: '3333333', soldOut: 150, startNo: '0' });
    expect(second.closedPackQty).toBe(294);

    const once = undoLastPack(second);
    expect(once.closedPackQty).toBe(144);
    expect(once.packCode).toBe('2222222');
    expect(canUndoPack(once)).toBe(true);

    const twice = undoLastPack(once);
    expect(twice.closedPackQty).toBe(0);
    expect(twice.packCode).toBe('1111111');
    expect(canUndoPack(twice)).toBe(false);
  });

  it('says what it would take back, before it does', () => {
    const after = openPack(row(), { code: '2222222', soldOut: 144, startNo: '0' });
    expect(lastPackOpened(after)).toMatchObject({ code: '2222222', addedQty: 144 });
    expect(lastPackOpened(row())).toBeNull();
  });

  it('is a no-op on a row that never opened a pack', () => {
    const untouched = row();
    expect(undoLastPack(untouched)).toEqual(untouched);
    expect(canUndoPack(untouched)).toBe(false);
  });
});

import { mergeScratchCatalogWithSaved } from '../components/shifts/ScratchCalculatorTable.tsx';

describe('a pack opened survives a reload', () => {
  const catalog = [{ id: 'scr_a', name: 'ΓΑΤΑ', category: 'Σκρατς 2€', price: 2, startNo: '0', endNo: '' }] as any[];

  it('keeps the tickets banked from the finished pack', () => {
    const saved = openPack({ ...catalog[0], startNo: '6', endNo: '20', packCode: '1111111' } as any,
      { code: '2222222', soldOut: 144, startNo: '0' });
    const [row] = mergeScratchCatalogWithSaved(catalog as any, [saved] as any);

    expect(row.closedPackQty).toBe(144);
    expect(row.closedPackCodes).toEqual(['1111111']);
    expect(row.packCode).toBe('2222222');
  });

  it('can still be undone after the reload', () => {
    const saved = openPack({ ...catalog[0], startNo: '6', endNo: '20', packCode: '1111111' } as any,
      { code: '2222222', soldOut: 144, startNo: '0' });
    const [row] = mergeScratchCatalogWithSaved(catalog as any, [saved] as any);

    expect(canUndoPack(row as any)).toBe(true);
    const undone = undoLastPack(row as any);
    expect(undone.closedPackQty).toBe(0);
    expect(undone.startNo).toBe('6');
    expect(undone.packCode).toBe('1111111');
  });
});

import { carryOverScratchInventory } from '../components/shifts/ScratchCalculatorTable.tsx';

describe('overnight', () => {
  const catalog = [{ id: 'scr_a', name: 'ΓΑΤΑ', category: 'Σκρατς 2€', price: 2, startNo: '0', endNo: '' }] as any[];

  const lastNight = () => openPack(
    { ...catalog[0], startNo: '6', endNo: '20', packCode: '1111111' } as any,
    { code: '2222222', soldOut: 144, startNo: '0' }
  );

  it('does not let the morning undo last night’s pack', () => {
    const [row] = carryOverScratchInventory([lastNight()] as any, catalog as any);
    expect(canUndoPack(row as any)).toBe(false);
    expect(row.closedPackQty ?? 0).toBe(0);
  });

  it('keeps counting with the pack the till actually has open', () => {
    const [row] = carryOverScratchInventory([lastNight()] as any, catalog as any);
    expect(row.packCode).toBe('2222222');
  });
});
