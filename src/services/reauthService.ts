import { createClient } from '@supabase/supabase-js';
import { isSudoValid } from '../lib/sudoWindow.ts';

/**
 * Η επαλήθευση ταυτότητας πριν από κάτι που δεν γυρίζει πίσω.
 *
 * Ο κωδικός ελέγχεται με ΞΕΧΩΡΙΣΤΟ client, όχι με αυτόν που κρατάει τη
 * συνεδρία σου. Το signInWithPassword στον κανονικό client εκδίδει νέα
 * συνεδρία, πυροδοτεί SIGNED_IN σε κάθε onAuthStateChange και ξαναστήνει
 * όλο το AuthContext - στη μέση μιας διαγραφής. Με persistSession false ο
 * έλεγχος γίνεται στη μνήμη και δεν αγγίζει τίποτα: αν ο κωδικός είναι
 * λάθος, η συνεδρία σου δεν το καταλαβαίνει καν.
 *
 * Το αποτέλεσμα ζει ΜΟΝΟ στη μνήμη αυτής της καρτέλας. Ούτε localStorage,
 * ούτε cookie: ένα «πιστοποιήθηκε» που επιβιώνει του refresh είναι ακριβώς
 * αυτό που θα έβρισκε ανοιχτό κάποιος άλλος στον ίδιο υπολογιστή.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const verifier = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/** Πότε δόθηκε η τελευταία επιτυχημένη επαλήθευση. */
let grantedAt: number | null = null;

export function sudoGrantedAt(): number | null {
  return grantedAt;
}

export function hasSudo(now: number = Date.now()): boolean {
  return isSudoValid(grantedAt, now);
}

/** Κλείνει το παράθυρο - στην αποσύνδεση, και μετά από ένα βαρύ σβήσιμο. */
export function clearSudo(): void {
  grantedAt = null;
}

export interface ReauthResult {
  ok: boolean;
  /** Τι πήγε στραβά, στα ελληνικά, ή null. */
  problem: string | null;
}

/**
 * Ξαναζητάει τον κωδικό και, αν είναι σωστός, ανοίγει το παράθυρο.
 *
 * Δεν ξεχωρίζει «λάθος κωδικός» από «δεν υπάρχει τέτοιος χρήστης»: είναι ο
 * ίδιος ο συνδεδεμένος χρήστης, οπότε το δεύτερο δεν μπορεί να συμβεί, και
 * μια διαφορετική διατύπωση θα έλεγε σε κάποιον που δοκιμάζει κωδικούς ότι
 * βρήκε σωστό email.
 */
export async function reauthenticate(email: string, password: string): Promise<ReauthResult> {
  if (!email) return { ok: false, problem: 'Δεν βρέθηκε το email του λογαριασμού.' };
  if (!password) return { ok: false, problem: 'Γράψτε τον κωδικό σας.' };

  try {
    const { error } = await verifier.auth.signInWithPassword({ email, password });
    if (error) {
      return { ok: false, problem: 'Λάθος κωδικός.' };
    }
    // Τοπικά μόνο. Το σκέτο signOut() έχει εμβέλεια global και θα ακύρωνε
    // ΚΑΘΕ συνεδρία του χρήστη - θα έβγαζε έξω και το κινητό του, και την
    // καρτέλα από την οποία μόλις ζήτησε τη διαγραφή.
    await verifier.auth.signOut({ scope: 'local' }).catch(() => {});
    grantedAt = Date.now();
    return { ok: true, problem: null };
  } catch (err) {
    console.warn('[reauth] could not verify the password:', err);
    return { ok: false, problem: 'Δεν ήταν δυνατός ο έλεγχος. Δοκιμάστε ξανά.' };
  }
}
