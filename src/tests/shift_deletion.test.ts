import { describe, expect, it } from 'vitest';
import {
  creditChoiceMissing, creditDispositionNote, deletionLines, needsCreditChoice,
  type ShiftDeletionCounts,
} from '../lib/shiftDeletion.ts';

const counts = (over: Partial<ShiftDeletionCounts> = {}): ShiftDeletionCounts => ({
  expenses: 0, employeeCharges: 0, customerCredits: 0, customerCreditTotal: 0,
  cashTransfers: 0, warehousePacks: 0, ...over,
});

describe('τι δείχνει το παράθυρο πριν σβήσει', () => {
  it('μόνο ό,τι υπάρχει — καμία γραμμή με μηδενικά', () => {
    // Μια λίστα που λέει «0 έξοδα» κάθε φορά εκπαιδεύει να την προσπερνάς.
    expect(deletionLines(counts(), 'KEEP')).toEqual([]);
  });

  it('τα έξοδα και οι χρεώσεις υπαλλήλων φεύγουν πάντα', () => {
    const lines = deletionLines(counts({ expenses: 3, employeeCharges: 1 }), 'KEEP');
    expect(lines.map((l) => l.fate)).toEqual(['GOES', 'GOES']);
    expect(lines[0].detail).toBe('3 εγγραφές');
    expect(lines[1].detail).toBe('1 εγγραφή');
  });

  it('οι χρεώσεις πελατών αλλάζουν μοίρα με την επιλογή', () => {
    const c = counts({ customerCredits: 2, customerCreditTotal: 45 });
    expect(deletionLines(c, 'DELETE')[0].fate).toBe('GOES');

    const kept = deletionLines(c, 'KEEP')[0];
    expect(kept.fate).toBe('DETACHES');
    expect(kept.detail).toContain('το χρέος παραμένει');
  });

  it('τα ευρώ φαίνονται, για να μην αποφασίζεται στα τυφλά', () => {
    const line = deletionLines(counts({ customerCredits: 2, customerCreditTotal: 45 }), 'DELETE')[0];
    expect(line.detail).toContain('45');
  });

  it('οι μεταφορές μετρητών μένουν — αφορούν και άλλο κατάστημα', () => {
    const line = deletionLines(counts({ cashTransfers: 1 }), 'DELETE')[0];
    expect(line.fate).toBe('DETACHES');
  });
});

describe('πότε ρωτάει για τις χρεώσεις', () => {
  it('μόνο όταν υπάρχουν', () => {
    expect(needsCreditChoice(counts())).toBe(false);
    expect(needsCreditChoice(counts({ customerCredits: 1 }))).toBe(true);
  });
});

describe('τι μένει στο ιστορικό', () => {
  it('καταγράφει την επιλογή, γιατί το trigger δεν τη βλέπει', () => {
    const c = counts({ customerCredits: 2, customerCreditTotal: 45 });
    expect(creditDispositionNote(c, 'DELETE')).toContain('Διαγράφηκαν 2');
    expect(creditDispositionNote(c, 'KEEP')).toContain('Διατηρήθηκαν 2');
    expect(creditDispositionNote(counts(), 'KEEP')).toBe('Καμία χρέωση πελάτη.');
  });
});

describe('τα πακέτα της αποθήκης', () => {
  it('επιστρέφουν στο ράφι — κανείς δεν τα πούλησε', () => {
    // Η διαγραφή βάρδιας μηδένιζε το moved_shift_id και τα άφηνε IN_STORE:
    // καμία βάρδια δεν τα κρατούσε και η αποθήκη τα θεωρούσε στον πάγκο.
    const line = deletionLines(counts({ warehousePacks: 3 }), 'KEEP')[0];
    expect(line.fate).toBe('STAYS');
    expect(line.detail).toContain('3 πακέτα επιστρέφουν');
  });

  it('ένα πακέτο στον ενικό', () => {
    expect(deletionLines(counts({ warehousePacks: 1 }), 'KEEP')[0].detail)
      .toContain('1 πακέτο επιστρέφει');
  });

  it('καμία γραμμή όταν δεν είχε πάρει πακέτα', () => {
    expect(deletionLines(counts(), 'KEEP')).toEqual([]);
  });
});

describe('η επιλογή για τις χρεώσεις δεν έχει προεπιλογή', () => {
  const withCredits = counts({ customerCredits: 10, customerCreditTotal: 457 });
  const without = counts({ customerCredits: 0, customerCreditTotal: 0 });

  it('blocks the delete while the question is unanswered', () => {
    // 5/11/2026: έφυγαν 20 βάρδιες με προεπιλεγμένο «Να μείνουν» και 10
    // χρεώσεις έμειναν στους πελάτες χωρίς να λέει τίποτα από πού ήρθαν.
    expect(creditChoiceMissing(withCredits, null)).toBe(true);
    expect(creditChoiceMissing(withCredits, 'KEEP')).toBe(false);
    expect(creditChoiceMissing(withCredits, 'DELETE')).toBe(false);
  });

  it('does not ask when there is nothing to decide', () => {
    expect(creditChoiceMissing(without, null)).toBe(false);
  });

  it('blocks while the counts are still being read', () => {
    // Άγνωστο δεν είναι «κανένα»: όσο δεν ξέρουμε αν υπάρχουν χρεώσεις, η
    // οριστική πράξη δεν φεύγει.
    expect(creditChoiceMissing(null, null)).toBe(true);
    expect(creditChoiceMissing(null, 'DELETE')).toBe(true);
  });

  it('says what is still missing instead of pretending a default', () => {
    const note = creditDispositionNote(withCredits, null);
    expect(note).toContain('διαλέξτε');
    expect(note).not.toContain('Διατηρήθηκαν');
    expect(note).not.toContain('Διαγράφηκαν');
  });

  it('marks the credits line as undecided rather than kept', () => {
    const line = deletionLines(withCredits, null).find((l) => l.label === 'Χρεώσεις πελατών')!;
    expect(line.detail).toContain('διαλέξτε');
    expect(line.detail).not.toContain('παραμένει στο τεφτέρι');
  });

  it('agrees with needsCreditChoice, which is the same question', () => {
    for (const c of [withCredits, without]) {
      expect(creditChoiceMissing(c, null)).toBe(needsCreditChoice(c));
    }
  });
});
