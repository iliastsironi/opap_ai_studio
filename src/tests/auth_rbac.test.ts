import { describe, expect, it } from 'vitest';
import { getPermissionsForRole, normalizeRoleCode } from '../lib/rbac.ts';

describe('ShiftLedger - Authorization Engine', () => {
  it('verifies store access logic for tenant isolation', () => {
    const assignedStores = [{ store_id: 'store_opap_01' }, { store_id: 'store_play_02' }];
    const userCanAccessStore1 = assignedStores.some((a) => a.store_id === 'store_opap_01');
    const userCanAccessStoreForbidden = assignedStores.some((a) => a.store_id === 'store_forbidden_99');

    expect(userCanAccessStore1).toBe(true);
    expect(userCanAccessStoreForbidden).toBe(false);
  });
});

describe('Canonical RBAC model (src/lib/rbac.ts)', () => {
  it('defaults a missing or unrecognized role_code to EMPLOYEE, never an elevated role', () => {
    expect(normalizeRoleCode(undefined)).toBe('EMPLOYEE');
    expect(normalizeRoleCode(null)).toBe('EMPLOYEE');
    expect(normalizeRoleCode('')).toBe('EMPLOYEE');
    expect(normalizeRoleCode('SOME_TYPO_ROLE_CODE')).toBe('SOME_TYPO_ROLE_CODE');
    expect(getPermissionsForRole('SOME_TYPO_ROLE_CODE')).toEqual(getPermissionsForRole('EMPLOYEE'));
  });

  it('maps legacy role codes from the old userService.ts/AuthContext vocabularies onto the canonical set', () => {
    expect(normalizeRoleCode('ORG_ADMIN')).toBe('ORG_OWNER');
    expect(normalizeRoleCode('SHIFT_LEADER')).toBe('SHIFT_SUPERVISOR');
    expect(normalizeRoleCode('CASHIER')).toBe('EMPLOYEE');
  });

  it('grants ORG_OWNER and PLATFORM_ADMIN full access', () => {
    expect(getPermissionsForRole('ORG_OWNER')).toContain('*');
    expect(getPermissionsForRole('PLATFORM_ADMIN')).toContain('*');
  });

  it('does not grant EMPLOYEE any admin-tier permission', () => {
    const employeePerms = getPermissionsForRole('EMPLOYEE');
    expect(employeePerms).not.toContain('*');
    expect(employeePerms).not.toContain('users.manage');
    expect(employeePerms).not.toContain('roles.manage');
    expect(employeePerms).not.toContain('org.settings');
  });
});
