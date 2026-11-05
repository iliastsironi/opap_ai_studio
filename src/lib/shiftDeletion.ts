/**
 * Τι παίρνει μαζί της μια βάρδια που σβήνεται.
 *
 * Η βάση το απαντά ήδη, και όχι με έναν τρόπο. Τα ξένα κλειδιά προς τα
 * shifts χωρίζονται σε δύο ομάδες:
 *
 *   ON DELETE CASCADE     έξοδα, χρεώσεις υπαλλήλων, συμβάντα, ειδοποιήσεις
 *   ON DELETE SET NULL    χρεώσεις πελατών, μεταφορές μετρητών, ταμείο λαχείων
 *
 * Η δεύτερη ομάδα είναι η επικίνδυνη, γιατί δεν φαίνεται. Σβήνεις τη βάρδια
 * και η χρέωση του πελάτη μένει στο τεφτέρι με shift_id NULL: το χρέος
 * ισχύει, αλλά δεν υπάρχει πια τίποτα να πει από πού ήρθε. Κανείς δεν το
 * επέλεξε αυτό - είναι ό,τι έκανε το σχήμα από την πρώτη μέρα.
 *
 * Γι' αυτό η επιλογή ρωτιέται κάθε φορά, με τα νούμερα μπροστά: πόσες
 * χρεώσεις, πόσα ευρώ. «Σβήσε τα όλα» και «κράτα το χρέος» είναι και τα δύο
 * σωστά κατά περίπτωση - ένα δοκιμαστικό ταμείο δεν αφήνει χρέη, μια
 * βάρδια που καταχωρήθηκε δύο φορές ίσως αφήνει.
 *
 * Καθαρό και χωρίς I/O: τα νούμερα έρχονται από τον καλούντα, ώστε αυτό που
 * δείχνει το παράθυρο να είναι ακριβώς αυτό που θα γίνει.
 */

import { formatCurrency } from './formatters.ts';

/** Τι γίνονται οι χρεώσεις πελατών της βάρδιας. */
export type CreditDisposition = 'DELETE' | 'KEEP';

/**
 * Και η τρίτη κατάσταση: δεν έχει απαντήσει ακόμα κανείς.
 *
 * Το παράθυρο ξεκινούσε με προεπιλεγμένο το «Να μείνουν», με το σκεπτικό
 * ότι είναι το ασφαλές αν δεν διαβάσει κανείς την ερώτηση. Δεν είναι: δεν
 * χάνει το ΠΟΣΟ, χάνει την ΠΡΟΕΛΕΥΣΗ, και αυτό είναι χειρότερο γιατί είναι
 * αόρατο. Το χρέος μένει στον πελάτη, η βάρδια έχει φύγει, και δεν υπάρχει
 * πια τρόπος να βρεθεί από πού ήρθε - το ξένο κλειδί είναι SET NULL. Στις
 * 5/11/2026 έφυγαν έτσι 20 βάρδιες και 10 χρεώσεις έμειναν ανεξήγητες.
 *
 * Ο Owner είχε ζητήσει «να ρωτάει κάθε φορά». Μια προεπιλογή δεν ρωτάει -
 * απαντάει για λογαριασμό σου και σε βάζει να το προσέξεις.
 */
export type CreditChoice = CreditDisposition | null;

export interface ShiftDeletionCounts {
  /** Έξοδα της βάρδιας. Φεύγουν πάντα (CASCADE). */
  expenses: number;
  /** Χρεώσεις υπαλλήλων. Φεύγουν πάντα (CASCADE). */
  employeeCharges: number;
  /** Χρεώσεις πελατών - η μόνη επιλογή. */
  customerCredits: number;
  /** Πόσα ευρώ αφορούν, για να μην αποφασίζεται στα τυφλά. */
  customerCreditTotal: number;
  /** Μεταφορές μετρητών προς/από άλλο κατάστημα. Αποσυνδέονται πάντα. */
  cashTransfers: number;
  /** Πακέτα αποθήκης που είχε βγάλει αυτή η βάρδια στον πάγκο. */
  warehousePacks: number;
}

export type Fate = 'GOES' | 'STAYS' | 'DETACHES';

