import { describe, expect, it } from 'vitest';
import {
  handoverChoices, handoverProblem, packsForGame, warehouseGoverns, type HandoverPack,
} from '../lib/warehouseHandover.ts';

/** Παραδομένο, δηλαδή ό,τι μπορεί να ανοίξει το ταμείο. */
const pack = (over: Partial<HandoverPack> = {}): HandoverPack => ({
  id: 'p1', catalog_code: 'scr_2_gata', pack_code: '3301482', game_name: 'ΓΑΤΑ',
  pieces: 150, unit_price: 2, received_at: '2026-10-01', status: 'PENDING_DELIVERY', ...over,
});

/** Στο ράφι: υπάρχει, αλλά κανείς δεν το κουβάλησε στο μαγαζί. */
const onShelf = (over: Partial<HandoverPack> = {}): HandoverPack =>
  pack({ status: 'IN_WAREHOUSE', ...over });

describe('πότε αναλαμβάνει η αποθήκη', () => {
  it('όχι όσο το κατάστημα δεν έχει καταχωρήσει τίποτα', () => {
    // Αλλιώς το ταμείο θα σταματούσε απόψε για μια δουλειά που θέλει μέρες.
    expect(warehouseGoverns(false, false)).toBe(false);
  });

  it('ναι από το πρώτο πακέτο και μετά', () => {
    expect(warehouseGoverns(true, false)).toBe(true);
  });

  it('και όταν το ράφι αδειάσει — ο διακόπτης δεν αναβοσβήνει', () => {
    // Η πρώτη εκδοχή κοιτούσε το τρέχον απόθεμα: μόλις βγήκε το μοναδικό
    // πακέτο στο μαγαζί, το ταμείο ξαναζήτησε πληκτρολογημένο κωδικό.
    // Άδειο ράφι σημαίνει «παράγγειλε», όχι «γράψε το στο χέρι».
    expect(warehouseGoverns(true, false)).toBe(true);
  });

  it('ποτέ για λαχείο — εκείνα έχουν παραλαβή ανά κλήρωση', () => {
    expect(warehouseGoverns(true, true)).toBe(false);
  });
});

describe('ποια πακέτα προσφέρονται', () => {
  it('μόνο του ίδιου παιχνιδιού', () => {
    const packs = [pack({ id: 'a' }), pack({ id: 'b', catalog_code: 'scr_5_gata' })];
    expect(packsForGame(packs, 'scr_2_gata').map((p) => p.id)).toEqual(['a']);
  });

  it('παλαιότερο πρώτο — αυτό πλησιάζει τις 90 ημέρες', () => {
    const packs = [
      pack({ id: 'new', received_at: '2026-10-20' }),
      pack({ id: 'old', received_at: '2026-08-01' }),
      pack({ id: 'mid', received_at: '2026-09-10' }),
    ];
    expect(packsForGame(packs, 'scr_2_gata').map((p) => p.id)).toEqual(['old', 'mid', 'new']);
  });

  it('άγνωστο παιχνίδι δίνει κενό', () => {
    expect(packsForGame([pack()], 'scr_kati_allo')).toEqual([]);
  });
});

describe('τι εμποδίζει το άνοιγμα', () => {
  it('άδεια αποθήκη λέει πού να πας', () => {
    expect(handoverProblem([], [], null)).toContain('Αποθήκη Σκρατς');
  });

  it('χωρίς επιλογή, ένα κλικ — όχι «συμπληρώστε τα πεδία»', () => {
    expect(handoverProblem([pack()], [], null)).toBe('Διαλέξτε πακέτο από τα παραδομένα.');
  });

  it('πακέτο που άνοιξε αλλού όσο ήταν ανοιχτό το παράθυρο', () => {
    expect(handoverProblem([pack({ id: 'a' })], [], 'b')).toContain('δεν είναι πια διαθέσιμο');
  });

  it('σωστή επιλογή δεν εμποδίζεται', () => {
    expect(handoverProblem([pack({ id: 'a' })], [], 'a')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Το 0076: ΠΟΙΑ πακέτα βλέπει ο υπάλληλος όταν ανοίγει καινούριο.
// ---------------------------------------------------------------------
describe('ο υπάλληλος βλέπει μόνο ό,τι του παραδόθηκε', () => {
  it('τα παραδομένα προσφέρονται, τα υπόλοιπα όχι', () => {
    // Το λάθος που λύνει: η λίστα πρόσφερε ΟΛΗ την αποθήκη - στη Λαμία 42
    // πακέτα, 12.600 € - και ζητούσε από τον υπάλληλο να βρει μέσα εκεί
    // αυτό που κρατούσε στο χέρι.
    const choices = handoverChoices(
      [pack({ id: 'delivered' }), onShelf({ id: 'shelf1' }), onShelf({ id: 'shelf2' })],
      'scr_2_gata'
    );
    expect(choices.ready.map((p) => p.id)).toEqual(['delivered']);
    expect(choices.waiting.map((p) => p.id)).toEqual(['shelf1', 'shelf2']);
  });

  it('παλαιότερο πρώτο ισχύει μέσα στα παραδομένα', () => {
    const choices = handoverChoices(
      [
        pack({ id: 'new', received_at: '2026-10-20' }),
        onShelf({ id: 'oldest', received_at: '2026-08-01' }),
        pack({ id: 'old', received_at: '2026-09-10' }),
      ],
      'scr_2_gata'
    );
    // Το παλαιότερο απ' όλα κάθεται στο ράφι και ΔΕΝ προσφέρεται - η σειρά
    // αφορά μόνο όσα μπορεί να ανοίξει.
    expect(choices.ready.map((p) => p.id)).toEqual(['old', 'new']);
  });

  it('άλλο παιχνίδι δεν μπαίνει σε καμία από τις δύο ομάδες', () => {
    const choices = handoverChoices([pack({ catalog_code: 'scr_5_gata' })], 'scr_2_gata');
    expect(choices.ready).toEqual([]);
    expect(choices.waiting).toEqual([]);
  });

  it('υπάρχει στο ράφι αλλά δεν παραδόθηκε: ένα κλικ του αντμιν, όχι νέα καταχώρηση', () => {
    // Αυτό θα συναντήσει συχνότερα ο υπάλληλος. Το παλιό μήνυμα έλεγε
    // «καταχωρήστε το πρώτα», και θα τον έστελνε να γράψει δεύτερη φορά
    // ένα πακέτο που υπάρχει ήδη - δηλαδή διπλή αξία 300 € στην αποθήκη.
    const one = handoverProblem([], [onShelf()], null);
    expect(one).toContain('δεν έχει παραδοθεί');
    expect(one).not.toContain('Καταχωρήστε');

    const three = handoverProblem([], [onShelf(), onShelf(), onShelf()], null);
    expect(three).toContain('3 πακέτα');
    expect(three).toContain('κανένα δεν έχει παραδοθεί');
  });

  it('πουθενά τίποτα: τότε όντως είναι καταχώρηση ή παραγγελία', () => {
    expect(handoverProblem([], [], null)).toContain('Καταχωρήστε');
  });

  it('ένα παραδομένο ανάμεσα σε σαράντα δύο στο ράφι δίνει μία επιλογή', () => {
    const shelf = Array.from({ length: 42 }, (_, i) => onShelf({ id: `s${i}` }));
    const { ready, waiting } = handoverChoices([...shelf, pack({ id: 'mine' })], 'scr_2_gata');
    expect(ready).toHaveLength(1);
    expect(waiting).toHaveLength(42);
    expect(handoverProblem(ready, waiting, 'mine')).toBeNull();
  });
});
