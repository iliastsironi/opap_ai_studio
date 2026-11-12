/**
 * Οι δύο κύκλοι ευθύνης, όπως τους ξέρει και η βάση.
 *
 * Η ίδια ερώτηση - «είναι αυτός διευθυντής ή πάνω;» - απαντιόταν σε έξι
 * σημεία της οθόνης με έξι χειρόγραφες λίστες ρόλων, και είχαν αρχίσει να
 * διαφωνούν: δύο από αυτές έχουν μέσα 'SHIFT_LEADER' και 'ADMIN', ρόλους που
 * το auth_is_elevated() της βάσης ΔΕΝ δέχεται. Ό,τι βασίζεται σε μια τέτοια
 * λίστα δείχνει κουμπί σε κάποιον που η βάση θα αρνηθεί - και ένα κουμπί που
 * αποτυγχάνει πάντα διαβάζεται ως βλάβη, όχι ως όριο.
 *
 * Οι λίστες ζουν εδώ, σε φύλλο χωρίς εισαγωγές, ώστε να μπορεί να τις
 * διαβάσει οποιοσδήποτε - το ταμείο, τα έξοδα, η αποθήκη - χωρίς κύκλο.
 *
 * ΟΙ ΛΙΣΤΕΣ ΕΙΝΑΙ ΑΝΤΙΓΡΑΦΟ ΤΗΣ ΒΑΣΗΣ, ΕΠΙΤΗΔΕΣ. Το auth_is_elevated() και
 * το auth_is_owner() είναι οι πύλες που όντως φυλάνε τα δεδομένα (0002,
 * 0012). Αυτό εδώ είναι μόνο η πρόβλεψη της οθόνης για το τι θα πει η πύλη,
 * ώστε να μη δείξει κουμπί που θα σκάσει. Αν αλλάξει η μία, αλλάζει και η
 * άλλη - αλλιώς η οθόνη λέει ψέματα για τα δικαιώματα κάποιου.
 */

/** Ό,τι δέχεται το auth_is_elevated() της βάσης (0002). Ίδια λίστα επίτηδες. */
export const ELEVATED_ROLES = [
  'ORG_OWNER',
  'PLATFORM_ADMIN',
  'AREA_MANAGER',
  'STORE_MANAGER',
  'ORG_ADMIN',
] as const;

/** Ό,τι δέχεται το auth_is_owner() της βάσης (0012). Ίδια λίστα επίτηδες. */
export const OWNER_ROLES = ['ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN'] as const;

/**
 * Το μπαλαντέρ δικαίωμα, που κρατάει μόνο ο ιδιοκτήτης και ο διαχειριστής
 * πλατφόρμας (rbac.ts). Μετριέται ως ιδιοκτησία γιατί αυτό σημαίνει.
 */
const WILDCARD = '*';

function hasAny(
  roleCodes: ReadonlyArray<string> | null | undefined,
  allowed: ReadonlyArray<string>,
  permissions?: ReadonlyArray<string> | null
): boolean {
  if (permissions?.includes(WILDCARD)) return true;
  return (roleCodes ?? []).some((code) => allowed.includes(String(code ?? '')));
}

/**
 * Διευθυντής ή πάνω.
 *
 * Κενή ή άγνωστη λίστα ρόλων σημαίνει ΟΧΙ: ο στενότερος κύκλος είναι η μόνη
 * ασφαλής ανάγνωση για κάτι που δεν αναγνωρίζουμε.
 */
export function isElevatedRole(
  roleCodes: ReadonlyArray<string> | null | undefined,
  permissions?: ReadonlyArray<string> | null
): boolean {
  return hasAny(roleCodes, ELEVATED_ROLES, permissions);
}

/** Ιδιοκτησία ή διοίκηση - αυτός που απαντάει για τα βιβλία. */
export function isOwnerRole(
  roleCodes: ReadonlyArray<string> | null | undefined,
  permissions?: ReadonlyArray<string> | null
): boolean {
  return hasAny(roleCodes, OWNER_ROLES, permissions);
}

/** Οι κωδικοί των ρόλων ενός χρήστη, όπως τους κρατάει το AuthContext. */
export function roleCodesOf(
  roles: ReadonlyArray<{ code?: string | null }> | null | undefined
): string[] {
  return (roles ?? []).map((r) => String(r?.code ?? ''));
}
