import { describe, expect, it } from 'vitest';
import {
  creditDispositionNote, deletionLines, needsCreditChoice,
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
