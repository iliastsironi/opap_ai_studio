import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAutoRefresh } from '../lib/autoRefresh.ts';

/**
 * «Έχω βάλει σκρατς προς παράδοση στην Στυλίδα. Δώρο 5 και δώρο 10. Τα βάζω
 * παράδοση στο μαγαζί. Πάει από το μαγαζί, κάνει παραλαβή, και βγάζει ένα μήνυμα
 * πάνω: "2 παιχνίδια περιμένουν παράδοση". Τι γίνεται λάθος;»
 *
 * Στη βάση τα δύο πακέτα ήταν παραδομένα (PENDING_DELIVERY) και ο κωδικός τους
 * ταίριαζε με τις γραμμές της βάρδιας. Η οθόνη του ταμείου όμως, ανοιχτή από το
 * πρωί, είχε διαβάσει τη λίστα πακέτων ΜΙΑ φορά, στο άνοιγμα, και δεν την
 * ξανακοίταξε ποτέ: η παράδοση έγινε από άλλη συσκευή (του ιδιοκτήτη), και το
 * «μπαίνουν μόνα τους» του μηνύματος ίσχυε μόνο μετά από reload.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

/** Ένα ψεύτικο document: κρατά τους ακροατές και τους καλεί όταν του το ζητήσουμε. */
function fakeTarget() {
  const handlers = new Map<string, Set<() => void>>();
  return {
    addEventListener: (type: string, fn: () => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => handlers.get(type)?.delete(fn),
    fire: (type: string) => handlers.get(type)?.forEach((fn) => fn()),
    count: (type: string) => handlers.get(type)?.size ?? 0,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startAutoRefresh', () => {
  it('ξαναρωτάει κάθε intervalMs και εφαρμόζει το νέο αποτέλεσμα', async () => {
    let value = 'ράφι';
    const seen: string[] = [];
    const loop = startAutoRefresh({ load: async () => value, apply: (v) => seen.push(v), intervalMs: 20_000 });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(seen).toEqual(['ράφι']);

    value = 'παραδομένο'; // ο ιδιοκτήτης παρέδωσε από άλλη συσκευή
    await vi.advanceTimersByTimeAsync(20_000);
    expect(seen).toEqual(['ράφι', 'παραδομένο']);
    loop.stop();
  });

  it('δεν ρωτάει όσο η σελίδα είναι κρυμμένη', async () => {
    const load = vi.fn(async () => 1);
    let visible = false;
    const loop = startAutoRefresh({ load, apply: () => {}, intervalMs: 1000, isVisible: () => visible });
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).not.toHaveBeenCalled();
    visible = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it('ξαναρωτάει μόλις ο χρήστης γυρίσει στη σελίδα (focus και visibilitychange)', async () => {
    const target = fakeTarget();
    const load = vi.fn(async () => 1);
    const loop = startAutoRefresh({ load, apply: () => {}, intervalMs: 60_000, target });
    target.fire('focus');
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    target.fire('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('η πιο πρόσφατη ερώτηση κερδίζει: μια παλιά απάντηση που αργεί δεν σβήνει τη νεότερη', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const seen: string[] = [];
    const loop = startAutoRefresh({
      load: () => new Promise<string>((resolve) => resolvers.push(resolve)),
      apply: (v) => seen.push(v),
      intervalMs: 1_000_000,
    });
    const first = loop.refresh(); // παλιό ερώτημα, αργεί
    const second = loop.refresh(); // νεότερο
    resolvers[1]('νέο');
    await second;
    resolvers[0]('παλιό'); // γυρνάει μετά
    await first;
    expect(seen).toEqual(['νέο']);
    loop.stop();
  });

  it('supersede: ό,τι ερώτημα τρέχει δεν εφαρμόζεται (το πακέτο μόλις πέρασε στον πάγκο)', async () => {
    let resolve!: (v: string) => void;
    const seen: string[] = [];
    const loop = startAutoRefresh({
      load: () => new Promise<string>((r) => (resolve = r)),
      apply: (v) => seen.push(v),
      intervalMs: 1_000_000,
    });
    const pending = loop.refresh();
    loop.supersede();
    resolve('πακέτο που πλέον είναι στον πάγκο');
    await pending;
    expect(seen).toEqual([]);
    loop.stop();
  });

  it('ένα σφάλμα δεν πετάει και δεν πειράζει την προηγούμενη λίστα', async () => {
    const errors: unknown[] = [];
    const seen: number[] = [];
    let fail = false;
    const loop = startAutoRefresh({
      load: async () => {
        if (fail) throw new Error('offline');
        return 7;
      },
      apply: (v) => seen.push(v),
      onError: (e) => errors.push(e),
      intervalMs: 1_000_000,
    });
    await loop.refresh();
    fail = true;
    await expect(loop.refresh()).resolves.toBeUndefined();
    expect(seen).toEqual([7]);
    expect(errors).toHaveLength(1);
    loop.stop();
  });

  it('stop: σταματά το ρολόι, βγάζει τους ακροατές, και δεν εφαρμόζει ούτε ό,τι ήταν στον αέρα', async () => {
    const target = fakeTarget();
    let resolve!: (v: number) => void;
    const seen: number[] = [];
    const load = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const loop = startAutoRefresh({ load, apply: (v) => seen.push(v), intervalMs: 1000, target });
    expect(target.count('focus')).toBe(1);
    const pending = loop.refresh();
    loop.stop();
    expect(target.count('focus')).toBe(0);
    expect(target.count('visibilitychange')).toBe(0);
    resolve(1);
    await pending;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seen).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

// ── το μήνυμα, με τα πραγματικά δεδομένα της Στυλίδας ────────────────────────

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ roles: [{ code: 'EMPLOYEE' }], permissions: ['store.view'] }),
}));
const { ScratchCalculatorTable } = await import('../components/shifts/ScratchCalculatorTable');

const DWRO_5 = { id: 'scr_custom_mwakfl3f', name: 'Δώρο 5€', category: 'Σκρατς 5€', kind: 'SCRATCH', price: 5, startNo: '', endNo: '' };
const DWRO_10 = { id: 'scr_custom_mwakh5bs', name: 'Δώρο 10€', category: 'Σκρατς 10€', kind: 'SCRATCH', price: 10, startNo: '', endNo: '' };
const RUNNING = { id: 'scr_1_kerdi', name: 'ΚΕΡΔΗ ΣΤΗ ΣΕΙΡΑ 1€', category: 'Σκρατς 1€', kind: 'SCRATCH', price: 1, startNo: '300', endNo: '' };

const pack = (over: Record<string, unknown>) => ({
  id: 'p', catalog_code: DWRO_5.id, pack_code: '0018479', game_name: 'Δώρο 5€', pieces: 60, unit_price: 5,
  received_at: '2026-11-17', status: 'PENDING_DELIVERY', ...over,
});

const draw = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    React.createElement(ScratchCalculatorTable as never, {
      rows: [RUNNING, DWRO_5, DWRO_10],
      onChangeRows: () => {},
      warehouseInUse: true,
      ...props,
    } as never)
  );

