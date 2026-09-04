import { Permission, Role } from '../types/index.ts';

// Canonical role/permission model. Before this, the app had four separate,
// inconsistent vocabularies: the seed data below (richest, and what
// RolesManager/UsersManager already expect the Role/Permission shape to look
// like), AuthContext's own 3-tier bucket system, userService.ts's DEMO_ROLES,
// and App.tsx's TAB_PERMISSIONS module-view codes. This unions all of them.

const nowIso = new Date().toISOString();

export const SYSTEM_PERMISSIONS: Permission[] = [
  { id: 'perm_org.view', code: 'org.view', module: 'Organization', description: 'Προβολή πληροφοριών οργανισμού' },
  { id: 'perm_org.settings', code: 'org.settings', module: 'Organization', description: 'Διαχείριση ρυθμίσεων οργανισμού' },
  { id: 'perm_store.view', code: 'store.view', module: 'Store', description: 'Προβολή καταστημάτων' },
  { id: 'perm_store.manage', code: 'store.manage', module: 'Store', description: 'Δημιουργία και διαχείριση καταστημάτων' },
  { id: 'perm_department.manage', code: 'department.manage', module: 'Store', description: 'Διαχείριση τμημάτων καταστήματος' },
  { id: 'perm_users.view', code: 'users.view', module: 'Users', description: 'Προβολή χρηστών' },
  { id: 'perm_users.manage', code: 'users.manage', module: 'Users', description: 'Διαχείριση χρηστών και προσκλήσεων' },
  { id: 'perm_roles.manage', code: 'roles.manage', module: 'Users', description: 'Διαχείριση ρόλων και δικαιωμάτων' },
  { id: 'perm_store_assignment.manage', code: 'store_assignment.manage', module: 'Users', description: 'Ανάθεση καταστημάτων σε χρήστες' },
  { id: 'perm_shift.create', code: 'shift.create', module: 'Shifts', description: 'Άνοιγμα και καταχώρηση βάρδιας' },
  { id: 'perm_shift.submit', code: 'shift.submit', module: 'Shifts', description: 'Υποβολή βάρδιας για έγκριση' },
  { id: 'perm_shift.approve', code: 'shift.approve', module: 'Shifts', description: 'Έγκριση ή απόρριψη βάρδιας' },
  { id: 'perm_shift.reopen', code: 'shift.reopen', module: 'Shifts', description: 'Επανάνοιγμα βάρδιας' },
  { id: 'perm_expense.create', code: 'expense.create', module: 'Expenses', description: 'Καταχώρηση εξόδου' },
  { id: 'perm_expense.approve', code: 'expense.approve', module: 'Expenses', description: 'Έγκριση εξόδων' },
  { id: 'perm_expense.delete', code: 'expense.delete', module: 'Expenses', description: 'Διαγραφή εξόδου' },
  { id: 'perm_cash.view', code: 'cash.view', module: 'Cash', description: 'Προβολή ταμείου' },
  { id: 'perm_cash.correct', code: 'cash.correct', module: 'Cash', description: 'Διόρθωση υπολοίπου ταμείου' },
  { id: 'perm_payroll.view', code: 'payroll.view', module: 'Payroll', description: 'Προβολή στοιχείων μισθοδοσίας' },
  { id: 'perm_payroll.edit', code: 'payroll.edit', module: 'Payroll', description: 'Επεξεργασία στοιχείων μισθοδοσίας' },
  { id: 'perm_reports.organization.view', code: 'reports.organization.view', module: 'Reports', description: 'Προβολή συγκεντρωτικών αναφορών οργανισμού' },
  { id: 'perm_reports.store.view', code: 'reports.store.view', module: 'Reports', description: 'Προβολή αναφορών καταστήματος' },
  { id: 'perm_audit.view', code: 'audit.view', module: 'Audit', description: 'Προβολή καταγραφών ελέγχου (Audit Logs)' },
  // Module-view codes App.tsx's TAB_PERMISSIONS already gates tabs on, with
  // no equivalent in the original seed list.
  { id: 'perm_dashboard.view', code: 'dashboard.view', module: 'Dashboard', description: 'Προβολή κεντρικού πίνακα ελέγχου (KPIs)' },
  { id: 'perm_shifts.view', code: 'shifts.view', module: 'Shifts', description: 'Προβολή ενότητας Βαρδιών & Ταμείου' },
  { id: 'perm_expenses.view', code: 'expenses.view', module: 'Expenses', description: 'Προβολή ενότητας Εξόδων' },
  { id: 'perm_suppliers.view', code: 'suppliers.view', module: 'Suppliers', description: 'Προβολή ενότητας Προμηθευτών' },
  { id: 'perm_opap.view', code: 'opap.view', module: 'OPAP', description: 'Προβολή ενότητας Παιχνιδιών ΟΠΑΠ' },
  { id: 'perm_vlt.view', code: 'vlt.view', module: 'VLT', description: 'Προβολή ενότητας VLTs' },
  { id: 'perm_fnb.view', code: 'fnb.view', module: 'FnB', description: 'Προβολή ενότητας Καφέ & Αναψυκτηρίου' },
  { id: 'perm_incidents.view', code: 'incidents.view', module: 'Incidents', description: 'Προβολή ενότητας Συμβάντων' },
  { id: 'perm_reports.view', code: 'reports.view', module: 'Reports', description: 'Προβολή ενότητας Αναφορών' },
];

