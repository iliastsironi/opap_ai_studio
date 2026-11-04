import { describe, expect, it } from 'vitest';
import {
  tailSoldOnNewPack,
  type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

const row = (over: Partial<ScratchTicketRow>): ScratchTicketRow =>
  ({ id: 'x', name: 'x', category: 'Σκρατς', price: 2, startNo: '', endNo: '', ...over }) as ScratchTicketRow;

describe('τι καταχωρεί το «νέο πακέτο» ως πώληση', () => {
  // Το ράφι ενός λαχείου ΕΙΝΑΙ το υπόλοιπο. Ο τύπος των σκρατς έβγαζε
  // «μέγεθος πακέτου − υπόλοιπο», δηλαδή όσο λιγότερα είχες τόσα
  // περισσότερα χρεωνόσουν: με άδειο ράφι, ολόκληρο πακέτο.
  it('σε λαχείο, τίποτα — όποιο κι αν είναι το υπόλοιπο', () => {
    for (const startNo of ['84', '15', '10', '5', '1', '0', '']) {
      expect(tailSoldOnNewPack(row({ category: 'Λαχεία', price: 20, startNo }))).toBe(0);
    }
  });

  it('σε κάθε λαχείο του καταλόγου, τίποτα', () => {
    for (const [id, price] of [
      ['scr_ethniko_x20', 20], ['scr_protochroniatiko', 5],
      ['scr_laiko', 2], ['scr_eidiki_x5', 1], ['scr_eidiki_x10', 2],
    ] as Array<[string, number]>) {
      expect(tailSoldOnNewPack(row({ id, category: 'Λαχεία', price, startNo: '3' }))).toBe(0);
    }
  });

  it('σε σκρατς, η ουρά του πακέτου όπως πάντα', () => {
    // 2 € -> πακέτο 150 δελτίων. Ανοιγμένο στη θέση 6, μένουν 144.
    expect(tailSoldOnNewPack(row({ price: 2, startNo: '6' }))).toBe(144);
    expect(tailSoldOnNewPack(row({ price: 2, startNo: '0' }))).toBe(150);
  });

  it('σε σκρατς με τιμή που δεν διαιρεί τα 300 €, ρωτάει', () => {
    // null = δεν ορίζεται μέγεθος πακέτου, το γράφει ο χειριστής.
    expect(tailSoldOnNewPack(row({ price: 7, startNo: '0' }))).toBeNull();
  });
});
