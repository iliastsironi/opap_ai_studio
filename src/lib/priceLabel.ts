/**
 * Η τιμή όπως τη γράφει ένας Έλληνας: 5, 2,5.
 *
 * Μόνη της, χωρίς καμία εξάρτηση, γιατί τη χρειάζονται και ο κατάλογος και η
 * αποθήκη - και η αποθήκη δεν πρέπει να τραβάει μαζί της τον πίνακα του ταμείου.
 */
export function priceLabel(price: number): string {
  const p = Math.round((Number(price) || 0) * 100) / 100;
  return Number.isInteger(p) ? String(p) : String(p).replace('.', ',');
}
