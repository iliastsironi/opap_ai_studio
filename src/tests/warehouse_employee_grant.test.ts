import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  GRANTABLE_PERMISSIONS,
  WAREHOUSE_MANAGE_PERMISSION,
  WAREHOUSE_VIEW_PERMISSION,
  canGrantExtraPermissions,
  hasWarehouseGrant,
  mergePermissions,
  normalizeExtraPermissions,
  offersWarehouseGrant,
  withWarehouseGrant,
} from '../lib/extraPermissions.ts';
import { ROLE_PERMISSIONS, SYSTEM_PERMISSIONS } from '../lib/rbac.ts';

/**
 * «Διαχείριση αποθήκης να μπορούμε να δώσουμε access σε κάποιο υπάλληλο, όχι μόνο ο admin.»
 */
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf-8');

describe('το δικαίωμα ανά χρήστη', () => {
  it('μόνο γνωστές τιμές περνάνε, χωρίς διπλές', () => {
    expect(normalizeExtraPermissions([WAREHOUSE_MANAGE_PERMISSION, WAREHOUSE_MANAGE_PERMISSION, 'org.settings', '*', 42])).toEqual([
      WAREHOUSE_MANAGE_PERMISSION,
    ]);
  });

  it('ό,τι δεν είναι λίστα είναι κενό', () => {
    for (const bad of [null, undefined, 'scratch_warehouse.manage', {}, 5]) expect(normalizeExtraPermissions(bad)).toEqual([]);
  });

  it('κανένα δικαίωμα δεν μπορεί να δοθεί με τη στήλη πέρα από αυτό: ούτε «*»', () => {
    expect(GRANTABLE_PERMISSIONS).toEqual([WAREHOUSE_MANAGE_PERMISSION]);
    expect(mergePermissions(['store.view'], ['*'])).toEqual(['store.view']);
    expect(mergePermissions(['store.view'], ['users.manage', 'roles.manage'])).toEqual(['store.view']);
  });

  it('ο υπάλληλος με το δικαίωμα βλέπει το μενού της αποθήκης και μπορεί να τη χειριστεί', () => {
    const merged = mergePermissions(ROLE_PERMISSIONS.EMPLOYEE, [WAREHOUSE_MANAGE_PERMISSION]);
    expect(merged).toContain(WAREHOUSE_MANAGE_PERMISSION);
    expect(merged).toContain(WAREHOUSE_VIEW_PERMISSION);
  });

  it('ένας απλός υπάλληλος χωρίς δικαίωμα δεν βλέπει την αποθήκη', () => {
    const merged = mergePermissions(ROLE_PERMISSIONS.EMPLOYEE, []);
    expect(merged).not.toContain(WAREHOUSE_VIEW_PERMISSION);
    expect(merged).not.toContain(WAREHOUSE_MANAGE_PERMISSION);
  });

  it('παίρνει ΜΟΝΟ αυτό: τα υπόλοιπα δικαιώματα του ρόλου μένουν ίδια', () => {
    const base = ROLE_PERMISSIONS.EMPLOYEE;
    const merged = mergePermissions(base, [WAREHOUSE_MANAGE_PERMISSION]);
    expect(merged.filter((p) => !base.includes(p)).sort()).toEqual([WAREHOUSE_MANAGE_PERMISSION, WAREHOUSE_VIEW_PERMISSION].sort());
  });

  it('ο ιδιοκτήτης (μπαλαντέρ) δεν επηρεάζεται', () => {
    expect(mergePermissions(['*'], [])).toEqual(['*']);
  });

  it('ο διακόπτης ανάβει και σβήνει χωρίς να χαλάει τα υπόλοιπα', () => {
    expect(withWarehouseGrant([], true)).toEqual([WAREHOUSE_MANAGE_PERMISSION]);
    expect(withWarehouseGrant([WAREHOUSE_MANAGE_PERMISSION], false)).toEqual([]);
    expect(withWarehouseGrant([WAREHOUSE_MANAGE_PERMISSION], true)).toEqual([WAREHOUSE_MANAGE_PERMISSION]);
    expect(hasWarehouseGrant(withWarehouseGrant(null, true))).toBe(true);
    expect(hasWarehouseGrant(withWarehouseGrant([WAREHOUSE_MANAGE_PERMISSION], false))).toBe(false);
  });

  it('ποιος το δίνει: διευθυντής και πάνω, όχι υπάλληλος', () => {
    for (const r of ['ORG_OWNER', 'ORG_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER', 'PLATFORM_ADMIN']) {
      expect(canGrantExtraPermissions([r]), r).toBe(true);
    }
    expect(canGrantExtraPermissions(['EMPLOYEE'])).toBe(false);
    expect(canGrantExtraPermissions([])).toBe(false);
    expect(canGrantExtraPermissions(null)).toBe(false);
  });

  it('η επιλογή προσφέρεται μόνο σε όποιον δεν είναι ήδη διευθυντής', () => {
    expect(offersWarehouseGrant('EMPLOYEE')).toBe(true);
    expect(offersWarehouseGrant('SHIFT_SUPERVISOR')).toBe(true);
    expect(offersWarehouseGrant('STORE_MANAGER')).toBe(false);
    expect(offersWarehouseGrant('ORG_OWNER')).toBe(false);
  });
});

