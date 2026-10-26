import { describe, expect, it } from 'vitest';
import {
  canWorkAtStore,
  isElevatedRole,
  visibleStores,
} from '../lib/storeAccess.ts';

const STORES = [{ id: 'store_shop' }, { id: 'store_play' }];
const atShop = [{ store_id: 'store_shop' }];

describe('which stores an employee is offered', () => {
  it('offers only the shop they are assigned to', () => {
    expect(visibleStores(STORES, atShop, false)).toEqual([{ id: 'store_shop' }]);
  });

  // The hole. An empty assignment list read as «no restriction», so the
  // least-configured account reached every shop in the company.
  it('offers NOTHING to somebody who has not been placed anywhere', () => {
    expect(visibleStores(STORES, [], false)).toEqual([]);
    expect(visibleStores(STORES, null, false)).toEqual([]);
  });

  it('ignores a blank or missing store id in an assignment', () => {
    expect(visibleStores(STORES, [{ store_id: '' }, { store_id: null }], false)).toEqual([]);
    expect(visibleStores(STORES, [{ store_id: ' store_play ' }], false)).toEqual([{ id: 'store_play' }]);
  });

  it('offers every shop to somebody assigned to every shop', () => {
    expect(visibleStores(STORES, [{ store_id: 'store_shop' }, { store_id: 'store_play' }], false))
      .toHaveLength(2);
  });

  it('drops an assignment to a store that no longer exists', () => {
    expect(visibleStores(STORES, [{ store_id: 'store_gone' }], false)).toEqual([]);
  });
});

describe('an Owner is not limited by their own assignment', () => {
  // Exactly this shop's situation: the Owner is assigned to one store and
  // owns two. Limiting them to the assignment would hide half their business.
  it('offers every shop regardless of assignments', () => {
    expect(visibleStores(STORES, atShop, true)).toHaveLength(2);
    expect(visibleStores(STORES, [], true)).toHaveLength(2);
  });

  it('hands back a copy, never the caller’s own array', () => {
    const out = visibleStores(STORES, [], true);
    expect(out).not.toBe(STORES);
  });
});

describe('whether one particular till is theirs to work', () => {
  it('says yes for the shop they are assigned to', () => {
    expect(canWorkAtStore('store_shop', atShop, false)).toBe(true);
  });

  it('says no for any other shop', () => {
    expect(canWorkAtStore('store_play', atShop, false)).toBe(false);
  });

  it('says no when no store was chosen at all', () => {
    expect(canWorkAtStore('', atShop, false)).toBe(false);
    expect(canWorkAtStore(null, atShop, false)).toBe(false);
  });

  it('always says yes to an elevated role', () => {
    expect(canWorkAtStore('store_play', [], true)).toBe(true);
  });
});

describe('who counts as elevated', () => {
  it('matches the roles auth_is_elevated() allows', () => {
    for (const code of ['ORG_OWNER', 'PLATFORM_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER', 'ORG_ADMIN']) {
      expect(isElevatedRole([{ code }])).toBe(true);
    }
  });

  it('does not include an employee', () => {
    expect(isElevatedRole([{ code: 'EMPLOYEE' }])).toBe(false);
    expect(isElevatedRole([])).toBe(false);
    expect(isElevatedRole(null)).toBe(false);
  });

  it('honours a wildcard permission', () => {
    expect(isElevatedRole([{ code: 'EMPLOYEE' }], ['*'])).toBe(true);
  });
});
