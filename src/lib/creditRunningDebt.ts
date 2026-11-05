/**
 * Η οφειλή ενός πελάτη όπως διαμορφώνεται ΜΕΣΑ στην ίδια βάρδια.
 *
 * Ο έλεγχος ορίου διάβαζε το customers.current_debt, δηλαδή την οφειλή
 * όπως την ξέρει η βάση - και η βάση δεν ξέρει τίποτα για τις γραμμές που
 * γράφονται αυτή τη στιγμή, γιατί αποθηκεύονται στο κλείσιμο.
 *
 * Αποτέλεσμα που ανέφερε ο Owner, και φαίνεται στο στιγμιότυπό του: ο
 * πελάτης χρωστάει 198,50, φέρνει τα λεφτά, η πρώτη γραμμή λέει «Νέο
 * Υπόλοιπο μετά την Είσπραξη: 0,00» - και η επόμενη γραμμή τον μπλοκάρει
 * επειδή «οφείλει ήδη 198,50». Δύο γραμμές στην ίδια οθόνη με δύο
 * διαφορετικές αλήθειες για το ίδιο ποσό.
 *
 * Εδώ η οφειλή τρέχει με τη σειρά των γραμμών. Η σειρά μετράει: εξόφληση
 * μετά τη χρέωση δεν είναι το ίδιο με εξόφληση πριν, και ο υπάλληλος τις
 * γράφει με τη σειρά που έγιναν.
 */

export interface CreditLineLike {
  customer_id?: string | null;
  customer_name?: string | null;
  /** 'GRANTED' (χρέωση) ή 'COLLECTED' (είσπραξη). Κενό = χρέωση. */
  type?: string | null;
  amount?: unknown;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

/** Αν δύο γραμμές αφορούν τον ίδιο πελάτη. */
export function sameCustomer(a: CreditLineLike, b: CreditLineLike): boolean {
  if (a.customer_id && b.customer_id) return a.customer_id === b.customer_id;
  const an = String(a.customer_name ?? '').trim().toLowerCase();
  const bn = String(b.customer_name ?? '').trim().toLowerCase();
  return an !== '' && an === bn;
}

/**
 * Η οφειλή του πελάτη τη στιγμή που φτάνει η γραμμή `index`.
 *
 * Ξεκινά από την αποθηκευμένη και εφαρμόζει μόνο τις ΠΡΟΗΓΟΥΜΕΝΕΣ γραμμές
 * του ίδιου πελάτη. Η ίδια η γραμμή δεν μετράει - το νόημά της είναι «τι
 * χωράει ΑΚΟΜΑ», και προσθέτοντας τον εαυτό της θα απαντούσε πάντα όχι.
 *
 * Δεν πέφτει κάτω από μηδέν. Μια υπερπληρωμή είναι κατάθεση, όχι επιπλέον
 * πιστωτικό όριο, και αφήνοντάς τη αρνητική ο πελάτης θα έπαιρνε περιθώριο
 * μεγαλύτερο από το όριο της βαθμίδας του.
 */
export function debtBeforeLine(
  lines: ReadonlyArray<CreditLineLike> | null | undefined,
  index: number,
  storedDebt: unknown
): number {
  const all = lines ?? [];
  const target = all[index];
  if (!target) return Math.max(0, round2(num(storedDebt)));

  let debt = num(storedDebt);
  for (let i = 0; i < index && i < all.length; i++) {
    const line = all[i];
    if (!sameCustomer(line, target)) continue;
    const amount = num(line.amount);
    // Κενός τύπος σημαίνει χρέωση, όπως παντού αλλού στην οθόνη.
    debt += line.type === 'COLLECTED' ? -amount : amount;
  }
  return Math.max(0, round2(debt));
}
