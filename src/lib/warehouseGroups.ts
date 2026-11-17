/**
 * Η αποθήκη ανά κατηγορία, με βάση την τιμή.
 *
 * Ο ιδιοκτήτης: «στην αποθήκη να φαίνονται ανά κατηγορία με βάση την τιμή και
 * να φαίνεται και η τιμή». Η ίδια ομαδοποίηση με τον κατάλογο: «Σκρατς 1€»,
 * «Σκρατς 2€», «Σκρατς 5€»... σε αύξουσα τιμή, με το όνομα της κατηγορίας
 * ακριβώς όπως το λέει ο κατάλογος.
 *
 * Μέσα σε κάθε ομάδα μένει η σειρά που ήρθε (ανά αριθμό παιχνιδιού ή ανά
 * ημερομηνία, ό,τι έχει διαλέξει ο χρήστης): η ομαδοποίηση δεν ξαναδιαλέγει
 * σειρά, μόνο χωρίζει.
 *
 * Σε λεπτά με ακέραιους, όπως παντού όπου συγκρίνεται τιμή. Ό,τι δεν έχει
 * τιμή πάει τελευταίο, σε δική του ομάδα, αντί να χαθεί ή να μπει στα «0 €».
 */

import { priceLabel } from './priceLabel.ts';

export interface PriceGroup<T> {
  /** `P:<λεπτά>` ή `none`. */
  key: string;
  /** Η τιμή σε ευρώ, ή null για «χωρίς τιμή». */
  price: number | null;
  /** «Σκρατς 5€», όπως τη λέει ο κατάλογος. */
  title: string;
  items: T[];
}

const NO_PRICE = 'none';

const centsOf = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
};

/** Η κατηγορία μιας τιμής: «Σκρατς 5€». */
export function priceCategory(price: unknown): string {
  const cents = centsOf(price);
  return cents === null ? 'Χωρίς τιμή' : `Σκρατς ${priceLabel(cents / 100)}€`;
}

export function groupByPrice<T>(
  items: ReadonlyArray<T>,
  priceOf: (item: T) => unknown
): PriceGroup<T>[] {
  const groups = new Map<string, PriceGroup<T>>();
  for (const item of items) {
    const cents = centsOf(priceOf(item));
    const key = cents === null ? NO_PRICE : `P:${cents}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        price: cents === null ? null : cents / 100,
        title: priceCategory(cents === null ? null : cents / 100),
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.price === null) return b.price === null ? 0 : 1;
    if (b.price === null) return -1;
    return a.price - b.price;
  });
}