describe('ο κατάλογος δικαιωμάτων', () => {
  it('το scratch_warehouse.manage υπάρχει στον κατάλογο', () => {
    expect(SYSTEM_PERMISSIONS.some((p) => p.code === WAREHOUSE_MANAGE_PERMISSION)).toBe(true);
  });

  it('και δεν δίνεται σε κανέναν ρόλο: δίνεται μόνο ανά χρήστη', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      if (perms.includes('*')) continue;
      expect(perms, role).not.toContain(WAREHOUSE_MANAGE_PERMISSION);
    }
  });
});

describe('η οθόνη', () => {
  const auth = read('src/context/AuthContext.tsx');
  const users = read('src/components/admin/UsersManager.tsx');

  it('κατά τη σύνδεση τα δικαιώματα του ρόλου συγχωνεύονται με ό,τι του δόθηκε', () => {
    expect(auth).toContain('setPermissions(mergePermissions(activePerms, uData?.extra_permissions));');
  });

  it('η επεξεργασία χρήστη έχει διακόπτη, μόνο για όποιον δεν είναι ήδη διευθυντής', () => {
    expect(users).toContain('data-testid="warehouse-grant"');
    expect(users).toContain('{offersWarehouseGrant(editRoleCode) && (');
    expect(users).toContain('Διαχείριση Αποθήκης Σκρατς');
  });

  it('η στήλη στέλνεται ΜΟΝΟ όταν άλλαξε: μια κανονική αλλαγή δεν εξαρτάται από το 0091', () => {
    expect(users).toMatch(/\.\.\.\(editWarehouse !== hasWarehouseGrant\(editingUser\.extra_permissions\)\s*\?\s*\{ extra_permissions: withWarehouseGrant\(editingUser\.extra_permissions, editWarehouse\) \}\s*:\s*\{\}\)/);
  });

  it('η αποθήκη εμφανίζεται στο μενού σε όποιον έχει scratch_warehouse.view', () => {
    expect(read('src/components/layout/Sidebar.tsx')).toContain("perm: 'scratch_warehouse.view'");
  });
});

describe('η μετανάστευση 0091 (η βάση είναι η πύλη)', () => {
  const sql = read('supabase/migrations/0091_one_employee_can_run_the_warehouse.sql');

  it('προσθέτει τη στήλη με προεπιλογή κενή λίστα', () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS extra_permissions TEXT[] NOT NULL DEFAULT '{}'");
  });

  it('η επιτρεπόμενη λίστα της βάσης είναι ίδια με της οθόνης', () => {
    const m = sql.match(/WHERE p IN \(([^)]+)\)/)!;
    const dbList = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(dbList).toEqual([...GRANTABLE_PERMISSIONS]);
  });

  it('ένας υπάλληλος ΔΕΝ μπορεί να δώσει το δικαίωμα στον εαυτό του: ο έλεγχος καλύπτει UPDATE και INSERT', () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON users/);
    expect(sql).toMatch(/NEW\.extra_permissions IS DISTINCT FROM OLD\.extra_permissions AND NOT auth_is_elevated\(\)/);
    expect(sql).toMatch(/RAISE EXCEPTION 'Τα επιπλέον δικαιώματα τα δίνει μόνο διευθυντής ή ιδιοκτήτης\.' USING ERRCODE = '42501'/);
    expect(sql).toMatch(/IF TG_OP = 'INSERT' THEN\s+[\s\S]*?IF NOT auth_is_elevated\(\) THEN\s+NEW\.extra_permissions := '\{\}';/);
  });

  it('ο ρόλος υπηρεσίας και το SQL Editor (χωρίς auth.uid()) δεν μπλοκάρονται', () => {
    expect(sql).toMatch(/IF auth\.uid\(\) IS NULL THEN\s+RETURN NEW;/);
  });

  it('ένας απενεργοποιημένος λογαριασμός χάνει το δικαίωμα', () => {
    expect(sql).toContain("COALESCE(u.status, 'ACTIVE') = 'ACTIVE'");
  });

  it('οι πολιτικές της αποθήκης ρωτάνε την ευρύτερη ερώτηση και τίποτα δεν χαλαρώνει', () => {
    expect(sql).toMatch(/CREATE POLICY warehouse_insert[\s\S]*?auth_can_manage_warehouse\(\)/);
    expect(sql).toMatch(/CREATE POLICY warehouse_delete[\s\S]*?auth_can_manage_warehouse\(\)/);
    // η ανάγνωση δεν αλλάζει, και ο υπάλληλος του ταμείου κρατάει ακριβώς ό,τι είχε (δύο θέσεις)
    expect(sql).toMatch(/auth_can_manage_warehouse\(\) OR status IN \('PENDING_DELIVERY', 'IN_STORE'\)/);
    expect(sql).not.toMatch(/CREATE POLICY warehouse_select/);
  });

  it('ο έλεγχος του ταμείου (ποιος αλλάζει θέση πακέτου) μένει για όποιον ΔΕΝ χειρίζεται την αποθήκη', () => {
    expect(sql).toMatch(/IF auth\.uid\(\) IS NULL OR auth_can_manage_warehouse\(\) THEN\s+RETURN NEW;/);
    expect(sql).toContain("OLD.status = 'PENDING_DELIVERY' AND NEW.status = 'IN_STORE'");
    expect(sql).toContain('OLD.unit_price   IS DISTINCT FROM NEW.unit_price');
  });

  it('η ερώτηση είναι: διευθυντής και πάνω, Ή υπάλληλος με το δικαίωμα', () => {
    expect(sql).toContain("SELECT auth_is_elevated() OR auth_has_extra_permission('scratch_warehouse.manage');");
  });
});
