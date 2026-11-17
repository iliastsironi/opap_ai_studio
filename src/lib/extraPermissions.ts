/**
 * Δικαιώματα που δίνονται σε ΣΥΓΚΕΚΡΙΜΕΝΟ χρήστη, πάνω από τον ρόλο του.
 *
 * «Διαχείριση αποθήκης να μπορούμε να δώσουμε access σε κάποιο υπάλληλο, όχι μόνο ο admin.»
 *
 * Δεν είναι νέος ρόλος: ο υπάλληλος μένει υπάλληλος, με όλα τα όριά του, και παίρνει ΜΟΝΟ αυτό.
 * Γράφεται στο users.extra_permissions (0091). Η βάση είναι η πύλη που φυλάει τα δεδομένα
 * (auth_can_manage_warehouse)· αυτό εδώ είναι ό,τι ξέρει η οθόνη για να δείξει ή να κρύψει
 * το μενού και τα κουμπιά, ώστε να μη δείξει κουμπί που η βάση θα αρνηθεί.
 *
 * Η ΛΙΣΤΑ ΕΙΝΑΙ ΚΛΕΙΣΤΗ: ό,τι δεν αναγνωρίζεται δεν περνάει. Μια τιμή στη στήλη που δεν είναι
 * εδώ δεν δίνει τίποτα, ούτε στην οθόνη ούτε (από το 0091) στη βάση.
 */

import { isElevatedRole } from './authCircles.ts';

export const WAREHOUSE_MANAGE_PERMISSION = 'scratch_warehouse.manage';
export const WAREHOUSE_VIEW_PERMISSION = 'scratch_warehouse.view';

/** Οι μόνες τιμές που δέχεται η στήλη. Ίδια λίστα με τον guard_extra_permissions() του 0091. */
export const GRANTABLE_PERMISSIONS: ReadonlyArray<string> = [WAREHOUSE_MANAGE_PERMISSION];

/** Η στήλη όπως τη διαβάζουμε: μόνο γνωστές τιμές, χωρίς διπλές. */
export function normalizeExtraPermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && GRANTABLE_PERMISSIONS.includes(v)))];
}

/**
 * Τα δικαιώματα ενός χρήστη: του ρόλου του συν ό,τι του δόθηκε. Η διαχείριση της αποθήκης
 * συνεπάγεται και την προβολή (αλλιώς δεν θα έβλεπε καν το μενού).
 */
export function mergePermissions(rolePermissions: ReadonlyArray<string>, extra: unknown): string[] {
  const merged = new Set(rolePermissions);
  const granted = normalizeExtraPermissions(extra);
  for (const code of granted) merged.add(code);
  if (granted.includes(WAREHOUSE_MANAGE_PERMISSION)) merged.add(WAREHOUSE_VIEW_PERMISSION);
  return [...merged];
}

export function hasWarehouseGrant(extra: unknown): boolean {
  return normalizeExtraPermissions(extra).includes(WAREHOUSE_MANAGE_PERMISSION);
}

/** Η νέα λίστα όταν ανάβει ή σβήνει η πρόσβαση στην αποθήκη. Δεν αγγίζει τα υπόλοιπα. */
export function withWarehouseGrant(extra: unknown, on: boolean): string[] {
  const rest = normalizeExtraPermissions(extra).filter((c) => c !== WAREHOUSE_MANAGE_PERMISSION);
  return on ? [...rest, WAREHOUSE_MANAGE_PERMISSION] : rest;
}

/**
 * Ποιος δίνει τέτοιο δικαίωμα: διευθυντής και πάνω. Ίδιος κύκλος με τη βάση (guard_extra_permissions).
 */
export function canGrantExtraPermissions(
  roleCodes: ReadonlyArray<string> | null | undefined,
  permissions?: ReadonlyArray<string> | null
): boolean {
  return isElevatedRole(roleCodes, permissions);
}

/** Σε ποιον έχει νόημα η επιλογή: όποιος δεν είναι ήδη διευθυντής ή πάνω. */
export function offersWarehouseGrant(roleCode: string | null | undefined): boolean {
  return !isElevatedRole(roleCode ? [roleCode] : []);
}
