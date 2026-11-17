import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Ο κατάλογος σκρατς, απλοποιημένος:
 *  - ένα κουμπί «κρυφό» σε κάθε σκρατς (δεν λειτουργεί αυτή την περίοδο)·
 *  - η στήλη «Πακέτο» φεύγει·
 *  - τα «Δελτία» βγαίνουν μόνα τους από την τιμή·
 *  - η στήλη «Πίσω» φεύγει: κάθε σκρατς μετράει μπρος και πίσω, εκτός από τα
 *    λαχεία, και το «μόνο μπροστά» είναι ρύθμιση του καταστήματος.
 */

// ---- a fake database that records what the service asks it -----------------
const db = vi.hoisted(() => {
  const state = {
    calls: [] as unknown[][],
    rows: [] as Record<string, unknown>[],
    inserted: [] as Record<string, unknown>[],
  };
  const builder: any = {
    select: (...a: unknown[]) => (state.calls.push(['select', ...a]), builder),
    eq: (...a: unknown[]) => (state.calls.push(['eq', ...a]), builder),
    or: (...a: unknown[]) => (state.calls.push(['or', ...a]), builder),
    is: (...a: unknown[]) => (state.calls.push(['is', ...a]), builder),
    not: (...a: unknown[]) => (state.calls.push(['not', ...a]), builder),
    delete: () => (state.calls.push(['delete']), builder),
    order: async () => ({ data: state.rows, error: null }),
    limit: async () => ({ data: state.rows.slice(0, 1), error: null }),
    insert: async (payload: Record<string, unknown>[]) => {
      state.inserted = payload;
      return { error: null };
    },
    then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
  };
  return { state, builder };
});
vi.mock('../services/supabase.ts', () => ({ supabase: { from: () => db.builder } }));
vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ roles: [{ code: 'EMPLOYEE' }], permissions: ['store.view'] }),
}));

const { ScratchCalculatorTable } = await import('../components/shifts/ScratchCalculatorTable');
const { fetchScratchCatalog, saveScratchCatalog } = await import('../services/scratchCatalogService');
const { fetchWarehouseGames } = await import('../services/scratchWarehouseService');
const { packPieces } = await import('../lib/scratchBarcode');

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const scratch = (id: string, name: string, price: number, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  category: `Σκρατς ${price}€`,
  kind: 'SCRATCH' as const,
  price,
  startNo: '',
  endNo: '',
  ...extra,
});

beforeEach(() => {
  db.state.calls = [];
  db.state.rows = [];
  db.state.inserted = [];
});

describe('ένα κρυφό παιχνίδι δεν φαίνεται στον πίνακα του ταμείου', () => {
  const draw = (rows: unknown[]) =>
    renderToStaticMarkup(
      React.createElement(ScratchCalculatorTable as never, { rows, onChangeRows: () => {} } as never)
    );

  it('ένα ορατό σκρατς φαίνεται', () => {
    const html = draw([scratch('a', 'ΓΑΤΑ ΟΡΑΤΟ', 2), scratch('b', 'ΤΙΓΡΗΣ ΚΡΥΦΟΣ', 5)]);
    expect(html).toContain('ΓΑΤΑ ΟΡΑΤΟ');
    expect(html).toContain('ΤΙΓΡΗΣ ΚΡΥΦΟΣ');
  });

  it('το κρυφό δεν φαίνεται, το διπλανό του ναι', () => {
    const html = draw([scratch('a', 'ΓΑΤΑ ΟΡΑΤΟ', 2), scratch('b', 'ΤΙΓΡΗΣ ΚΡΥΦΟΣ', 5, { hidden: true })]);
    expect(html).toContain('ΓΑΤΑ ΟΡΑΤΟ');
    expect(html).not.toContain('ΤΙΓΡΗΣ ΚΡΥΦΟΣ');
  });

  it('όταν το ξανακάνεις ορατό, επιστρέφει', () => {
    const html = draw([scratch('b', 'ΤΙΓΡΗΣ ΚΡΥΦΟΣ', 5, { hidden: false })]);
    expect(html).toContain('ΤΙΓΡΗΣ ΚΡΥΦΟΣ');
  });
});

