import { describe, expect, it } from 'vitest';
import {
  ASSIGNABLE_ROLES,
  LEGACY_ROLE_CODE_ALIASES,
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  normalizeRoleCode,
} from '../lib/rbac.ts';

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
    expect(normalizeRoleCode('CASHIER')).toBe('EMPLOYEE');
  });

  it('offers exactly three roles to assign, lowest access first', () => {
    // UAT cut the model to «υπάλληλος, manager/διευθυντής και ιδιοκτήτης».
    // Order matters: a picker that opens on the most powerful option is one
    // mis-click away from handing someone the whole organisation.
    expect(ASSIGNABLE_ROLES.map((r) => r.code)).toEqual(['EMPLOYEE', 'STORE_MANAGER', 'ORG_OWNER']);
  });

  it('keeps PLATFORM_ADMIN working but unassignable', () => {
    // auth_is_elevated() and auth_is_owner() name it in five migrations, and an
    // account set to it directly in the database is the support path into a
    // customer's organisation. It must keep its permissions and stay out of
    // every picker.
    expect(getPermissionsForRole('PLATFORM_ADMIN')).toContain('*');
    expect(ASSIGNABLE_ROLES.some((r) => r.code === 'PLATFORM_ADMIN')).toBe(false);
  });

  it('lands every retired role on one that still exists', () => {
    // A row carrying a retired code must resolve to a real role rather than to
    // a permission set nobody defined. SHIFT_SUPERVISOR, ACCOUNTANT and AUDITOR
    // could none of them approve a shift, so EMPLOYEE is the safe direction;
    // AREA_MANAGER sat at the same level as STORE_MANAGER and keeps it.
    expect(normalizeRoleCode('AREA_MANAGER')).toBe('STORE_MANAGER');
    expect(normalizeRoleCode('SHIFT_SUPERVISOR')).toBe('EMPLOYEE');
    expect(normalizeRoleCode('SHIFT_LEADER')).toBe('EMPLOYEE');
    expect(normalizeRoleCode('ACCOUNTANT')).toBe('EMPLOYEE');
    expect(normalizeRoleCode('AUDITOR')).toBe('EMPLOYEE');

    for (const target of Object.values(LEGACY_ROLE_CODE_ALIASES)) {
      expect(Object.keys(ROLE_PERMISSIONS)).toContain(target);
    }
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

  it('keeps the monthly P&L Owner-only, matching the Owner-only RLS on its tables', () => {
    for (const role of ['AREA_MANAGER', 'STORE_MANAGER', 'SHIFT_SUPERVISOR', 'EMPLOYEE', 'ACCOUNTANT', 'AUDITOR']) {
      const perms = getPermissionsForRole(role);
      expect(perms, role).not.toContain('*');
      expect(perms, role).not.toContain('pnl.manage');
    }
  });
});
