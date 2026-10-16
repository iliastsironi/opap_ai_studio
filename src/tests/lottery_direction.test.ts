import { describe, expect, it } from 'vitest';
import {
  calculateRowQty,
  validateScratchRow,
  type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

// A lottery figure is a remaining count, not a position in a pack: 15 tickets
// become 14 when one is sold. The formula was Math.abs, so it counted either
// direction - 15 typed as 16 read as one sold, and nothing on screen said so.
const lottery = (over: Partial<ScratchTicketRow> = {}): ScratchTicketRow =>
  ({
    id: 'scr_laxeio', name: 'Λαχείο', category: 'Λαχεία', price: 10,
    startNo: '15', endNo: '', ...over,
  }) as ScratchTicketRow;

describe('a lottery sale only goes downwards', () => {
  it('counts the drop from the opening stock', () => {
    expect(calculateRowQty(lottery({ startNo: '15', endNo: '14' }))).toBe(1);
    expect(calculateRowQty(lottery({ startNo: '50', endNo: '30' }))).toBe(20);
  });

  it('counts nothing when the stock went up', () => {
    // 15 -> 16 is a delivery or a slip of the finger, not a sale, and used to
    // be charged as one ticket sold.
    expect(calculateRowQty(lottery({ startNo: '15', endNo: '16' }))).toBe(0);
    expect(calculateRowQty(lottery({ startNo: '0', endNo: '12' }))).toBe(0);
  });

  it('says so, rather than quietly reading zero', () => {
    const issues = validateScratchRow(lottery({ startNo: '15', endNo: '16' }));
    expect(issues.isValid).toBe(false);
    expect(issues.errors.some((e) => e.severity === 'error')).toBe(true);
    expect(issues.errors[0].message).toContain('16');
    expect(issues.errors[0].message).toContain('15');
  });

  it('has nothing to say about a stock that went down', () => {
    expect(validateScratchRow(lottery({ startNo: '15', endNo: '14' })).isValid).toBe(true);
    expect(validateScratchRow(lottery({ startNo: '15', endNo: '15' })).errors).toEqual([]);
  });

  it('waits for a closing figure before judging anything', () => {
    expect(validateScratchRow(lottery({ startNo: '15', endNo: '' })).errors).toEqual([]);
    expect(calculateRowQty(lottery({ startNo: '15', endNo: '' }))).toBe(0);
  });

  it('leaves scratch cards alone, which do count upwards', () => {
    // A scratch card's figures are positions in a pack: 000 to 010 is ten sold.
    const scratch = {
      id: 'scr_2_gata', name: 'ΓΑΤΑ', category: 'Σκρατς 2€', price: 2,
      startNo: '0', endNo: '10',
    } as ScratchTicketRow;
    expect(calculateRowQty(scratch)).toBe(10);
  });
});
