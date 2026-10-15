import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CREDIT_TIER_CONFIGS,
  getCustomerCreditLimit,
  validateCustomerCreditGrant,
} from '../services/customerCreditService.ts';
import { Customer, CreditScoreTier } from '../types/index.ts';

// «Τεφτέρι πελατών» decides, at the counter, whether a customer may take
// something on credit. It is the one pure money decision in the app that had
// no test at all: get it wrong one way and the shop lends past what it meant
// to, the other way and a good customer is refused in front of other people.

const customer = (over: Partial<Customer> = {}): Customer =>
  ({
    id: 'cust_1',
    organization_id: 'org_1',
    store_id: 'store_1',
    name: 'Πελάτης',
    tier: 'B' as CreditScoreTier,
    current_debt: 0,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  }) as Customer;

describe('credit limits per tier', () => {
  it('uses the tier default when no custom limit is set', () => {
    expect(getCustomerCreditLimit(customer({ tier: 'A' })).limit).toBe(300);
    expect(getCustomerCreditLimit(customer({ tier: 'B' })).limit).toBe(100);
    expect(getCustomerCreditLimit(customer({ tier: 'C' })).limit).toBe(30);
    expect(getCustomerCreditLimit(customer({ tier: 'A+' })).isUnlimited).toBe(true);
  });

  it('honours a custom limit of exactly 0', () => {
    // The dangerous reading is `custom_limit || defaultLimit`, which would turn
    // "this customer gets nothing" into the full tier limit - the most
    // permissive possible answer for the customer you least want it for. The
    // code tests for null/undefined instead, and this pins that.
    const barred = customer({ tier: 'A', custom_limit: 0 });
    expect(getCustomerCreditLimit(barred).limit).toBe(0);
    expect(validateCustomerCreditGrant(barred, 1).allowed).toBe(false);
  });

  it('lets a custom limit override an unlimited tier', () => {
    const vipCapped = customer({ tier: 'A+', custom_limit: 50 });
    expect(getCustomerCreditLimit(vipCapped).isUnlimited).toBe(false);
    expect(validateCustomerCreditGrant(vipCapped, 60).allowed).toBe(false);
  });
});

describe('granting credit', () => {
  it('allows a grant that lands exactly on the limit', () => {
    // 100 is «έως 100€», so spending the last euro of it is allowed. An
    // exclusive test here would refuse the round number every time.
    const r = validateCustomerCreditGrant(customer({ current_debt: 60 }), 40);
    expect(r.allowed).toBe(true);
    expect(r.totalNewDebt).toBe(100);
    expect(r.excessAmount).toBe(0);
  });

  it('refuses the euro past it, and says what would have to be paid', () => {
    const r = validateCustomerCreditGrant(customer({ current_debt: 60 }), 41);
    expect(r.allowed).toBe(false);
    expect(r.availableCredit).toBe(40);
    expect(r.excessAmount).toBe(1);
    expect(r.errorMessage).toContain('40.00');
  });

  it('offers nothing to someone already past their limit', () => {
    // Happens by downgrade or by a lowered limit, not by overspending: the
    // debt stays and the ceiling moves under it. availableCredit must not go
    // negative, or the «μέγιστη νέα πίστωση» line would offer a negative euro.
    const r = validateCustomerCreditGrant(customer({ tier: 'C', current_debt: 50 }), 5);
    expect(r.allowed).toBe(false);
    expect(r.availableCredit).toBe(0);
    expect(r.excessAmount).toBe(25);
  });

  it('never blocks an A+ customer', () => {
    const r = validateCustomerCreditGrant(customer({ tier: 'A+', current_debt: 5000 }), 1000);
    expect(r.allowed).toBe(true);
    expect(r.isUnlimited).toBe(true);
    expect(r.totalNewDebt).toBe(6000);
    expect(r.errorMessage).toBeUndefined();
  });

  it('warns when the grant leaves almost nothing, but still allows it', () => {
    const r = validateCustomerCreditGrant(customer({ current_debt: 60 }), 35);
    expect(r.allowed).toBe(true);
    expect(r.warningMessage).toContain('5.00');
  });

  it('falls back to the B tier for an unknown tier rather than throwing', () => {
    const odd = customer({ tier: 'Z' as CreditScoreTier });
    expect(getCustomerCreditLimit(odd).limit).toBe(DEFAULT_CREDIT_TIER_CONFIGS['B'].defaultLimit);
  });
});
