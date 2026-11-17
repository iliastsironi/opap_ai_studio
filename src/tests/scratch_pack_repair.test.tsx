import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { awaitingDelivery } from '../lib/scratchOnTheCounter.ts';
import { openedPackCount, restoreForgottenPacks, type PackAtCounter } from '../lib/scratchPackRepair.ts';
import { canUndoPack, undoLastPack } from '../lib/scratchPackHistory.ts';

/**
 * «Έβαλες ένα κουμπί στο μήνυμα που έγραφε "παραδόθηκε, ανανέωση" και το πατάς και
 * δεν κάνει τίποτα.»
 *
 * Το κουμπί δεν είχε τι να κάνει: το πακέτο ΗΤΑΝ παραδομένο και μάλιστα παραληφθεί.
 * Στη βάση το «Δώρο 5€» 0018479 ήταν «στο μαγαζί» για αυτή τη βάρδια, αλλά η γραμμή
 * του προχείρου είχε χάσει τον κωδικό του (το πρόχειρο ξαναγράφτηκε από παλιό
 * αντίγραφο). Η γραμμή φαινόταν «ποτέ δεν μετρήθηκε», οπότε η οθόνη έγραφε «περιμένει
 * παράδοση» και την έκρυβε. Αναπαράχθηκε σε demo: ίδιο μήνυμα, ίδια βάση.
 */

const SHIFT = '52e3efa8-e0c7-4215-ab78-3fa652c12f88';

/** Οι δύο γραμμές όπως κάθονται στο πρόχειρο της Στυλίδας: χωρίς κωδικό, χωρίς αριθμούς. */
const DWRO_5 = { id: 'scr_custom_mwakfl3f', name: 'Δώρο 5€', category: 'Σκρατς 5€', kind: 'SCRATCH', price: 5, startNo: '', endNo: '' };
const DWRO_10 = { id: 'scr_custom_mwakh5bs', name: 'Δώρο 10€', category: 'Σκρατς 10€', kind: 'SCRATCH', price: 10, startNo: '', endNo: '' };

/** Το πακέτο που παραλήφθηκε: IN_STORE, με τη βάρδια που το άνοιξε. */
const PACK_5: PackAtCounter = { catalog_code: DWRO_5.id, pack_code: '0018479', moved_shift_id: SHIFT };

const options = {
  isLottery: (row: any) => row.kind === 'LOTTERY',
  figuresFor: () => ({ startNo: '0', backEndNo: '' }),
};

describe('openedPackCount', () => {
  it('μετρά τα πακέτα του παιχνιδιού που είναι στον πάγκο', () => {
    expect(openedPackCount([PACK_5], DWRO_5.id)).toBe(1);
    expect(openedPackCount([PACK_5], DWRO_10.id)).toBe(0);
    expect(openedPackCount(null, DWRO_5.id)).toBe(0);
    expect(openedPackCount(undefined, DWRO_5.id)).toBe(0);
  });
});

describe('το παιχνίδι με πακέτο στον πάγκο δεν «περιμένει παράδοση»', () => {
  const base = { row: DWRO_5, readyPacks: 0, warehouseInUse: true, isLottery: false };

  it('χωρίς πακέτο στον πάγκο και χωρίς παραδομένο, περιμένει (όπως πριν)', () => {
    expect(awaitingDelivery(base)).toBe(true);
  });

  it('με πακέτο ήδη στον πάγκο, ΟΧΙ', () => {
    expect(awaitingDelivery({ ...base, packsAtCounter: 1 })).toBe(false);
  });

  it('με παραδομένο πακέτο, ΟΧΙ (όπως πριν)', () => {
    expect(awaitingDelivery({ ...base, readyPacks: 1 })).toBe(false);
  });
});