// A few concepts are checked under more than one spelling elsewhere in the
// app (e.g. ShiftDetailsModal checks both 'shift.approve' and
// 'shifts.approve'; ShiftsManager only checks the plural forms). Rather than
// picking one spelling and editing every call site, grant both together so
// nothing that currently works silently breaks.
const PERMISSION_ALIASES: Record<string, string[]> = {
  'shift.approve': ['shifts.approve'],
  'shift.create': ['shifts.create'],
};

function expandAliases(codes: string[]): string[] {
  const expanded = new Set(codes);
  for (const code of codes) {
    (PERMISSION_ALIASES[code] || []).forEach((alias) => expanded.add(alias));
  }
  return Array.from(expanded);
}

const BASE_ROLE_PERMISSIONS: Record<string, string[]> = {
  PLATFORM_ADMIN: ['*'],
  ORG_OWNER: ['*'],
  AREA_MANAGER: [
    'org.view', 'store.view', 'users.view', 'shift.create', 'shift.submit',
    'shift.approve', 'shift.reopen', 'expense.create', 'expense.approve',
    'cash.view', 'reports.store.view', 'audit.view',
    'dashboard.view', 'shifts.view', 'expenses.view', 'suppliers.view',
    'opap.view', 'vlt.view', 'fnb.view', 'incidents.view', 'reports.view',
  ],
  STORE_MANAGER: [
    'org.view', 'store.view', 'users.view', 'shift.create', 'shift.submit',
    'shift.approve', 'expense.create', 'expense.approve', 'cash.view',
    'reports.store.view',
    'dashboard.view', 'shifts.view', 'expenses.view', 'suppliers.view',
    'opap.view', 'vlt.view', 'fnb.view', 'incidents.view', 'reports.view',
  ],
  SHIFT_SUPERVISOR: [
    'org.view', 'store.view', 'shift.create', 'shift.submit', 'expense.create', 'cash.view',
    'shifts.view', 'expenses.view', 'suppliers.view', 'opap.view', 'vlt.view', 'fnb.view', 'incidents.view',
  ],
  EMPLOYEE: [
    'store.view', 'shift.create', 'shift.submit', 'expense.create',
    'shifts.view', 'expenses.view', 'suppliers.view', 'opap.view', 'vlt.view', 'fnb.view', 'incidents.view',
  ],
  ACCOUNTANT: [
    'org.view', 'store.view', 'expense.create', 'cash.view',
    'reports.organization.view', 'reports.store.view',
    'dashboard.view', 'reports.view',
  ],
  AUDITOR: [
    'org.view', 'store.view', 'cash.view',
    'reports.organization.view', 'reports.store.view', 'audit.view',
    'dashboard.view', 'reports.view',
  ],
};

export const ROLE_PERMISSIONS: Record<string, string[]> = Object.fromEntries(
  Object.entries(BASE_ROLE_PERMISSIONS).map(([code, perms]) => [
    code,
    perms.includes('*') ? perms : expandAliases(perms),
  ])
);

