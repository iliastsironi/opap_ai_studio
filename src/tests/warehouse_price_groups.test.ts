/**
 * Η αποθήκη ανά κατηγορία με βάση την τιμή, και η τιμή φαίνεται.
 *
 * «Στην αποθήκη να φαίνονται ανά κατηγορία με βάση την τιμή και να φαίνεται
 * και η τιμή.» Οι ίδιες ομάδες με τον κατάλογο: «Σκρατς 1€», «Σκρατς 2€»...
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { groupByPrice, priceCategory } from '../lib/warehouseGroups.ts';
import { codesByGame, totalCodes } from '../lib/warehouseCodeList.ts';
import { priceLabel } from '../lib/priceLabel.ts';

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf-8');
const names = (items: { name: string }[]) => items.map((i) => i.name);

const pk = (name: string, unit_price: unknown) => ({ name, unit_price });

describe('οι ομάδες ανά τιμή', () => {
  it('σε αύξουσα τιμή, όχι με τη σειρά που ήρθαν', () => {
    const groups = groupByPrice([pk('a', 10), pk('b', 2), pk('c', 5), pk('d', 1)], (x) => x.unit_price);
    expect(groups.map((g) => g.price)).toEqual([1, 2, 5, 10]);
  });

  it('το 10 είναι μετά το 5 (αριθμητικά, όχι αλφαβητικά)', () => {
    const groups = groupByPrice([pk('a', 10), pk('b', 5), pk('c', 20), pk('d', 2)], (x) => x.unit_price);
    expect(groups.map((g) => g.title)).toEqual(['Σκρατς 2€', 'Σκρατς 5€', 'Σκρατς 10€', 'Σκρατς 20€']);
  });

  it('η κατηγορία λέγεται όπως στον κατάλογο', () => {
    expect(priceCategory(5)).toBe('Σκρατς 5€');
    expect(priceCategory(2.5)).toBe('Σκρατς 2,5€');
    expect(priceCategory(10)).toBe('Σκρατς 10€');
  });

  it('μέσα στην ομάδα μένει η σειρά που ήρθε', () => {
    const groups = groupByPrice(
      [pk('z', 5), pk('a', 2), pk('m', 5), pk('b', 2), pk('c', 5)],
      (x) => x.unit_price
    );
    expect(names(groups[0].items)).toEqual(['a', 'b']);
    expect(names(groups[1].items)).toEqual(['z', 'm', 'c']);
  });

  it('κάθε πακέτο μπαίνει σε μία ομάδα, κανένα δεν χάνεται', () => {
    const items = [pk('a', 1), pk('b', 2), pk('c', 2), pk('d', 5), pk('e', 5), pk('f', 5), pk('g', null)];
    const groups = groupByPrice(items, (x) => x.unit_price);
    expect(groups.reduce((t, g) => t + g.items.length, 0)).toBe(items.length);
  });

  it('ό,τι δεν έχει τιμή πάει τελευταίο, σε δική του ομάδα', () => {
    const groups = groupByPrice([pk('x', null), pk('a', 5), pk('y', 0), pk('z', 'abc')], (x) => x.unit_price);
    expect(groups.map((g) => g.title)).toEqual(['Σκρατς 5€', 'Χωρίς τιμή']);
    expect(names(groups[1].items)).toEqual(['x', 'y', 'z']);
  });

  it('συγκρίνει σε λεπτά: 0,1 + 0,2 είναι η ίδια ομάδα με 0,3', () => {
    const groups = groupByPrice([pk('a', 0.1 + 0.2), pk('b', 0.3)], (x) => x.unit_price);
    expect(groups.length).toBe(1);
  });

  it('κενή λίστα, καμία ομάδα', () => {
    expect(groupByPrice([], (x: { unit_price: number }) => x.unit_price)).toEqual([]);
  });

  it('η τιμή γράφεται ελληνικά', () => {
    expect(priceLabel(5)).toBe('5');
    expect(priceLabel(2.5)).toBe('2,5');
  });
});

describe('οι κωδικοί ανά κατηγορία', () => {
  const pack = (over: Record<string, unknown>) => ({
    pack_code: '0000001',
    status: 'IN_WAREHOUSE',
    ...over,
  });

  it('κάθε παιχνίδι κουβαλάει την τιμή του', () => {
    const games = codesByGame([pack({ catalog_code: 'g', game_name: 'ΓΑΤΑ', game_no: '0157', unit_price: 2 })]);
    expect(games[0].price).toBe(2);
  });

  it('ταξινομούνται ανά τιμή και μέσα σε κάθε τιμή ανά αριθμό παιχνιδιού', () => {
    const games = codesByGame([
      pack({ catalog_code: 'a', game_name: 'Χ50', game_no: '0150', unit_price: 10 }),
      pack({ catalog_code: 'b', game_name: '7ΑΡΙ', game_no: '0152', unit_price: 2 }),
      pack({ catalog_code: 'c', game_name: 'ΓΑΤΑ', game_no: '0157', unit_price: 2 }),
      pack({ catalog_code: 'd', game_name: 'ΚΕΡΔΗ', game_no: '0151', unit_price: 1 }),
      pack({ catalog_code: 'e', game_name: '7ΑΡΙ', game_no: '0153', unit_price: 5 }),
    ]);
    expect(games.map((g) => g.gameNo)).toEqual(['0151', '0152', '0157', '0153', '0150']);
  });

  it('ένα παιχνίδι χωρίς γνωστή τιμή πάει τελευταίο, δεν χάνεται', () => {
    const games = codesByGame([
      pack({ catalog_code: 'a', game_name: 'ΑΓΝΩΣΤΟ', game_no: '0100', unit_price: null }),
      pack({ catalog_code: 'b', game_name: 'ΓΑΤΑ', game_no: '0157', unit_price: 2 }),
    ]);
    expect(games.map((g) => g.key)).toEqual(['b', 'a']);
    expect(totalCodes(games)).toBe(2);
  });

  it('οι ομάδες των κωδικών βγαίνουν από την ίδια ομαδοποίηση', () => {
    const games = codesByGame([
      pack({ catalog_code: 'a', game_name: 'Χ50', game_no: '0150', unit_price: 10 }),
      pack({ catalog_code: 'b', game_name: 'ΓΑΤΑ', game_no: '0157', unit_price: 2 }),
      pack({ catalog_code: 'c', game_name: '7ΑΡΙ', game_no: '0152', unit_price: 2 }),
    ]);
    const groups = groupByPrice(games, (g) => g.price);
    expect(groups.map((g) => [g.title, g.items.length])).toEqual([
      ['Σκρατς 2€', 2],
      ['Σκρατς 10€', 1],
    ]);
  });
});

describe('η οθόνη της αποθήκης', () => {
  const src = read('src/components/warehouse/ScratchWarehouseManager.tsx');

  it('η λίστα πακέτων χωρίζεται σε ομάδες ανά τιμή, με επικεφαλίδα', () => {
    expect(src).toMatch(/groupByPrice\(visible, \(p\) => p\.unit_price\)/);
    expect(src).toMatch(/visibleGroups\.map\(\(group\) => \(/);
    expect(src).toMatch(/toGreekUpper\(group\.title\)/);
  });

  it('η επικεφαλίδα λέει πόσα πακέτα και πόση αξία έχει η ομάδα', () => {
    expect(src).toMatch(/group\.items\.length === 1 \? 'πακέτο' : 'πακέτα'/);
    expect(src).toMatch(/group\.items\.reduce\(\(t, p\) => t \+ \(Number\(p\.pieces\) \|\| 0\) \* \(Number\(p\.unit_price\) \|\| 0\), 0\)/);
  });

  it('η τιμή έχει δική της στήλη, και η επικεφαλίδα της ομάδας πιάνει όλες τις στήλες', () => {
    expect(src).toMatch(/toGreekUpper\('Τιμη'\)/);
    expect(src).toMatch(/<td colSpan=\{7\}/);
    const headers = (src.match(/<th className="(?:text-left|text-right) p-2\.5 font-black">/g) ?? []).length;
    expect(headers).toBe(7);
  });

  it('η τιμή δεν γράφεται πια δεύτερη φορά κάτω από το όνομα', () => {
    expect(src).toMatch(/<span className="block text-micro text-slate-500">\{pack\.pieces\} δελτία<\/span>/);
    expect(src).not.toMatch(/formatCurrency\(pack\.unit_price\)\} · \{pack\.pieces\} δελτία/);
  });

  it('η σειρά μέσα στην ομάδα είναι ακόμα αυτή που διάλεξε ο χρήστης (κωδικός ή ημερομηνία)', () => {
    expect(src).toMatch(/sortKey === 'game_no'/);
    expect(src).toMatch(/a\.received_at\.localeCompare\(b\.received_at\)/);
  });

  it('η λίστα «Όλοι οι κωδικοί» είναι και αυτή ανά κατηγορία', () => {
    expect(src).toMatch(/groupByPrice\(allCodes, \(g\) => g\.price\)/);
    expect(src).toMatch(/codeGroups\.map\(\(group\) => \(/);
  });
});
