import { describe, expect, it } from 'vitest';
import { searchNationalLotteryCustomers, NATIONAL_LOTTERY_DISPLAY_PRICES } from '../services/nationalLotteryService.ts';
import { NationalLotteryCustomer } from '../types/index.ts';

// The rest of nationalLotteryService.ts is I/O (Supabase calls) and is
// covered by direct SQL/RPC verification against a real Postgres instance
// instead (see supabase/migrations - this codebase has no SQL test
// harness yet, flagged as a known process gap). This file covers the one
// genuinely pure piece: the client-side search filter.

function customer(overrides: Partial<NationalLotteryCustomer> = {}): NationalLotteryCustomer {
  return {
    id: 'nlc_1', organization_id: 'org_1', store_id: 'store_1',
    full_name: 'Γιώργος Παπαδόπουλος', phone: '6912345678', lottery_number: '4471',
    participation_type: 'FIVE', status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('searchNationalLotteryCustomers', () => {
  const list = [
    customer({ id: 'a', full_name: 'Γιώργος Παπαδόπουλος', phone: '6912345678', lottery_number: '4471' }),
    customer({ id: 'b', full_name: 'Μαρία Ιωάννου', phone: '6987654321', lottery_number: '1029' }),
  ];

  it('returns everything for an empty/blank query', () => {
    expect(searchNationalLotteryCustomers(list, '')).toHaveLength(2);
    expect(searchNationalLotteryCustomers(list, '   ')).toHaveLength(2);
  });

  it('matches by name substring, case-insensitive', () => {
    expect(searchNationalLotteryCustomers(list, 'γιωργο')).toHaveLength(0); // Greek diacritics not normalized - documents current behavior
    expect(searchNationalLotteryCustomers(list, 'Γιώργος')).toEqual([list[0]]);
    expect(searchNationalLotteryCustomers(list, 'ιωάννου')).toEqual([list[1]]);
  });

  it('matches by phone substring', () => {
    expect(searchNationalLotteryCustomers(list, '9876')).toEqual([list[1]]);
  });

  it('matches by lottery number substring', () => {
    expect(searchNationalLotteryCustomers(list, '447')).toEqual([list[0]]);
  });

  it('returns nothing for a query matching no field', () => {
    expect(searchNationalLotteryCustomers(list, 'nonexistent')).toEqual([]);
  });
});

describe('NATIONAL_LOTTERY_DISPLAY_PRICES (non-authoritative preview only)', () => {
  it('matches the spec: 5άδα=20€/draw, 10άδα=40€/draw', () => {
    expect(NATIONAL_LOTTERY_DISPLAY_PRICES.FIVE).toBe(20);
    expect(NATIONAL_LOTTERY_DISPLAY_PRICES.TEN).toBe(40);
  });
});