export const SYSTEM_ROLES: Role[] = [
  { id: 'role_platform_admin', code: 'PLATFORM_ADMIN', name: 'Διαχειριστής Πλατφόρμας', description: 'Πλήρης πρόσβαση στην πλατφόρμα ShiftLedger', is_system: true, permissions: ROLE_PERMISSIONS.PLATFORM_ADMIN, created_at: nowIso },
  { id: 'role_org_owner', code: 'ORG_OWNER', name: 'Ιδιοκτήτης Οργανισμού', description: 'Πλήρης πρόσβαση στον οργανισμό, όλα τα καταστήματα και τις αναφορές', is_system: true, permissions: ROLE_PERMISSIONS.ORG_OWNER, created_at: nowIso },
  { id: 'role_area_manager', code: 'AREA_MANAGER', name: 'Area Manager', description: 'Διαχείριση και έγκριση ανατεθειμένων καταστημάτων', is_system: true, permissions: ROLE_PERMISSIONS.AREA_MANAGER, created_at: nowIso },
  { id: 'role_store_manager', code: 'STORE_MANAGER', name: 'Διευθυντής Καταστήματος', description: 'Διαχείριση καταστήματος, βαρδιών, εξόδων και εγκρίσεων', is_system: true, permissions: ROLE_PERMISSIONS.STORE_MANAGER, created_at: nowIso },
  { id: 'role_shift_supervisor', code: 'SHIFT_SUPERVISOR', name: 'Υπεύθυνος Βάρδιας', description: 'Άνοιγμα, κλείσιμο και έλεγχος ταμείου βάρδιας', is_system: true, permissions: ROLE_PERMISSIONS.SHIFT_SUPERVISOR, created_at: nowIso },
  { id: 'role_employee', code: 'EMPLOYEE', name: 'Υπάλληλος', description: 'Καταχώρηση βάρδιας και καταμέτρηση ταμείου στο ανατεθειμένο κατάστημα', is_system: true, permissions: ROLE_PERMISSIONS.EMPLOYEE, created_at: nowIso },
  { id: 'role_accountant', code: 'ACCOUNTANT', name: 'Λογιστής', description: 'Πρόσβαση σε οικονομικές αναφορές, έξοδα και εγκεκριμένα δεδομένα', is_system: true, permissions: ROLE_PERMISSIONS.ACCOUNTANT, created_at: nowIso },
  { id: 'role_auditor', code: 'AUDITOR', name: 'Ελεγκτής (Read-Only)', description: 'Μόνο ανάγνωση αναφορών και καταγραφών ελέγχου', is_system: true, permissions: ROLE_PERMISSIONS.AUDITOR, created_at: nowIso },
];

// Old role-code strings already sitting in written Firestore user docs (or
// hardcoded in userService.ts's now-retired DEMO_ROLES) - map them onto the
// canonical set above so existing users don't need a data migration.
export const LEGACY_ROLE_CODE_ALIASES: Record<string, string> = {
  ORG_ADMIN: 'ORG_OWNER',
  SHIFT_LEADER: 'SHIFT_SUPERVISOR',
  CASHIER: 'EMPLOYEE',
  SHIFT_OPERATOR: 'EMPLOYEE',
};

// Least-privilege default: an unset or unrecognized role_code becomes
// EMPLOYEE, never an elevated role.
export function normalizeRoleCode(code: string | null | undefined): string {
  if (!code) return 'EMPLOYEE';
  return LEGACY_ROLE_CODE_ALIASES[code] || code;
}

export function getPermissionsForRole(code: string | null | undefined): string[] {
  const normalized = normalizeRoleCode(code);
  return ROLE_PERMISSIONS[normalized] || ROLE_PERMISSIONS.EMPLOYEE;
}

export function getRoleByCode(code: string | null | undefined): Role {
  const normalized = normalizeRoleCode(code);
  return SYSTEM_ROLES.find((r) => r.code === normalized) || SYSTEM_ROLES.find((r) => r.code === 'EMPLOYEE')!;
}
