import { describe, expect, it } from 'vitest';
import { storeOptionLabel, visibleStores } from '../lib/storeAccess.ts';

/**
 * Το «0» που είδε ο υπάλληλος στην «Έναρξη Νέας Βάρδιας».
 *
 * Η λίστα καταστημάτων χτιζόταν από τις αναθέσεις του χρήστη, και το
 * user_store_assignments κρατάει μόνο store_id - ούτε όνομα ούτε κωδικό.
 * Το `{s.name} ({s.code})` έβγαζε « ()», δύο παρενθέσεις κολλητά, που στην
 * οθόνη διαβάζονται σαν μηδενικό. Η τιμή του option ήταν σωστή· απλώς
 * κανείς δεν μπορούσε να δει τι διάλεγε.
 */
describe('η ετικέτα ενός καταστήματος σε λίστα επιλογής', () => {
  it('όνομα και κωδικός μαζί, όπως πάντα', () => {
    expect(storeOptionLabel({ id: 'store_1', name: 'Allwyn Store | Lamia', code: '101499' }))
      .toBe('Allwyn Store | Lamia (101499)');
  });

  it('ΠΟΤΕ δεν βγαίνει « ()» — αυτό ήταν το μηδενικό', () => {
    // Ακριβώς το σχήμα που έφτανε στην οθόνη: ανάθεση χωρίς όνομα/κωδικό.
    const label = storeOptionLabel({ id: 'store_1792183703991_d2vu' });
    expect(label).not.toBe(' ()');
    expect(label).not.toMatch(/^\s*\(\s*\)\s*$/);
    expect(label.trim().length).toBeGreaterThan(0);
    // Το id είναι άσχημο, αλλά διαλέγεται.
    expect(label).toBe('store_1792183703991_d2vu');
  });

  it('με ό,τι υπάρχει από τα δύο', () => {
    expect(storeOptionLabel({ id: 'x', name: 'Allwyn_Play' })).toBe('Allwyn_Play');
    expect(storeOptionLabel({ id: 'x', code: '401070' })).toBe('401070');
  });

  it('δεν επαναλαμβάνει τον εαυτό του όταν όνομα και κωδικός ταυτίζονται', () => {
    expect(storeOptionLabel({ id: 'x', name: '101499', code: '101499' })).toBe('101499');
  });

  it('κενά και μηδενικά δεν περνάνε για ετικέτα', () => {
    expect(storeOptionLabel({ id: 'x', name: '   ', code: '  ' })).toBe('x');
    expect(storeOptionLabel({})).toBe('—');
    expect(storeOptionLabel(null)).toBe('—');
    expect(storeOptionLabel(undefined)).toBe('—');
  });
});

describe('ποια καταστήματα βλέπει ο υπάλληλος', () => {
  const all = [
    { id: 'store_lamia', name: 'Allwyn Store | Lamia', code: '101499' },
    { id: 'store_stilida', name: 'Allwyn Store | Stilida', code: '101498' },
    { id: 'store_play', name: 'Allwyn_Play', code: '401070' },
  ];

  it('μόνο τα δικά του — και με τα ονόματά τους', () => {
    // Αυτό είναι που χάθηκε: το φιλτράρισμα γινόταν ήδη εδώ, με τα ΠΛΗΡΗ
    // αντικείμενα. Η οθόνη το ξανάκανε μόνη της πάνω στις αναθέσεις, που
    // δεν έχουν ονόματα, και έχασε και τα δύο.
    const mine = visibleStores(all, [{ store_id: 'store_lamia' }], false);
    expect(mine.map(storeOptionLabel)).toEqual(['Allwyn Store | Lamia (101499)']);
  });

  it('ο ιδιοκτήτης τα βλέπει όλα, ακόμα κι αν έχει μία ανάθεση', () => {
    // Παλιά η οθόνη τον περιόριζε σε εκείνο το ένα, επειδή κοιτούσε τις
    // αναθέσεις πριν ρωτήσει τον ρόλο.
    const his = visibleStores(all, [{ store_id: 'store_lamia' }], true);
    expect(his).toHaveLength(3);
  });

  it('ανάθεση σε κατάστημα που δεν υπάρχει πια δεν δίνει φάντασμα', () => {
    expect(visibleStores(all, [{ store_id: 'store_deleted' }], false)).toEqual([]);
  });
});