export interface DeletionLine {
  label: string;
  detail: string;
  fate: Fate;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Οι γραμμές που δείχνει το παράθυρο επιβεβαίωσης.
 *
 * Μόνο ό,τι υπάρχει πραγματικά. Μια λίστα που λέει «0 έξοδα» σε κάθε
 * διαγραφή εκπαιδεύει τον αναγνώστη να την προσπερνά, και τότε η γραμμή
 * που είχε σημασία χάνεται μαζί με τις υπόλοιπες.
 */
export function deletionLines(
  counts: ShiftDeletionCounts,
  disposition: CreditChoice
): DeletionLine[] {
  const lines: DeletionLine[] = [];

  if (counts.expenses > 0) {
    lines.push({
      label: 'Έξοδα βάρδιας',
      detail: plural(counts.expenses, 'εγγραφή', 'εγγραφές'),
      fate: 'GOES',
    });
  }

  if (counts.employeeCharges > 0) {
    lines.push({
      label: 'Χρεώσεις υπαλλήλων',
      detail: plural(counts.employeeCharges, 'εγγραφή', 'εγγραφές'),
      fate: 'GOES',
    });
  }

  if (counts.customerCredits > 0) {
    lines.push({
      label: 'Χρεώσεις πελατών',
      detail:
        `${plural(counts.customerCredits, 'εγγραφή', 'εγγραφές')} · ` +
        `${formatCurrency(counts.customerCreditTotal)}` +
        (disposition === null
          ? ' — διαλέξτε παρακάτω τι θα τις γίνει'
          : disposition === 'KEEP'
          ? ' — το χρέος παραμένει στο τεφτέρι'
          : ''),
      fate: disposition === 'DELETE' ? 'GOES' : 'DETACHES',
    });
  }

  if (counts.warehousePacks > 0) {
    lines.push({
      label: 'Πακέτα σκρατς',
      detail:
        `${plural(counts.warehousePacks, 'πακέτο επιστρέφει', 'πακέτα επιστρέφουν')} στην αποθήκη` +
        ' — κανείς δεν τα πούλησε',
      fate: 'STAYS',
    });
  }

  if (counts.cashTransfers > 0) {
    lines.push({
      label: 'Μεταφορές μετρητών',
      detail:
        `${plural(counts.cashTransfers, 'κίνηση', 'κινήσεις')} — ` +
        'μένουν, αφορούν και άλλο κατάστημα',
      fate: 'DETACHES',
    });
  }

  return lines;
}

/**
 * Αν η επιλογή για τις χρεώσεις έχει νόημα να ζητηθεί.
 *
 * Χωρίς χρεώσεις πελατών δεν υπάρχει τίποτα να αποφασιστεί, και ένα
 * ερώτημα χωρίς συνέπεια είναι ένα ακόμα κλικ πριν από μια οριστική πράξη.
 */
export function needsCreditChoice(counts: ShiftDeletionCounts): boolean {
  return counts.customerCredits > 0;
}

/**
 * Η φράση που γράφεται στο audit, ώστε η επιλογή να μένει στο ιστορικό.
 *
 * Το trigger του 0028 καταγράφει ήδη το SHIFT_DELETED με όλη τη βάρδια. Δεν
 * ξέρει όμως τι αποφασίστηκε για τις χρεώσεις, γιατί αυτές σβήνονται - ή
 * όχι - σε ξεχωριστή πράξη πριν από αυτήν.
 */
export function creditDispositionNote(
  counts: ShiftDeletionCounts,
  disposition: CreditChoice
): string {
  if (counts.customerCredits === 0) return 'Καμία χρέωση πελάτη.';
  if (disposition === null) {
    return `${counts.customerCredits} χρεώσεις πελατών (${formatCurrency(counts.customerCreditTotal)})`
      + ' — διαλέξτε μία από τις δύο για να συνεχίσετε.';
  }
  return disposition === 'DELETE'
    ? `Διαγράφηκαν ${counts.customerCredits} χρεώσεις πελατών (${formatCurrency(counts.customerCreditTotal)}).`
    : `Διατηρήθηκαν ${counts.customerCredits} χρεώσεις πελατών (${formatCurrency(counts.customerCreditTotal)}) ως χρέος.`;
}

/**
 * Αν λείπει απάντηση που χρειάζεται, ώστε το κουμπί να μην πατιέται.
 *
 * Το φράγμα ζει εδώ και όχι μέσα στο παράθυρο, γιατί είναι ο ίδιος κανόνας
 * με το needsCreditChoice και πρέπει να απαντά το ίδιο πράγμα - δύο σημεία
 * που κρίνουν «χρειάζεται επιλογή;» αλλιώς είναι ακριβώς ο τρόπος με τον
 * οποίο ξαναγλιστράει.
 */
export function creditChoiceMissing(
  counts: ShiftDeletionCounts | null,
  disposition: CreditChoice
): boolean {
  if (!counts) return true;
  return needsCreditChoice(counts) && disposition === null;
}
