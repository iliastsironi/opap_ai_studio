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

  it('does not let a 5 € game adopt the 2 € game of the same name', () => {
    // «7ΑΡΙ», «ΓΑΤΑ» and «24 ΜΗΝΕΣ» each exist at 2 €, 5 € and 10 €. Matching
    // on name alone gave the 5 € row the 2 € row's ticket numbers - which is
    // how a 5 € row came to carry a back total of 149 and then warn that 149
    // is impossible for a 5 € pack, which holds 60.
    const catalog = [
      game({ id: 'scr_2_7ari', name: '7ΑΡΙ', category: 'Σκρατς 2€', price: 2 }),
      game({ id: 'scr_5_7ari', name: '7ΑΡΙ', category: 'Σκρατς 5€', price: 5 }),
    ];
    const saved = [
      game({ id: 'scr_2_7ari', name: '7ΑΡΙ', category: 'Σκρατς 2€', price: 2, startNo: '000', endNo: '020', backEndNo: '149' }),
    ];

    const merged = mergeScratchCatalogWithSaved(catalog, saved);
    expect(merged).toHaveLength(2);
    expect(merged[0].endNo).toBe('020');
    expect(merged[0].backEndNo).toBe('149');
    // The 5 € row is untouched by the 2 € row's count.
    expect(merged[1].endNo).toBe('');
    expect(merged[1].backEndNo).toBeFalsy();
  });

  it('still matches a row saved without an id, by name and category together', () => {
    const merged = mergeScratchCatalogWithSaved(
      [game({ id: 'scr_5_gata', name: 'ΓΑΤΑ', category: 'Σκρατς 5€', price: 5 })],
      [game({ id: '', name: 'ΓΑΤΑ', category: 'Σκρατς 5€', price: 5, endNo: '33' })]
    );
    expect(merged[0].endNo).toBe('33');
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
