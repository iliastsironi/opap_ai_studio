import { describe, expect, it } from 'vitest';
import {
  calculateRowQty,
  calculateRowTotal,
  type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

// Λαϊκό: 2 € the ticket, five to a πεντάδα, so a πεντάδα is 10 €.
// A Λαχείο row's startNo/endNo are REMAINING counts, not serials: a sale is
// a decrease. The shop's standing order is 40 πεντάδες = 200 pieces.
const laiko = (over: Partial<ScratchTicketRow> = {}): ScratchTicketRow => ({
  id: 'scr_laiko',
  name: 'Λαϊκό Λαχείο',
  category: 'Λαχεία',
  price: 2,
  bundleSize: 5,
  startNo: '200',
  endNo: '',
  ...over,
});

describe('tickets the draw did not sell are not charged', () => {
  it('charges nothing when the whole shelf went back', () => {
    // Nothing sold all week, all 40 πεντάδες cancelled on the day.
    const row = laiko({ endNo: '0', cancelledBundles: '40' });
    expect(calculateRowQty(row)).toBe(0);
    expect(calculateRowTotal(row)).toBe(0);
  });

  // The Owner's rule. Three πεντάδες that went back neither to OPAP nor onto
  // the shelf were sold, and are charged like any other sale.
  it('charges exactly the πεντάδες that did not go back', () => {
    const row = laiko({ endNo: '0', cancelledBundles: '37' });
    expect(calculateRowQty(row)).toBe(15);     // 3 πεντάδες × 5
    expect(calculateRowTotal(row)).toBe(30);   // × 2 €
  });

  it('charges the lot when nothing was cancelled', () => {
    const row = laiko({ endNo: '0' });
    expect(calculateRowQty(row)).toBe(200);
    expect(calculateRowTotal(row)).toBe(400);
  });

  // The sales made before the draw still count - cancelling only writes off
  // what was still on the shelf at the end.
  it('keeps the week’s real sales on top of the cancellation', () => {
    // 200 on the shelf, 60 pieces sold during the week, 28 πεντάδες (140)
    // cancelled on the day. 200 - 140 = 60 charged.
    const row = laiko({ endNo: '0', cancelledBundles: '28' });
    expect(calculateRowQty(row)).toBe(60);
    expect(calculateRowTotal(row)).toBe(120);
  });

  it('never goes negative when more was cancelled than the shelf held', () => {
    const row = laiko({ endNo: '0', cancelledBundles: '99' });
    expect(calculateRowQty(row)).toBe(0);
    expect(calculateRowTotal(row)).toBe(0);
  });

  it('leaves an ordinary row alone when nothing was cancelled at all', () => {
    // 200 on the shelf, 185 left: 15 sold, and no cancellation anywhere.
    const row = laiko({ endNo: '185' });
    expect(calculateRowQty(row)).toBe(15);
    expect(calculateRowTotal(row)).toBe(30);
  });

  it('ignores a blank or rubbish cancellation', () => {
    expect(calculateRowQty(laiko({ endNo: '185', cancelledBundles: '' }))).toBe(15);
    expect(calculateRowQty(laiko({ endNo: '185', cancelledBundles: 'ουπς' }))).toBe(15);
  });
});
