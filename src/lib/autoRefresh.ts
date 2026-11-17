/**
 * Μια λίστα που φορτώνεται και ξαναφορτώνεται μόνη της, χωρίς React.
 *
 * Ο ιδιοκτήτης παρέδωσε από την αποθήκη δύο πακέτα (Δώρο 5€, Δώρο 10€) και η
 * οθόνη του ταμείου στο κατάστημα, ανοιχτή από το πρωί, έγραφε ακόμα «2 παιχνίδια
 * περιμένουν παράδοση — η αποθήκη δεν έχει παραδώσει πακέτο». Τα πακέτα ήταν
 * παραδομένα στη βάση. Η οθόνη τα είχε διαβάσει μία φορά, όταν άνοιξε, και δεν
 * ξανακοίταξε ποτέ· το «μπαίνουν μόνα τους» του μηνύματος ίσχυε μόνο μετά από
 * reload.
 *
 * Η αποθήκη αλλάζει από ΑΛΛΗ συσκευή (του ιδιοκτήτη), οπότε ούτε το focus ούτε
 * κάποιο κλικ της ίδιας οθόνης την προλαβαίνει: χρειάζεται και χρονόμετρο.
 *
 * Σε φύλλο χωρίς React ώστε να δοκιμάζεται με ψεύτικο ρολόι. Ο κανόνας που
 * μετράει είναι ο ΤΕΛΕΥΤΑΙΟΣ ΕΡΩΤΗΜΑΤΙΣΜΟΣ ΚΕΡΔΙΖΕΙ: μια παλιά απάντηση που
 * γυρνάει αργά δεν πρέπει να σβήσει μια νεότερη.
 */

export interface AutoRefreshOptions<T> {
  /** Διαβάζει την τρέχουσα κατάσταση από τη βάση. */
  load: () => Promise<T>;
  /** Παίρνει το αποτέλεσμα. Καλείται μόνο για την πιο πρόσφατη ερώτηση. */
  apply: (value: T) => void;
  /** Για τα σφάλματα. Δεν διακόπτουν τίποτα: η προηγούμενη λίστα μένει όπως ήταν. */
  onError?: (error: unknown) => void;
  /** Κάθε πότε ξαναρωτάει όσο η σελίδα φαίνεται. */
  intervalMs?: number;
  /** Ψευδές όταν η σελίδα είναι κρυμμένη: κανείς δεν τη βλέπει, δεν ρωτάμε. */
  isVisible?: () => boolean;
  /** Το document/window, για τα γεγονότα επιστροφής στη σελίδα. */
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface AutoRefresh {
  /** Ρωτάει τώρα. Δεν πετάει ποτέ σφάλμα. */
  refresh: () => Promise<void>;
  /** Ό,τι ερώτημα τρέχει τώρα δεν θα εφαρμοστεί: ο καλών ξέρει κάτι νεότερο. */
  supersede: () => void;
  stop: () => void;
}

export const DEFAULT_REFRESH_MS = 20_000;

export function startAutoRefresh<T>(options: AutoRefreshOptions<T>): AutoRefresh {
  const {
    load,
    apply,
    onError,
    intervalMs = DEFAULT_REFRESH_MS,
    isVisible = () => true,
    target = null,
    setTimer = (fn, ms) => setInterval(fn, ms),
    clearTimer = (h) => clearInterval(h as ReturnType<typeof setInterval>),
  } = options;

  let latest = 0;
  let stopped = false;

  const refresh = async (): Promise<void> => {
    if (stopped) return;
    const mine = ++latest;
    try {
      const value = await load();
      if (!stopped && mine === latest) apply(value);
    } catch (error) {
      if (!stopped) onError?.(error);
    }
  };

  const onReturn = () => {
    if (isVisible()) void refresh();
  };

  const handle = setTimer(() => {
    if (isVisible()) void refresh();
  }, intervalMs);
  // 'visibilitychange' στο document, 'focus' στο window: όποιο υπάρχει στο target.
  target?.addEventListener('visibilitychange', onReturn);
  target?.addEventListener('focus', onReturn);

  return {
    refresh,
    supersede: () => {
      latest += 1;
    },
    stop: () => {
      stopped = true;
      clearTimer(handle);
      target?.removeEventListener('visibilitychange', onReturn);
      target?.removeEventListener('focus', onReturn);
    },
  };
}