describe('το μήνυμα «περιμένουν παράδοση»', () => {
  it('με τη λίστα που είχε η οθόνη το πρωί (πακέτα ακόμα στο ράφι) βγάζει το μήνυμα, με διέξοδο', () => {
    const stale = [pack({ status: 'IN_WAREHOUSE' }), pack({ id: 'q', catalog_code: DWRO_10.id, status: 'IN_WAREHOUSE' })];
    const html = draw({ warehousePacks: stale, onRefreshWarehouse: async () => {} });
    expect(html).toContain('2 παιχνίδια περιμένουν παράδοση');
    expect(html).toContain('Δώρο 5€ · Δώρο 10€');
    expect(html).toContain('Ανανέωση');
  });

  it('με τη σωστή λίστα (τα δύο πακέτα παραδομένα) δεν βγάζει μήνυμα και οι γραμμές φαίνονται', () => {
    const fresh = [pack({}), pack({ id: 'q', catalog_code: DWRO_10.id, pack_code: '0024355', game_name: 'Δώρο 10€', unit_price: 10 })];
    const html = draw({ warehousePacks: fresh, onRefreshWarehouse: async () => {} });
    expect(html).not.toContain('περιμένουν παράδοση');
    expect(html).not.toContain('περιμένει παράδοση');
    expect(html).toContain('Δώρο 5€');
    expect(html).toContain('Δώρο 10€');
  });

  it('το κουμπί υπάρχει μόνο όταν η οθόνη ξέρει να ανανεώσει', () => {
    const stale = [pack({ status: 'IN_WAREHOUSE' })];
    expect(draw({ warehousePacks: stale })).not.toContain('Ανανέωση');
  });
});

describe('η οθόνη κλεισίματος', () => {
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');

  it('δεν διαβάζει πια τα πακέτα μία φορά: τρέχει το startAutoRefresh', () => {
    expect(wizard).toContain("import { startAutoRefresh, type AutoRefresh } from '../../lib/autoRefresh.ts';");
    expect(wizard).toContain('startAutoRefresh({');
    // Το παλιό μοτίβο: Promise.all([...]).then(([packs, inUse]) => ...) μέσα σε effect χωρίς ανανέωση.
    expect(wizard).not.toMatch(/Promise\.all\(\[\s*\/\/ Παραδομένα ΚΑΙ στο ράφι[\s\S]*?\.then\(\(\[packs, inUse\]\)/);
  });

  it('περιμένει μόνο όσο φαίνεται η σελίδα, και ακούει το document', () => {
    expect(wizard).toContain("document.visibilityState === 'visible'");
    expect(wizard).toContain('target: typeof document === \'undefined\' ? null : document');
  });

  it('η παραλαβή ακυρώνει ό,τι ερώτημα ήταν στον αέρα, και το κουμπί του πίνακα ξαναδιαβάζει', () => {
    expect(wizard).toMatch(/await movePackToStore\(packId, shift\.id\);[\s\S]*?warehouseRefresh\.current\?\.supersede\(\);/);
    expect(wizard).toContain('onRefreshWarehouse={async () => {');
    expect(wizard).toContain('await warehouseRefresh.current?.refresh();');
  });

  it('η αναίρεση ξαναδιαβάζει χωρίς να μπορεί να ρίξει το «δεν γύρισε» όταν γύρισε', () => {
    // Το fetch μέσα στο onPackReturned πετούσε, και το handleUndoPack έλεγε «Το
    // πακέτο δεν γύρισε» για πακέτο που είχε ήδη γυρίσει στη βάση.
    expect(wizard).not.toContain('setWarehousePacks(await fetchPacksForTill(orgId, shift.store_id));');
  });
});
