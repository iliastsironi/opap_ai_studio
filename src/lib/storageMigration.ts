/**
 * Τα κλειδιά που κρατάει ο browser, μετά την αλλαγή ονόματος.
 *
 * Η εφαρμογή λεγόταν ShiftLedger και τα κλειδιά της στο localStorage ξεκινούσαν
 * με `shiftledger_`: πόσα τερματικά POS έχει ένα κατάστημα, ο τοπικός
 * κατάλογος σκρατς, η προβολή που διάλεξε ο χρήστης. Τώρα ξεκινούν με `var_`.
 *
 * Αν απλώς άλλαζε το όνομα του κλειδιού, κάθε συσκευή θα έχανε αυτές τις
 * ρυθμίσεις μια φορά, και ο χρήστης θα έβρισκε το κατάστημα με τον λάθος αριθμό
 * τερματικών χωρίς να έχει αλλάξει τίποτα. Γι' αυτό, στην πρώτη εκκίνηση,
 * ό,τι υπάρχει με το παλιό πρόθεμα αντιγράφεται στο νέο και σβήνεται από το παλιό.
 *
 * Δεν γράφει ποτέ πάνω σε τιμή που υπάρχει ήδη με το νέο όνομα: μια συσκευή που
 * έχει ήδη δουλέψει με τη νέα έκδοση κρατάει ό,τι έχει.
 */

export const OLD_STORAGE_PREFIX = 'shiftledger_';
export const NEW_STORAGE_PREFIX = 'var_';

type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

/** Μεταφέρει τα κλειδιά με το παλιό πρόθεμα στο νέο. Γυρίζει πόσα μετέφερε. */
export function migrateStoragePrefix(
  storage: StorageLike | null | undefined,
  from: string = OLD_STORAGE_PREFIX,
  to: string = NEW_STORAGE_PREFIX
): number {
  if (!storage) return 0;
  try {
    // Πρώτα μαζεύονται τα κλειδιά, μετά αλλάζουν: το μήκος του storage αλλάζει
    // όσο γράφουμε, και ένα loop πάνω του θα πηδούσε κλειδιά.
    const oldKeys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(from)) oldKeys.push(key);
    }
    let moved = 0;
    for (const oldKey of oldKeys) {
      const value = storage.getItem(oldKey);
      const newKey = to + oldKey.slice(from.length);
      if (value !== null && storage.getItem(newKey) === null) {
        storage.setItem(newKey, value);
        moved += 1;
      }
      storage.removeItem(oldKey);
    }
    return moved;
  } catch {
    // Ιδιωτικό παράθυρο ή αποκλεισμένα δεδομένα: η εφαρμογή δουλεύει και χωρίς.
    return 0;
  }
}

/** Και τα δύο storage του browser, όπου υπάρχουν. */
export function migrateBrowserStorage(): number {
  if (typeof window === 'undefined') return 0;
  let moved = 0;
  try {
    moved += migrateStoragePrefix(window.localStorage);
  } catch {
    /* αποκλεισμένο */
  }
  try {
    moved += migrateStoragePrefix(window.sessionStorage);
  } catch {
    /* αποκλεισμένο */
  }
  return moved;
}
