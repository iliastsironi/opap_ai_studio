import { describe, it, expect } from 'vitest';
import {
  activePackCode,
  activePackLabel,
  awaitingDelivery,
  everCounted,
  readyPackCount,
} from '../lib/scratchOnTheCounter';
import type { HandoverPack } from '../lib/warehouseHandover';

/** Οι δύο νέοι κωδικοί, ακριβώς όπως κάθονται σήμερα στη βάρδια της Λαμίας. */
const DWRO_5 = {
  id: 'scr_custom_mwakfl3f',
  name: 'Δώρο 5€',
  price: 5,
  startNo: '',
  endNo: '',
  backEndNo: '',
};

/** Ένα παιχνίδι που τρέχει: βρέθηκε στο 60 και δεν έχει πουλήσει ακόμα σήμερα. */
const TRECHEI = { id: 'scr_custom_mvhy9okv', name: 'Σκρατς League 5€', startNo: '60', endNo: '' };

const pack = (over: Partial<HandoverPack>): HandoverPack => ({
  id: 'p1',
  catalog_code: 'scr_custom_mwakfl3f',
  pack_code: '0016880',
  game_name: 'Δώρο 5€',
  pieces: 60,
  unit_price: 5,
  received_at: '2026-11-10',
  status: 'PENDING_DELIVERY',
  ...over,
});

describe('everCounted', () => {
  it('ένας κωδικός που μόλις μπήκε δεν έχει μετρηθεί ποτέ', () => {
    expect(everCounted(DWRO_5)).toBe(false);
  });

  it('αρχικό νούμερο σημαίνει ότι τρέχει', () => {
    expect(everCounted(TRECHEI)).toBe(true);
  });

  it('κωδικός πακέτου σημαίνει ότι τρέχει', () => {
    expect(everCounted({ ...DWRO_5, packCode: '0016880' })).toBe(true);
  });

  it('ιστορικό πακέτων σημαίνει ότι τρέχει', () => {
    expect(everCounted({ ...DWRO_5, packHistory: [{ code: '0016880' }] })).toBe(true);
  });

  it('χρέωση από κλεισμένο πακέτο σημαίνει ότι τρέχει', () => {
    expect(everCounted({ ...DWRO_5, closedPackQty: 12 })).toBe(true);
  });

  it('μηδενική χρέωση δεν είναι ένδειξη ζωής', () => {
    expect(everCounted({ ...DWRO_5, closedPackQty: 0 })).toBe(false);
  });

  it('πώληση σε πεντάδες σημαίνει ότι τρέχει', () => {
    expect(everCounted({ ...DWRO_5, saleBundles: '3' })).toBe(true);
  });
});

describe('awaitingDelivery', () => {
  it('ΝΕΟΣ ΚΩΔΙΚΟΣ ΧΩΡΙΣ ΠΑΡΑΔΟΣΗ — δεν είναι διαθέσιμο για πώληση', () => {
    expect(
      awaitingDelivery({ row: DWRO_5, readyPacks: 0, warehouseInUse: true, isLottery: false })
    ).toBe(true);
  });

  it('μόλις η αποθήκη παραδώσει πακέτο, μπαίνει στον πάγκο', () => {
    expect(
      awaitingDelivery({ row: DWRO_5, readyPacks: 1, warehouseInUse: true, isLottery: false })
    ).toBe(false);
  });

  /** Το λάθος που κοστίζει: να κρυφτεί γραμμή που πουλάει. */
  it('παιχνίδι που τρέχει ΔΕΝ κρύβεται ποτέ, ό,τι κι αν λέει η αποθήκη', () => {
    expect(
      awaitingDelivery({ row: TRECHEI, readyPacks: 0, warehouseInUse: true, isLottery: false })
    ).toBe(false);
  });

  it('κατάστημα χωρίς αποθήκη δεν περιμένει παραδόσεις', () => {
    expect(
      awaitingDelivery({ row: DWRO_5, readyPacks: 0, warehouseInUse: false, isLottery: false })
    ).toBe(false);
  });

  it('τα λαχεία έχουν δική τους παραλαβή — δεν τα αγγίζει', () => {
    expect(
      awaitingDelivery({ row: { id: 'scr_laiko' }, readyPacks: 0, warehouseInUse: true, isLottery: true })
    ).toBe(false);
  });
});

describe('readyPackCount', () => {
  const packs = [
    pack({ id: 'a', status: 'PENDING_DELIVERY', pack_code: '0016880' }),
    pack({ id: 'b', status: 'IN_WAREHOUSE', pack_code: '0016881' }),
    pack({ id: 'c', status: 'PENDING_DELIVERY', pack_code: '0023359', catalog_code: 'scr_custom_mwakh5bs' }),
  ];

  it('μετράει μόνο τα παραδομένα του παιχνιδιού', () => {
    expect(readyPackCount(packs, 'scr_custom_mwakfl3f')).toBe(1);
  });

  it('το ράφι δεν είναι παράδοση', () => {
    expect(readyPackCount([pack({ status: 'IN_WAREHOUSE' })], 'scr_custom_mwakfl3f')).toBe(0);
  });

  it('άλλο παιχνίδι δεν μετράει', () => {
    expect(readyPackCount(packs, 'scr_2_gata')).toBe(0);
  });

  it('χωρίς αποθήκη, μηδέν', () => {
    expect(readyPackCount(null, 'scr_2_gata')).toBe(0);
  });
});

describe('ο κωδικός του ενεργού πακέτου', () => {
  it('λέει ποιο πακέτο τρέχει', () => {
    expect(activePackLabel({ packCode: '0040695' }, false)).toBe('πακέτο 0040695');
  });

  it('στα λαχεία είναι κλήρωση, όχι πακέτο', () => {
    expect(activePackLabel({ packCode: '2451' }, true)).toBe('κλήρωση 2451');
  });

  it('χωρίς κωδικό δεν επινοεί τίποτα', () => {
    expect(activePackLabel({ packCode: '' }, false)).toBe('');
    expect(activePackLabel({}, false)).toBe('');
    expect(activePackCode(null)).toBe('');
  });
});