describe('restoreForgottenPacks', () => {
  it('η γραμμή που έχασε τον κωδικό ξαναγράφεται από την αποθήκη, με ίχνος αναίρεσης', () => {
    const rows = [DWRO_5, DWRO_10];
    const out = restoreForgottenPacks(rows, [PACK_5], SHIFT, options) as Array<Record<string, any>>;
    expect(out[0].packCode).toBe('0018479');
    expect(out[0].startNo).toBe('0');
    expect(out[0].isNewPack).toBe(true);
    expect(out[0].packHistory).toHaveLength(1);
    // Το άλλο παιχνίδι δεν πειράζεται.
    expect(out[1]).toBe(DWRO_10);
    // Ό,τι χρεώνει το άνοιγμα ενός ΠΡΩΤΟΥ πακέτου: τίποτα.
    expect(out[0].closedPackQty).toBe(0);
  });

  it('η αναίρεση πάνω στη γραμμή που ξαναγράφτηκε τη γυρίζει όπως ήταν', () => {
    const [restored] = restoreForgottenPacks([DWRO_5], [PACK_5], SHIFT, options) as Array<Record<string, any>>;
    expect(canUndoPack(restored)).toBe(true);
    const back = undoLastPack(restored);
    expect(back.packCode).toBe('');
    expect(back.startNo).toBe('');
  });

  it('η ΙΔΙΑ λίστα επιστρέφει όταν δεν υπάρχει τίποτα να γίνει (ο καλών δεν ξαναζωγραφίζει)', () => {
    const rows = [DWRO_5, DWRO_10];
    expect(restoreForgottenPacks(rows, [], SHIFT, options)).toBe(rows);
    expect(restoreForgottenPacks(rows, null, SHIFT, options)).toBe(rows);
    // Πακέτο άλλου παιχνιδιού:
    expect(restoreForgottenPacks(rows, [{ ...PACK_5, catalog_code: 'άλλο' }], SHIFT, options)).toBe(rows);
  });

  it('δεν ξαναγράφει δεύτερη φορά: μετά την επαναφορά η γραμμή έχει κωδικό και μένει ως έχει', () => {
    const once = restoreForgottenPacks([DWRO_5], [PACK_5], SHIFT, options);
    expect(restoreForgottenPacks(once, [PACK_5], SHIFT, options)).toBe(once);
  });

  it('πακέτο που άνοιξε ΑΛΛΗ βάρδια δεν γράφεται σε αυτή', () => {
    const rows = [DWRO_5];
    expect(restoreForgottenPacks(rows, [{ ...PACK_5, moved_shift_id: 'άλλη-βάρδια' }], SHIFT, options)).toBe(rows);
    expect(restoreForgottenPacks(rows, [{ ...PACK_5, moved_shift_id: null }], SHIFT, options)).toBe(rows);
  });

  it('γραμμή που έχει ήδη μετρηθεί (αριθμοί) δεν αγγίζεται: δεν ξέρουμε τι πούλησε πριν και μετά', () => {
    const counted = { ...DWRO_5, startNo: '12' };
    const rows = [counted];
    expect(restoreForgottenPacks(rows, [PACK_5], SHIFT, options)).toBe(rows);
  });

  it('δύο πακέτα του ίδιου παιχνιδιού στη βάρδια: δεν μαντεύει ποιο τρέχει', () => {
    const rows = [DWRO_5];
    const two = [PACK_5, { ...PACK_5, pack_code: '0099999' }];
    expect(restoreForgottenPacks(rows, two, SHIFT, options)).toBe(rows);
  });

  it('τα λαχεία δεν ανοίγουν πακέτα: μένουν ως έχουν', () => {
    const laiko = { id: 'laiko', kind: 'LOTTERY', price: 2, startNo: '', endNo: '' };
    const rows = [laiko];
    expect(restoreForgottenPacks(rows, [{ ...PACK_5, catalog_code: 'laiko' }], SHIFT, options)).toBe(rows);
  });
});

// ── ο πίνακας, όπως τον βλέπει ο υπάλληλος ────────────────────────────────────

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ roles: [{ code: 'EMPLOYEE' }], permissions: ['store.view'] }),
}));
const { ScratchCalculatorTable } = await import('../components/shifts/ScratchCalculatorTable');

const draw = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    React.createElement(ScratchCalculatorTable as never, {
      rows: [DWRO_5, DWRO_10],
      onChangeRows: () => {},
      warehouseInUse: true,
      warehousePacks: [],
      ...props,
    } as never)
  );

describe('ο πίνακας', () => {
  it('ΠΡΙΝ: παραλήφθηκε το πακέτο αλλά η γραμμή δεν το ξέρει, και έγραφε «περιμένει παράδοση»', () => {
    const html = draw({});
    expect(html).toContain('2 παιχνίδια περιμένουν παράδοση');
  });

  it('ΤΩΡΑ: το 5€ έχει πακέτο στον πάγκο, δεν περιμένει και η γραμμή του φαίνεται· το 10€ περιμένει', () => {
    const html = draw({ warehouseOpenPacks: [PACK_5] });
    expect(html).toContain('Ένα παιχνίδι περιμένει παράδοση');
    expect(html).toMatch(/Ένα παιχνίδι περιμένει παράδοση:<\/strong> Δώρο 10€/);
    expect(html).toContain('Δώρο 5€');
  });
});

// ── η οθόνη κλεισίματος ───────────────────────────────────────────────────────

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('η οθόνη κλεισίματος', () => {
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');

  it('διαβάζει και τα πακέτα που είναι ήδη στον πάγκο, μαζί με τα υπόλοιπα, σε κάθε ανανέωση', () => {
    expect(wizard).toContain('fetchPacksAtCounter(orgId, shift.store_id)');
    expect(wizard).toContain('setPacksAtCounter(atCounter);');
    expect(wizard).toContain('warehouseOpenPacks={packsAtCounter}');
  });

  it('ξαναγράφει τη γραμμή που ξέχασε το πακέτο της βάρδιας, και δεν κάνει κύκλο', () => {
    expect(wizard).toContain('restoreForgottenPacks(scratchRows, packsAtCounter, shift.id, {');
    expect(wizard).toContain('if (restored !== scratchRows) handleScratchRowsChange(restored as ScratchTicketRow[]);');
  });

  it('τα νούμερα της επαναφοράς είναι τα ίδια με του ανοίγματος (startNoForNewPack)', () => {
    expect(wizard).toContain('startNo: startNoForNewPack(row, standingOrders)');
  });

  it('η αποθήκη το διαβάζει από την κατάσταση IN_STORE', () => {
    expect(read('src/services/scratchWarehouseService.ts')).toMatch(
      /export async function fetchPacksAtCounter[\s\S]*?\['IN_STORE'\]/
    );
  });
});
