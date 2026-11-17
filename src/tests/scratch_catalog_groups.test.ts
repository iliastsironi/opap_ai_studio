/**
 * Ο κατάλογος σκρατς σε ομάδες ανά τιμή: τα 1 € μαζί, τα 2 € μαζί· ένα νέο σκρατς
 * των 5 € μπαίνει στο τέλος της ομάδας των 5 €, και η κατηγορία βγαίνει από την τιμή.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SCRATCH_PRESETS, type ScratchTicketRow } from '../components/shifts/ScratchCalculatorTable.tsx';
import {
  addToGroup,
  categoryFor,
  groupKey,
  groupRows,
  insertionIndex,
  isGrouped,
  isWellPlaced,
  moveToGroupEnd,
  offeredPrices,
  priceLabel,
  runsOf,
} from '../lib/scratchCatalogOrder.ts';

const scratch = (id: string, price: number, extra: Partial<ScratchTicketRow> = {}): ScratchTicketRow => ({
  id,
  name: id,
  category: `Σκρατς ${price}€`,
  kind: 'SCRATCH',
  price,
  startNo: '',
  endNo: '',
  ...extra,
});
const lottery = (id: string, price = 2): ScratchTicketRow => ({
  id,
  name: id,
  category: 'Λαχεία',
  kind: 'LOTTERY',
  price,
  startNo: '',
  endNo: '',
});
const ids = (rows: ReadonlyArray<ScratchTicketRow>) => rows.map((r) => r.id);

describe('the groups', () => {
  it('scratch games group by price, all lotteries are one group whatever they cost', () => {
    expect(groupKey(scratch('a', 5))).toBe('S:500');
    expect(groupKey(scratch('b', 5))).toBe(groupKey(scratch('c', 5)));
    expect(groupKey(scratch('d', 2))).not.toBe(groupKey(scratch('e', 5)));
    expect(groupKey(lottery('l1', 2))).toBe('L');
    expect(groupKey(lottery('l2', 10))).toBe('L');
  });

  it('a lottery is never in the same group as a scratch of the same price', () => {
    expect(groupKey(lottery('l', 2))).not.toBe(groupKey(scratch('s', 2)));
  });

  it('compares prices in cents, so 0,1 + 0,2 is the same group as 0,3', () => {
    expect(groupKey(scratch('x', 0.1 + 0.2))).toBe(groupKey(scratch('y', 0.3)));
  });

  it('the default catalogue is already grouped, in rising price, lotteries last', () => {
    expect(isGrouped(DEFAULT_SCRATCH_PRESETS)).toBe(true);
    const runs = runsOf(DEFAULT_SCRATCH_PRESETS);
    expect(runs.map((r) => r.title)).toEqual([
      'Σκρατς 1€', 'Σκρατς 2€', 'Σκρατς 3€', 'Σκρατς 5€', 'Σκρατς 10€', 'Σκρατς 20€', 'Λαχεία',
    ]);
  });
});

describe('the category follows the price', () => {
  it('«Σκρατς 5€», «Σκρατς 2,5€», «Λαχεία»', () => {
    expect(categoryFor(scratch('a', 5))).toBe('Σκρατς 5€');
    expect(categoryFor(scratch('a', 2.5))).toBe('Σκρατς 2,5€');
    expect(categoryFor(scratch('a', 10))).toBe('Σκρατς 10€');
    expect(categoryFor(lottery('l', 10))).toBe('Λαχεία');
  });

  it('is exactly what the shipped presets already use, so nothing existing changes', () => {
    for (const row of DEFAULT_SCRATCH_PRESETS) expect(categoryFor(row), row.name).toBe(row.category);
  });

  it('a scratch with no price yet is plain «Σκρατς»', () => {
    expect(categoryFor(scratch('a', 0))).toBe('Σκρατς');
  });

  it('prices are written the Greek way', () => {
    expect(priceLabel(5)).toBe('5');
    expect(priceLabel(2.5)).toBe('2,5');
    expect(priceLabel(0.5)).toBe('0,5');
  });
});

describe('a new game goes to the end of its price group', () => {
  it('a new 5 € goes after the last 5 €, not at the end of the list', () => {
    const rows = [...DEFAULT_SCRATCH_PRESETS];
    const added = addToGroup(rows, scratch('new5', 5));
    const at = added.findIndex((r) => r.id === 'new5');
    expect(added[at - 1].id).toBe('scr_5_24mines');
    expect(added[at + 1].id).toBe('scr_10_x50');
    expect(added.length).toBe(rows.length + 1);
  });

  it('a new 1 € goes after the only 1 €', () => {
    const added = addToGroup(DEFAULT_SCRATCH_PRESETS, scratch('new1', 1));
    expect(ids(added).slice(0, 3)).toEqual(['scr_1_seria', 'new1', 'scr_2_7ari']);
  });

  it('a new 20 € goes after the last 20 € and before the lotteries', () => {
    const added = addToGroup(DEFAULT_SCRATCH_PRESETS, scratch('new20', 20));
    const at = added.findIndex((r) => r.id === 'new20');
    expect(added[at - 1].id).toBe('scr_20_gata_x20');
    expect(added[at + 1].id).toBe('scr_laiko');
  });

  it('a price with no group yet takes its place by price: 4 € between 3 € and 5 €', () => {
    const added = addToGroup(DEFAULT_SCRATCH_PRESETS, scratch('new4', 4));
    const at = added.findIndex((r) => r.id === 'new4');
    expect(added[at - 1].id).toBe('scr_3_kerasia');
    expect(added[at + 1].id).toBe('scr_5_7ari');
  });

  it('a price above every group goes after the dearest scratch, before the lotteries', () => {
    const added = addToGroup(DEFAULT_SCRATCH_PRESETS, scratch('new50', 50));
    const at = added.findIndex((r) => r.id === 'new50');
    expect(added[at - 1].id).toBe('scr_20_gata_x20');
    expect(added[at + 1].id).toBe('scr_laiko');
  });

  it('a price below every group goes first', () => {
    const added = addToGroup(DEFAULT_SCRATCH_PRESETS, scratch('new05', 0.5));
    expect(added[0].id).toBe('new05');
  });

  it('a scratch into a catalogue of lotteries only goes in front of them', () => {
    const added = addToGroup([lottery('l1'), lottery('l2')], scratch('s', 2));
    expect(ids(added)).toEqual(['s', 'l1', 'l2']);
  });

  it('a lottery goes to the end of the list', () => {
    const added = addToGroup(DEFAULT_SCRATCH_PRESETS, lottery('newL', 5));
    expect(added[added.length - 1].id).toBe('newL');
  });

  it('into an empty catalogue', () => {
    expect(ids(addToGroup([], scratch('s', 5)))).toEqual(['s']);
    expect(insertionIndex([], scratch('s', 5))).toBe(0);
  });

  it('does not touch the list it was given', () => {
    const rows = [...DEFAULT_SCRATCH_PRESETS];
    const before = ids(rows);
    addToGroup(rows, scratch('x', 5));
    expect(ids(rows)).toEqual(before);
  });

  it('the result is still grouped', () => {
    for (const price of [0.5, 1, 2, 3, 4, 5, 7, 10, 15, 20, 50]) {
      expect(isGrouped(addToGroup(DEFAULT_SCRATCH_PRESETS, scratch('n', price))), String(price)).toBe(true);
    }
  });
});

describe('changing a price moves the row to the end of its new group', () => {
  it('a 5 € re-priced to 2 € goes to the end of the 2 € group', () => {
    const edited = DEFAULT_SCRATCH_PRESETS.map((r) => (r.id === 'scr_5_gata' ? { ...r, price: 2 } : r));
    const moved = moveToGroupEnd(edited, 'scr_5_gata');
    const at = moved.findIndex((r) => r.id === 'scr_5_gata');
    expect(moved[at - 1].id).toBe('scr_2_24mines');
    expect(moved[at + 1].id).toBe('scr_3_kerasia');
    expect(isGrouped(moved)).toBe(true);
  });

  it('keeps every row, once', () => {
    const edited = DEFAULT_SCRATCH_PRESETS.map((r) => (r.id === 'scr_5_gata' ? { ...r, price: 20 } : r));
    const moved = moveToGroupEnd(edited, 'scr_5_gata');
    expect([...ids(moved)].sort()).toEqual([...ids(DEFAULT_SCRATCH_PRESETS)].sort());
  });

  it('a row that is still in its group is well placed: a click does not move anything', () => {
    DEFAULT_SCRATCH_PRESETS.forEach((_, i) => expect(isWellPlaced(DEFAULT_SCRATCH_PRESETS, i), String(i)).toBe(true));
  });

  it('a row whose price left its group is not well placed', () => {
    const edited = DEFAULT_SCRATCH_PRESETS.map((r) => (r.id === 'scr_5_gata' ? { ...r, price: 2 } : r));
    const i = edited.findIndex((r) => r.id === 'scr_5_gata');
    expect(isWellPlaced(edited, i)).toBe(false);
  });

  it('a lone row re-priced to a price that still fits between its neighbours stays put', () => {
    const edited = DEFAULT_SCRATCH_PRESETS.map((r) => (r.id === 'scr_3_kerasia' ? { ...r, price: 4 } : r));
    const i = edited.findIndex((r) => r.id === 'scr_3_kerasia');
    expect(isWellPlaced(edited, i)).toBe(true);
  });

  it('an unknown id leaves the list as it was', () => {
    expect(ids(moveToGroupEnd(DEFAULT_SCRATCH_PRESETS, 'nope'))).toEqual(ids(DEFAULT_SCRATCH_PRESETS));
  });

  it('a scratch turned into a lottery goes to the end of the lotteries', () => {
    const edited = DEFAULT_SCRATCH_PRESETS.map((r) => (r.id === 'scr_3_kerasia' ? { ...r, kind: 'LOTTERY' as const } : r));
    const moved = moveToGroupEnd(edited, 'scr_3_kerasia');
    expect(moved[moved.length - 1].id).toBe('scr_3_kerasia');
  });
});

describe('a catalogue that was moved by hand', () => {
  const messy = [scratch('a5', 5), scratch('b2', 2), scratch('c5', 5), lottery('l'), scratch('d1', 1)];

  it('is not grouped', () => {
    expect(isGrouped(messy)).toBe(false);
  });

  it('is only grouped when asked, in rising price with lotteries last, keeping each group\'s own order', () => {
    expect(ids(groupRows(messy))).toEqual(['d1', 'b2', 'a5', 'c5', 'l']);
    expect(isGrouped(groupRows(messy))).toBe(true);
  });

  it('a broken group shows as two runs, so the screen is the till\'s real order', () => {
    expect(runsOf(messy).map((r) => r.title)).toEqual(['Σκρατς 5€', 'Σκρατς 2€', 'Σκρατς 5€', 'Λαχεία', 'Σκρατς 1€']);
  });

  it('grouping is idempotent', () => {
    expect(ids(groupRows(groupRows(messy)))).toEqual(ids(groupRows(messy)));
  });
});

describe('the prices offered when adding', () => {
  it('the usual ones, plus any price the catalogue already has, in order', () => {
    expect(offeredPrices(DEFAULT_SCRATCH_PRESETS)).toEqual([1, 2, 3, 5, 10, 20]);
    expect(offeredPrices([...DEFAULT_SCRATCH_PRESETS, scratch('odd', 4)])).toEqual([1, 2, 3, 4, 5, 10, 20]);
  });

  it('a lottery price is not offered as a scratch price', () => {
    expect(offeredPrices([lottery('l', 7)])).toEqual([1, 2, 3, 5, 10, 20]);
  });
});

describe('the editor is wired to it', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/shifts/ScratchCatalogEditor.tsx'), 'utf-8');

  it('adding asks the price first and puts the game in its group, not at the end of the list', () => {
    expect(src).toMatch(/addToGroup\(prev, row\)/);
    expect(src).not.toMatch(/setRows\(\(prev\) => \[\s*\.\.\.prev,\s*\{\s*id: `scr_custom_/);
    expect(src).toMatch(/Τι τιμή έχει το νέο σκρατς;/);
  });

  it('refuses a scratch with no price', () => {
    expect(src).toMatch(/Γράψτε πρώτα την τιμή του σκρατς/);
  });

  it('the category is derived from the price, and is not a text box any more', () => {
    expect(src).toMatch(/next\.category = categoryFor\(next\)/);
    expect(src).not.toMatch(/placeholder="Σκρατς 2€"/);
    expect(src).not.toMatch(/onChange=\{\(e\) => update\(index, \{ category:/);
  });

  it('a re-priced row moves when the typing is finished, not on every digit', () => {
    expect(src).toMatch(/onBlur=\{\(\) => regroupAfterPrice\(row\.id\)\}/);
    expect(src).toMatch(/isWellPlaced\(prev, i\)/);
  });

  it('a changed kind moves the row at once', () => {
    expect(src).toMatch(/changeKind\(index, e\.target\.value/);
  });

  it('the arrows stay inside the group', () => {
    expect(src).toMatch(/runByIndex\[index\] !== runByIndex\[target\]/);
    expect(src).toMatch(/index === run\.start/);
    expect(src).toMatch(/index === run\.end/);
  });

  it('each group has a header with its name and count', () => {
    expect(src).toMatch(/firstOfRun && \(/);
    expect(src).toMatch(/run\.title/);
  });

  it('a list that gets out of order while editing is offered grouping with a button', () => {
    expect(src).toMatch(/!isGrouped\(rows\)/);
    expect(src).toMatch(/Ομαδοποίηση ανά τιμή/);
    // the only calls that reorder the whole list: when the screen opens, and that button
    expect(src.match(/groupRows\(/g)?.length).toBe(2);
  });
});

describe('the till\'s own «Προσθήκη Παιχνιδιού» follows the same rule', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/shifts/ScratchCalculatorTable.tsx'), 'utf-8');

  it('a game added from the till goes to the end of its price group, not after the lotteries', () => {
    expect(src).toMatch(/const updated = addToGroup\(rows, newRow\);/);
    expect(src).not.toMatch(/const updated = \[\.\.\.rows, newRow\];/);
  });

  it('its category comes from the price', () => {
    expect(src).toMatch(/newRow\.category = categoryFor\(newRow\);/);
  });

  it('a price edited in the till updates the category, so the row is not left under the old one', () => {
    expect(src).toMatch(/if \(field === 'price' && !isLotteryRow\(nextRow\)\) nextRow\.category = categoryFor\(nextRow\);/);
  });

  it('«OK» moves the row to its new group only if it left its old one', () => {
    expect(src).toMatch(/onClick=\{\(\) => finishEditing\(row\.id\)\}/);
    expect(src).toMatch(/!isWellPlaced\(rows, i\)/);
    expect(src).not.toMatch(/onClick=\{\(\) => setEditingRowId\(null\)\}/);
  });
});

describe('an already-saved catalogue is grouped when the screen opens', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/shifts/ScratchCatalogEditor.tsx'), 'utf-8');

  it('the loaded list is grouped before it is shown, so a 5 € left after the lotteries joins the 5 €', () => {
    expect(src).toMatch(/const grouped = isGrouped\(catalog\) \? catalog : groupRows\(catalog\);\s*setRows\(grouped\);/);
  });

  it('says so, and that the till only changes on «Αποθήκευση καταλόγου»', () => {
    expect(src).toMatch(/Τα σκρατς μπήκαν στις ομάδες της τιμής τους/);
    expect(src).toMatch(/<strong>Αποθήκευση καταλόγου<\/strong>/);
  });

  it('the notice goes away once the catalogue is saved', () => {
    expect(src).toMatch(/setRows\(toSave\);\s*setRegroupedOnLoad\(false\);/);
  });

  it('a stray 5 € that was added from the till after the lotteries goes to the 5 € group', () => {
    const stray = scratch('custom_scr_1', 5);
    const saved = [...DEFAULT_SCRATCH_PRESETS, stray];
    expect(isGrouped(saved)).toBe(false);
    const grouped = groupRows(saved);
    const at = grouped.findIndex((r) => r.id === 'custom_scr_1');
    expect(grouped[at - 1].id).toBe('scr_5_24mines');
    expect(grouped[at + 1].id).toBe('scr_10_x50');
    expect(grouped[grouped.length - 1].id).toBe(DEFAULT_SCRATCH_PRESETS[DEFAULT_SCRATCH_PRESETS.length - 1].id);
  });
});

