import { describe, expect, it } from 'vitest';
import {
  mergeScratchCatalogWithSaved,
  isLotteryRow,
  type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

const game = (over: Partial<ScratchTicketRow> = {}): ScratchTicketRow => ({
  id: 'scr_2_gata', name: 'ΓΑΤΑ', category: 'Σκρατς 2€', price: 2, startNo: '', endNo: '',
  ...over,
});

// The catalogue now arrives from the database, a moment after the table has
// already rendered and possibly after someone has started typing into it. The
// merge is what makes that safe.
describe('merging the store catalogue into a shift being counted', () => {
  it('keeps what has been typed and takes the definitions from the catalogue', () => {
    const typed = [game({ startNo: '100', endNo: '80', price: 99, name: 'παλιό όνομα' })];
    const catalog = [game({ price: 2, name: 'ΓΑΤΑ' })];

    const merged = mergeScratchCatalogWithSaved(catalog, typed);
    expect(merged).toHaveLength(1);
    expect(merged[0].startNo).toBe('100');
    expect(merged[0].endNo).toBe('80');
    // Price and name are the Owner's to set, and come from the catalogue.
    expect(merged[0].price).toBe(2);
    expect(merged[0].name).toBe('ΓΑΤΑ');
  });

  it('keeps a bundle entry whole, because the trigger rejects half of one', () => {
    // 0008 refuses a row whose saleBundles/salePieces disagree with its endNo,
    // so these three have to survive together or not at all.
    const typed = [game({ id: 'scr_laiko', name: 'Λαϊκό', bundleSize: 5, startNo: '100', endNo: '87', saleBundles: '2', salePieces: '3' })];
    const catalog = [game({ id: 'scr_laiko', name: 'Λαϊκό', price: 2, bundleSize: 5 })];

    const merged = mergeScratchCatalogWithSaved(catalog, typed);
    expect(merged[0].saleBundles).toBe('2');
    expect(merged[0].salePieces).toBe('3');
    expect(merged[0].endNo).toBe('87');
    expect(merged[0].bundleSize).toBe(5);
  });

  it('adds a game the shift has not touched yet', () => {
    const merged = mergeScratchCatalogWithSaved(
      [game({ id: 'a', name: 'Α' }), game({ id: 'b', name: 'Β' })],
      [game({ id: 'a', name: 'Α', endNo: '40' })]
    );
    expect(merged.map((r) => r.id)).toEqual(['a', 'b']);
    expect(merged[0].endNo).toBe('40');
  });

  it('keeps a counted game the catalogue no longer lists', () => {
    // Removing it here would silently drop tickets somebody has sold.
    const merged = mergeScratchCatalogWithSaved(
      [game({ id: 'a', name: 'Α' })],
      [game({ id: 'a', name: 'Α' }), game({ id: 'retired', name: 'Παλιό', endNo: '12' })]
    );
    expect(merged.map((r) => r.id)).toEqual(['a', 'retired']);
    expect(merged.find((r) => r.id === 'retired')!.endNo).toBe('12');
  });

  it('returns the catalogue untouched when nothing has been counted', () => {
    const catalog = [game()];
    expect(mergeScratchCatalogWithSaved(catalog, [])).toBe(catalog);
    expect(mergeScratchCatalogWithSaved(catalog, undefined)).toBe(catalog);
  });

  it('takes the catalogue at its word about the product', () => {
    // isLotteryRow used to read «λαχεί» out of the category or the name, so a
    // scratch card called «Λαχείο της Τύχης» counted as a lottery. An explicit
    // kind from the catalogue settles it.
    expect(isLotteryRow(game({ name: 'Λαχείο της Τύχης', kind: 'SCRATCH' }))).toBe(false);
    expect(isLotteryRow(game({ name: 'ΓΑΤΑ', category: 'Σκρατς 2€', kind: 'LOTTERY' }))).toBe(true);
    // Without one, the old inference still applies.
    expect(isLotteryRow(game({ category: 'Λαχεία' }))).toBe(true);
    expect(isLotteryRow(game({ category: 'Σκρατς 2€' }))).toBe(false);
  });
});