describe('το κρυφό ταξιδεύει με τον κατάλογο', () => {
  it('η ανάγνωση ΔΕΝ φιλτράρει τα ανενεργά: ένα κρυφό παιχνίδι με ανοιγμένο πακέτο δεν χάνει τη θέση του', async () => {
    db.state.rows = [
      { code: 'a', name: 'ΓΑΤΑ', kind: 'SCRATCH', category: 'Σκρατς 2€', price: 2, bundle_size: null, back_side_enabled: true, sort_order: 0, game_no: null, pack_pieces: null, is_active: true, store_id: null },
      { code: 'b', name: 'ΤΙΓΡΗΣ', kind: 'SCRATCH', category: 'Σκρατς 5€', price: 5, bundle_size: null, back_side_enabled: true, sort_order: 1, game_no: null, pack_pieces: null, is_active: false, store_id: null },
    ];
    const rows = await fetchScratchCatalog('org', undefined);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows.find((r) => r.id === 'b')?.hidden).toBe(true);
    expect(rows.find((r) => r.id === 'a')?.hidden).toBeUndefined();
    expect(db.state.calls.some((c) => c[0] === 'eq' && c[1] === 'is_active')).toBe(false);
  });

  it('η αποθήκευση γράφει το κρυφό ως ανενεργό και το ορατό ως ενεργό', async () => {
    await saveScratchCatalog('org', null, [scratch('a', 'ΓΑΤΑ', 2), scratch('b', 'ΤΙΓΡΗΣ', 5, { hidden: true })] as never);
    expect(db.state.inserted.map((r) => [r.code, r.is_active])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('το κρυφό κρατάει τη θέση και την τιμή του στη βάση', async () => {
    await saveScratchCatalog('org', null, [scratch('a', 'ΓΑΤΑ', 2), scratch('b', 'ΤΙΓΡΗΣ', 5, { hidden: true })] as never);
    const b = db.state.inserted.find((r) => r.code === 'b')!;
    expect([b.sort_order, b.price, b.name]).toEqual([1, 5, 'ΤΙΓΡΗΣ']);
  });

  it('η αποθήκη αναγνωρίζει ακόμα και ένα κρυφό παιχνίδι: μια παράδοση δεν πρέπει να χαθεί', async () => {
    db.state.rows = [];
    await fetchWarehouseGames('org', undefined).catch(() => undefined);
    expect(db.state.calls.some((c) => c[0] === 'eq' && c[1] === 'is_active')).toBe(false);
  });
});

describe('η οθόνη του καταλόγου', () => {
  const src = read('src/components/shifts/ScratchCatalogEditor.tsx');

  it('δεν έχει στήλη «Πακέτο» ούτε «Πίσω»', () => {
    expect(src).not.toMatch(/<th[^>]*>Πακέτο<\/th>/);
    expect(src).not.toMatch(/<th[^>]*>Πίσω<\/th>/);
    expect(src).not.toMatch(/backSideEnabled: e\.target\.checked/);
    expect(src).not.toMatch(/bundleSize: next > 1/);
  });

  it('έχει στήλη «Ορατό» με κουμπί κρυφό/ορατό σε κάθε σκρατς', () => {
    expect(src).toMatch(/<th[\s\S]*?>\s*Ορατό\s*<\/th>/);
    expect(src).toMatch(/update\(index, \{ hidden: row\.hidden \? undefined : true \}\)/);
    expect(src).toMatch(/Απόκρυψη του/);
    expect(src).toMatch(/Εμφάνιση του/);
  });

  it('τα λαχεία δεν έχουν κουμπί κρυφό (έχουν δικό τους διακόπτη στις ρυθμίσεις)', () => {
    expect(src).toMatch(/Τα εποχικά λαχεία έχουν δικό τους διακόπτη/);
  });

  it('τα δελτία βγαίνουν από την τιμή', () => {
    expect(src).toMatch(/packPieces\(row\.price\)/);
    expect(src).toMatch(/packPieces\(row\.price, row\.packPieces\)/);
  });

  it('ό,τι ισούται με τον αυτόματο αριθμό δεν αποθηκεύεται ως εξαίρεση', () => {
    expect(src).toMatch(/next > 0 && next !== auto \? next : undefined/);
  });

  it('η αποθήκευση γράφει μπρος-πίσω σε κάθε σκρατς και καθαρίζει το «πακέτο» τους', () => {
    expect(src).toMatch(/isLotteryRow\(r\) \? r : \{ \.\.\.r, bundleSize: undefined, backSideEnabled: true \}/);
    expect(src).not.toMatch(/bundleSizeProblem/);
  });

  it('ένα νέο σκρατς γεννιέται με μπρος-πίσω', () => {
    expect(src).toMatch(/kind === 'SCRATCH' \? \{ backSideEnabled: true \}/);
  });
});

describe('τα δελτία: ο αυτόματος αριθμός', () => {
  it('300 € / τιμή', () => {
    expect(packPieces(1)).toBe(300);
    expect(packPieces(2)).toBe(150);
    expect(packPieces(3)).toBe(100);
    expect(packPieces(5)).toBe(60);
    expect(packPieces(10)).toBe(30);
    expect(packPieces(20)).toBe(15);
  });

  it('η εξαίρεση νικάει: το 7ΑΡΙ Χ50 έχει 15 δελτία', () => {
    expect(packPieces(50, 15)).toBe(15);
  });

  it('μια τιμή που δεν διαιρεί τα 300 δεν έχει αυτόματο αριθμό', () => {
    expect(packPieces(7)).toBeNull();
    expect(packPieces(0)).toBeNull();
  });
});
