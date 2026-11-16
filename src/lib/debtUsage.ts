/**
 * Πόσο γεμάτο είναι το όριο ενός πελάτη, και τι χρώμα παίρνει η οφειλή του.
 *
 * Το τεφτέρι είχε ΤΡΕΙΣ στήλες με χρώμα - όριο, οφειλή, υπόλοιπο - και ο
 * καθένας τις διάβαζε αλλιώς: ένα πράσινο «υπόλοιπο» δίπλα σε μια
 * πορτοκαλί «οφειλή» λένε σχεδόν το ίδιο πράγμα με αντίθετα χρώματα. Τώρα
 * χρώμα παίρνει ΜΟΝΟ η τρέχουσα οφειλή, και μόνο με έναν κανόνα:
 *
 *   έως 50%  του ορίου   πράσινο
 *   51-80%               πορτοκαλί
 *   81-100% και πάνω     κόκκινο
 *
 * Τα ποσοστά είναι ακέραια όπως τα είπε ο χρήστης, άρα το 50,4% δεν είναι
 * «50»: είναι 51 και βγαίνει πορτοκαλί, και το 80,4% είναι 81 και βγαίνει
 * κόκκινο. Η σύγκριση γίνεται σε λεπτά και με ακέραιους, όχι με δεκαδικά:
 * ένα 40,00 € σε όριο 80,00 € πρέπει να βγαίνει ακριβώς 50% και όχι 50,000…1.
 */

export type DebtTone = 'GREEN' | 'ORANGE' | 'RED';

export interface DebtUsage {
  /** Ποσοστό του ορίου, στρογγυλεμένο ΠΡΟΣ ΤΑ ΠΑΝΩ (50,4% → 51). null όταν δεν ορίζεται. */
  percent: number | null;
  /** null όταν δεν υπάρχει όριο να συγκριθεί (απεριόριστος πελάτης). */
  tone: DebtTone | null;
  /** Η οφειλή ξεπερνά το όριο: ισχύει και για όριο 0. */
  over: boolean;
}

const cents = (euros: unknown): number => {
  const n = Number(euros);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export function debtUsage(debt: unknown, limit: unknown, isUnlimited: boolean): DebtUsage {
  if (isUnlimited) return { percent: null, tone: null, over: false };

  // Πιστωτικό υπόλοιπο (αρνητική οφειλή) δεν είναι «λιγότερο από μηδέν» γεμάτο όριο.
  const owed = Math.max(0, cents(debt));
  const cap = cents(limit);

  // Όριο 0 = «δεν δίνουμε πίστωση σε αυτόν». Οφειλή πάνω του δεν έχει ποσοστό,
  // έχει μόνο υπέρβαση· χωρίς οφειλή δεν υπάρχει τίποτα να χρωματιστεί κόκκινο.
  if (cap <= 0) {
    return owed > 0
      ? { percent: null, tone: 'RED', over: true }
      : { percent: null, tone: 'GREEN', over: false };
  }

  // owed/cap ≤ 50/100 ⇔ owed*100 ≤ 50*cap - ακέραιες πράξεις, χωρίς στρογγυλοποίηση.
  const scaled = owed * 100;
  const tone: DebtTone = scaled <= 50 * cap ? 'GREEN' : scaled <= 80 * cap ? 'ORANGE' : 'RED';

  return { percent: Math.ceil(scaled / cap), tone, over: owed > cap };
}
