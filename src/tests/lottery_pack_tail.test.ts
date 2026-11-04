import { describe, expect, it } from 'vitest';
import {
  applyLotteryProductShapes,
  calculateRowTotal,
  clearLotteryPackTail,
  type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

const ethniko = (over: Partial<ScratchTicketRow> = {}): ScratchTicketRow =>
  ({
    id: 'scr_ethniko_x20', name: 'Εθνικό x 20€', category: 'Λαχεία',
    price: 20, bundleSize: 0, startNo: '84', endNo: '83', ...over,
  }) as ScratchTicketRow;

describe('η ουρά πακέτου που έμεινε σε λαχείο', () => {
  // Η γραμμή του Owner: 84 -> 83 με 336 κολλημένα από πίσω.
  it('84 → 83 είναι μία πεντάδα, 20 € — όχι 6.740 €', () => {
    const stuck = ethniko({ closedPackQty: 336 });
    expect(calculateRowTotal(stuck)).toBe(6740);

    const [clean] = applyLotteryProductShapes([stuck]);
    expect(clean.closedPackQty).toBe(0);
    expect(calculateRowTotal(clean)).toBe(20);
  });

  it('σβήνεται σε κάθε λαχείο, όχι μόνο στο Εθνικό', () => {
    const rows = ['scr_laiko', 'scr_eidiki_x5', 'scr_protochroniatiko', 'scr_kati_diko_mas'].map(
      (id) => ethniko({ id, category: 'Λαχεία', closedPackQty: 99 })
    );
    for (const r of clearLotteryPackTail(rows)) expect(r.closedPackQty).toBe(0);
  });

  it('τα σκρατς το κρατούν — εκεί είναι νόμιμο', () => {
    // 7 τέτοιες γραμμές υπάρχουν στη βάση και είναι αληθινές πωλήσεις.
    const scratch = ethniko({ id: 'scr_2_gata', name: 'ΓΑΤΑ', category: 'Σκρατς', price: 2, closedPackQty: 144 });
    expect(clearLotteryPackTail([scratch])[0].closedPackQty).toBe(144);
  });

  it('το ιστορικό παραλαβών μένει, με μηδενισμένες ποσότητες', () => {
    // Οι αριθμοί κλήρωσης είναι αρχείο· οι ποσότητες θα επανέφεραν το
    // υπόλειμμα σε μια αναίρεση, γιατί η αναίρεση διαβάζει το στιγμιότυπο.
    const row = ethniko({
      closedPackQty: 336,
      packHistory: [{ code: '2451', addedQty: 336, previous: { closedPackQty: 300 } as any }],
    } as Partial<ScratchTicketRow>);
    const [clean] = clearLotteryPackTail([row]);
    expect(clean.packHistory![0].code).toBe('2451');
    expect(clean.packHistory![0].addedQty).toBe(0);
    expect(clean.packHistory![0].previous.closedPackQty).toBe(0);
  });

  it('μια καθαρή γραμμή επιστρέφεται ως έχει', () => {
    const row = ethniko();
    expect(clearLotteryPackTail([row])[0]).toBe(row);
  });
});
