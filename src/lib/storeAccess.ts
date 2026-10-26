/**
 * Σε ποια καταστήματα μπορεί κάποιος να κάνει ταμείο.
 *
 * An employee works at a shop, not at a company. They should be able to open
 * and close the till where they actually stand, and nowhere else - a shift
 * opened against the wrong store puts that day's takings on another shop's
 * books, and nothing downstream can tell that it was a mistake rather than a
 * transfer.
 *
 * The assignments were already there and already enforced in one screen. The
 * store picker in the top bar was not: it listed every store in the
 * organisation to everybody, so an employee could switch to a shop they have
 * never set foot in and start a shift there. This is the one rule, in one
 * place, for every screen that offers a choice of store.
 *
 * Elevated roles are deliberately NOT limited by their assignments. An Owner
 * assigned to one shop is still the Owner of all of them, and limiting them
 * to their own assignment would hide the rest of their own business - which
 * is exactly what happened to the Owner here, who is assigned to one store
 * and has two.
 */

export interface AssignedStore {
  store_id?: string | null;
}

export interface StoreLike {
  id: string;
}

/**
 * The stores to offer this user.
 *
 * An employee with no assignment at all gets NOTHING, not everything. That
 * was the hole: an empty list read as «no restriction» rather than «not
 * placed anywhere yet», so the least-configured account had the widest
 * reach. Somebody who has not been given a shop cannot work a till in one.
 */
export function visibleStores<T extends StoreLike>(
  stores: ReadonlyArray<T> | null | undefined,
  assignments: ReadonlyArray<AssignedStore> | null | undefined,
  isElevated: boolean
): T[] {
  const all = (stores ?? []).filter(Boolean);
  if (isElevated) return [...all];

  const allowed = new Set(
    (assignments ?? [])
      .map((a) => (a?.store_id ?? '').trim())
      .filter((id) => id.length > 0)
  );
  return all.filter((s) => allowed.has(s.id));
}

/** Whether this user may work a till at this particular store. */
export function canWorkAtStore(
  storeId: string | null | undefined,
  assignments: ReadonlyArray<AssignedStore> | null | undefined,
  isElevated: boolean
): boolean {
  if (isElevated) return true;
  const id = (storeId ?? '').trim();
  if (id.length === 0) return false;
  return (assignments ?? []).some((a) => (a?.store_id ?? '').trim() === id);
}

/** The roles that see the whole organisation, matching auth_is_elevated(). */
export const ELEVATED_ROLE_CODES: ReadonlyArray<string> = [
  'ORG_OWNER',
  'PLATFORM_ADMIN',
  'AREA_MANAGER',
  'STORE_MANAGER',
  'ORG_ADMIN',
];

export function isElevatedRole(
  roles: ReadonlyArray<{ code?: string }> | null | undefined,
  permissions?: ReadonlyArray<string> | null
): boolean {
  if ((permissions ?? []).includes('*')) return true;
  return (roles ?? []).some((r) => ELEVATED_ROLE_CODES.includes(r?.code ?? ''));
}
