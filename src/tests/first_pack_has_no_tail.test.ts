import { describe, expect, it } from 'vitest';
import {
  hadPackBefore,
  tailSoldOnNewPack,
  type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

/**
 * Το πρώτο πακέτο ενός παιχνιδιού δεν έχει προηγούμενο να χρεωθεί.
 *
 * Τα λόγια του ιδιοκτήτη: «έβαλα τα δύο καινούργια, το Δώρο 5 και το Δώρο
 * 10 [...] έβαλα σκρατς από την αποθήκη να μπει στο μαγαζί και το θεώρησε
 * ότι έχει πουληθεί ολόκληρο το πακέτο».
 *
 * Τα νούμερα από τη βάση: Δώρο 5€ = 60 δελτία × 5 €, Δώρο 10€ = 30 × 10 €.
 * Δηλαδή 600 € πωλήσεις που δεν έγιναν ποτέ, σε δύο κλικ.
 */
const row = (over: Partial<ScratchTicketRow>): ScratchTicketRow =>
  ({ id: 'x', name: 'x', category: 'Σκρατς', price: 2, startNo: '', endNo: '', ...over }) as ScratchTicketRow;

/** Το Δώρο 5€ όπως ήρθε: κατάλογος, πακέτο παραδομένο, τίποτα μετρημένο. */
const DWRO_5 = row({ id: 'scr_custom_mwakfl3f', name: 'Δώρο 5€', price: 5, startNo: '0', endNo: '' });
/** Το Δώρο 10€, 30 δελτία των 10 €. */
const DWRO_10 = row({ id: 'scr_custom_mwakh5bs', name: 'Δώρο 10€', price: 10, startNo: '0', endNo: '' });

describe('είχε η γραμμή πακέτο πριν;', () => {
  it('με αποθήκη, κενός κωδικός σημαίνει κανένα πακέτο ποτέ', () => {
    expect(hadPackBefore(DWRO_5, true)).toBe(false);
    expect(hadPackBefore(row({ packCode: '' }), true)).toBe(false);
    expect(hadPackBefore(row({ packCode: '   ' }), true)).toBe(false);
  });

  it('με αποθήκη, κωδικός σημαίνει ότι υπήρχε', () => {
    expect(hadPackBefore(row({ packCode: '0040695' }), true)).toBe(true);
  });

  /**
   * Ο φρουρός της παλιάς συμπεριφοράς. Χωρίς αποθήκη ο κωδικός λείπει
   * ΠΑΝΤΑ, οπότε δεν αποδεικνύει τίποτα - και η ουρά εκεί είναι αληθινή.
   */
  it('ΧΩΡΙΣ αποθήκη, δεν αποδεικνύεται τίποτα: απαντά ναι', () => {
    expect(hadPackBefore(DWRO_5, false)).toBe(true);
    expect(hadPackBefore(row({ packCode: '' }), false)).toBe(true);
  });
});

describe('τι χρεώνει το «νέο πακέτο» στο πρώτο πακέτο του παιχνιδιού', () => {
  it('ΤΟ ΔΩΡΟ 5€: μηδέν, όχι 60 δελτία (300 €)', () => {
    expect(tailSoldOnNewPack(DWRO_5, hadPackBefore(DWRO_5, true))).toBe(0);
  });

  it('ΤΟ ΔΩΡΟ 10€: μηδέν, όχι 30 δελτία (300 €)', () => {
    expect(tailSoldOnNewPack(DWRO_10, hadPackBefore(DWRO_10, true))).toBe(0);
  });

  /** Τα δύο μαζί: 600 € που χρεώνονταν και τώρα δεν χρεώνονται. */
  it('τα δύο μαζί δεν χρεώνουν τίποτα', () => {
    const charged = [DWRO_5, DWRO_10].reduce((acc, r) => {
      const tail = tailSoldOnNewPack(r, hadPackBefore(r, true)) ?? 0;
      return acc + tail * r.price;
    }, 0);
    expect(charged).toBe(0);
  });

  /** Και όσο ΧΡΕΩΝΟΤΑΝ, για να φαίνεται τι διορθώθηκε. */
  it('με τον παλιό κανόνα θα ήταν 600 €', () => {
    const charged = [DWRO_5, DWRO_10].reduce(
      (acc, r) => acc + (tailSoldOnNewPack(r) ?? 0) * r.price,
      0
    );
    expect(charged).toBe(600);
  });
});

describe('ό,τι χρεωνόταν σωστά, χρεώνεται ακόμα', () => {
  /**
   * Η περίπτωση για την οποία γράφτηκε η ουρά: πακέτο 2 € που η βάρδια
   * βρήκε στη θέση 6 και τελείωσε. 144 δελτία, 288 €, που πριν χάνονταν.
   */
  it('πακέτο που τελείωσε: 144 δελτία, με ή χωρίς αποθήκη', () => {
    const mid = row({ price: 2, startNo: '6', packCode: '0040204' });
    expect(tailSoldOnNewPack(mid, hadPackBefore(mid, true))).toBe(144);
    const legacy = row({ price: 2, startNo: '6' });
    expect(tailSoldOnNewPack(legacy, hadPackBefore(legacy, false))).toBe(144);
  });

  /**
   * ΟΛΟΚΛΗΡΟ πακέτο πουλημένο μέσα σε μια βάρδια: η γραμμή κρατάει τον
   * κωδικό του πακέτου που παρέλαβε, άρα χρεώνεται κανονικά. Αυτή είναι η
   * γραμμή που ξεχωρίζει τη διόρθωση από ένα απλό «μηδένισέ το».
   */
  it('παραλήφθηκε και πουλήθηκε όλο: χρεώνεται ολόκληρο', () => {
    const sold = row({ price: 5, startNo: '0', endNo: '', packCode: '0016880' });
    expect(tailSoldOnNewPack(sold, hadPackBefore(sold, true))).toBe(60);
  });

  it('στα λαχεία, τίποτα - όπως πάντα', () => {
    const laiko = row({ id: 'scr_laiko', category: 'Λαχεία', price: 2, startNo: '200' });
    expect(tailSoldOnNewPack(laiko, hadPackBefore(laiko, true))).toBe(0);
  });

  it('τιμή που δεν διαιρεί τα 300 €: ρωτάει τον χειριστή, όπως πάντα', () => {
    const odd = row({ price: 7, startNo: '3', packCode: '0012345' });
    expect(tailSoldOnNewPack(odd, hadPackBefore(odd, true))).toBeNull();
  });

  /** Πρώτο πακέτο ΚΑΙ περίεργη τιμή: μηδέν, χωρίς ερώτηση. */
  it('πρώτο πακέτο με περίεργη τιμή: μηδέν, χωρίς ερώτηση', () => {
    const odd = row({ price: 7, startNo: '0' });
    expect(tailSoldOnNewPack(odd, hadPackBefore(odd, true))).toBe(0);
  });
});
