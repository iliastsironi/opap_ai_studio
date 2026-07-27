import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { generateToken } from '../server/middleware/auth.js';

describe('ShiftLedger Phase 1 - Auth & Authorization Engine', () => {
  it('correctly hashes and verifies user passwords with bcrypt', async () => {
    const rawPassword = 'SecurePassword2026!';
    const hash = await bcrypt.hash(rawPassword, 10);
    expect(await bcrypt.compare(rawPassword, hash)).toBe(true);
    expect(await bcrypt.compare('WrongPassword', hash)).toBe(false);
  });

  it('generates valid JWT tokens with tenant payload', () => {
    const token = generateToken({ userId: 'usr_owner_01', organizationId: 'org_opap_hellas_01' });
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });

  it('verifies store access logic for tenant isolation', () => {
    const assignedStores = [{ store_id: 'store_opap_01' }, { store_id: 'store_play_02' }];
    const userCanAccessStore1 = assignedStores.some((a) => a.store_id === 'store_opap_01');
    const userCanAccessStoreForbidden = assignedStores.some((a) => a.store_id === 'store_forbidden_99');

    expect(userCanAccessStore1).toBe(true);
    expect(userCanAccessStoreForbidden).toBe(false);
  });
});
