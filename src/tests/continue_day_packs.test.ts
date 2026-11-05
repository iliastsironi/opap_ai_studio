import { describe, expect, it } from 'vitest';
import {
  calculateRowQty, continueDayScratchInventory, type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

const catalog: ScratchTicketRow[] = [
  { id: 'scr_2_7ari', name: '7ΑΡΙ', category: 'Σκρατς', price: 2, startNo: '', endNo: '' },
];

/** Το άνοιγμα της ημέρας: πακέτο Α, θέση 6. */
const dayOpening = [
  { id: 'scr_2_7ari', name: '7ΑΡΙ', category: 'Σκρατς', price: 2, startNo: '6', endNo: '', packCode: '1111111' },
];

/** Η πρωινή τελείωσε το Α (ουρά 144) και άνοιξε το Β, που έφτασε στο 20. */
const morningClose = [
  {
    id: 'scr_2_7ari', name: '7ΑΡΙ', category: 'Σκρατς', price: 2,
    startNo: '0', endNo: '20', packCode: '2222222',
    closedPackQty: 144, closedPackCodes: ['1111111'],
    packHistory: [{ code: '2222222', addedQty: 144, previous: {} as any }],
  },
];

describe('η βραδινή μετά από αλλαγή πακέτου στην πρωινή', () => {
  it('κρατάει την ουρά του παλιού πακέτου', () => {
    // Χωρίς αυτό, 144 δελτία × 2 € = 288 € έφευγαν από το σύνολο της ημέρας.
    const [row] = continueDayScratchInventory(dayOpening, catalog, morningClose);
    expect(row.closedPackQty).toBe(144);
    expect(row.closedPackCodes).toEqual(['1111111']);
  });

  it('ξεκινάει από το πακέτο που είναι ΟΝΤΩΣ στον πάγκο', () => {
    const [row] = continueDayScratchInventory(dayOpening, catalog, morningClose);
    expect(row.packCode).toBe('2222222');
    expect(row.startNo).toBe('0');
  });

  it('το σύνολο της ημέρας βγαίνει σωστό', () => {
    // Η βραδινή φτάνει στο 35 του πακέτου Β: 144 ουρά + 35 = 179 δελτία.
    const [row] = continueDayScratchInventory(dayOpening, catalog, morningClose);
    expect(calculateRowQty({ ...row, endNo: '35' })).toBe(179);
  });

  it('δεν αναιρεί πακέτο που άνοιξε η πρωινή', () => {
    // Κενό ιστορικό: η κληρονομημένη ουρά δεν αφαιρείται κατά λάθος.
    const [row] = continueDayScratchInventory(dayOpening, catalog, morningClose);
    expect(row.packHistory).toEqual([]);
  });
});

describe('όταν δεν άλλαξε πακέτο', () => {
  const morningNoChange = [
    { id: 'scr_2_7ari', name: '7ΑΡΙ', category: 'Σκρατς', price: 2, startNo: '6', endNo: '14', packCode: '1111111' },
  ];

  it('τίποτα δεν αλλάζει — ξεκινά από το άνοιγμα της ημέρας', () => {
    const [row] = continueDayScratchInventory(dayOpening, catalog, morningNoChange);
    expect(row.startNo).toBe('6');
    expect(row.packCode).toBe('1111111');
    expect(row.closedPackQty).toBe(0);
  });
});

describe('χωρίς προηγούμενη βάρδια', () => {
  it('πέφτει πίσω στο άνοιγμα της ημέρας, όπως πριν', () => {
    const [row] = continueDayScratchInventory(dayOpening, catalog, null);
    expect(row.startNo).toBe('6');
    expect(row.packCode).toBe('1111111');
  });

  it('χωρίς τίποτα, ο κατάλογος', () => {
    expect(continueDayScratchInventory(undefined, catalog, null)[0].id).toBe('scr_2_7ari');
  });
});
