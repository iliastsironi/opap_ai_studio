import { describe, expect, it } from 'vitest';
import {
  applyEthnikoShape, isEthnikoRow, lotteryUnitLabel, canToggleBundleTracking,
  ETHNIKO_ROW_ID, ETHNIKO_BUNDLE_PRICE, ETHNIKO_BUNDLE_SIZE, ETHNIKO_PIECE_PRICE,
} from '../lib/ethnikoLottery.ts';

const ethniko = (over: Record<string, unknown> = {}) => ({
  id: ETHNIKO_ROW_ID, name: 'Εθνικό x 20€', category: 'Λαχεία',
  price: 20, startNo: '47', endNo: '', ...over,
}) as any;

describe('the shape is pinned, whatever the row arrived as', () => {
  it('counts κομμάτια at 4 €, πέντε η πεντάδα', () => {
    const [row] = applyEthnikoShape([ethniko()]);
    expect(row.price).toBe(ETHNIKO_PIECE_PRICE);
    expect(row.bundleSize).toBe(ETHNIKO_BUNDLE_SIZE);
    expect(ETHNIKO_BUNDLE_PRICE).toBe(20);
  });

  it('undoes the 20 € a tick the row used to carry', () => {
    // Ο αριθμός προχωράει ανά κομμάτι, άρα ένα βήμα είναι 4 €, όχι 20 €.
    const [row] = applyEthnikoShape([ethniko({ price: 20, bundleSize: 0 })]);
    expect(row.price).toBe(4);
    expect(row.bundleSize).toBe(5);
  });

  it('clears dual-entry figures left behind by it', () => {
    const [row] = applyEthnikoShape([ethniko({ bundleSize: 5, saleBundles: '3', salePieces: '2' })]);
    expect(row.saleBundles).toBe('');
    expect(row.salePieces).toBe('');
  });

  it('fixes a price somebody had edited away', () => {
    const [row] = applyEthnikoShape([ethniko({ price: 7 })]);
    expect(row.price).toBe(4);
  });

  it('does not check whether it is already set', () => {
    // A stale 0 from a cached catalogue would otherwise stay forever, which
    // is the fault being fixed.
    const [row] = applyEthnikoShape([ethniko({ bundleSize: 0, price: 100 })]);
    expect(row.price).toBe(4);
    expect(row.bundleSize).toBe(5);
  });

  it('leaves every other game alone', () => {
    const rows = [
      { id: 'scr_laiko', price: 2, bundleSize: 5 },
      { id: 'scr_5_gata', price: 5 },
    ] as any[];
    expect(applyEthnikoShape(rows)).toEqual(rows);
  });
});

// Ο αριθμός μετράει κομμάτια - το είπε ο Owner κοιτώντας το ταμείο.
//
// Το αρχείο αυτό υποστήριζε το αντίθετο, και αυτά τα δύο tests φύλαγαν
// εκείνη την ανάγνωση. Κρατιούνται γυρισμένα ανάποδα, με τα ίδια αληθινά
// νούμερα, γιατί η διαφορά είναι ό,τι ξαναδιαβάζεται σε κλεισμένες βάρδιες:
// οι 12 κινήσεις που υπάρχουν έπιαναν 500 € ως πεντάδες και πιάνουν 100 €
// ως κομμάτια. Τα αποθηκευμένα σύνολα των βαρδιών δεν ακουμπιούνται - το
// scratch_lotto_sales είναι στήλη, όχι υπολογισμός - οπότε αλλάζει μόνο το
// τι δείχνει η γραμμή μέσα στην καρτέλα.
describe('τι διαβάζει πια ένας αριθμός που υπάρχει', () => {
  it('53 → 49 είναι τέσσερα κομμάτια, 16 €', () => {
    const [row] = applyEthnikoShape([ethniko({ startNo: '53', endNo: '49' })]);
    const sold = Number(row.startNo) - Number(row.endNo);
    expect(sold).toBe(4);
    expect(sold * Number(row.price)).toBe(16);
  });

  it('πέντε βήματα είναι μία πεντάδα, 20 €', () => {
    const [row] = applyEthnikoShape([ethniko({ startNo: '53', endNo: '48' })]);
    const sold = Number(row.startNo) - Number(row.endNo);
    expect(sold * Number(row.price)).toBe(ETHNIKO_BUNDLE_PRICE);
  });
});

describe('how it is presented', () => {
  it('calls the unit a πεντάδα, not a κομμάτι', () => {
    expect(lotteryUnitLabel(ethniko())).toBe('πεντάδα');
    expect(lotteryUnitLabel({ id: 'scr_laiko' })).toBeNull();
  });

  it('offers no πεντάδες + κομμάτια toggle, so it cannot drift again', () => {
    expect(canToggleBundleTracking(ethniko())).toBe(false);
    expect(canToggleBundleTracking({ id: 'scr_laiko' })).toBe(true);
  });

  it('recognises the row and nothing else', () => {
    expect(isEthnikoRow(ethniko())).toBe(true);
    expect(isEthnikoRow({ id: 'scr_eidiki_x10' })).toBe(false);
    expect(isEthnikoRow(null)).toBe(false);
  });
});

describe('the Greek', () => {
  it('pluralises the unit properly', async () => {
    const { lotteryUnitLabelPlural } = await import('../lib/ethnikoLottery.ts');
    // «πεντάδα» + «ες» is not a word.
    expect(lotteryUnitLabelPlural(ethniko())).toBe('πεντάδες');
    expect(lotteryUnitLabelPlural({ id: 'scr_laiko' })).toBeNull();
  });
});
