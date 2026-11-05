import { describe, expect, it } from 'vitest';
import { debtBeforeLine, sameCustomer } from '../lib/creditRunningDebt.ts';

const granted = (id: string, amount: number) => ({ customer_id: id, type: 'GRANTED', amount });
const collected = (id: string, amount: number) => ({ customer_id: id, type: 'COLLECTED', amount });

describe('η οφειλή μέσα στην ίδια βάρδια', () => {
  it('η πρώτη γραμμή βλέπει την αποθηκευμένη', () => {
    expect(debtBeforeLine([granted('k', 36)], 0, 198.5)).toBe(198.5);
  });

  it('η είσπραξη της προηγούμενης γραμμής μετράει', () => {
    // Το στιγμιότυπο του Owner: χρωστάει 198,50, φέρνει 198,50, και η
    // επόμενη γραμμή τον μπλόκαρε επειδή «οφείλει ήδη 198,50».
    const lines = [collected('k', 198.5), granted('k', 36)];
    expect(debtBeforeLine(lines, 1, 198.5)).toBe(0);
  });

  it('η σειρά μετράει', () => {
    // Χρέωση μετά εξόφληση δεν είναι το ίδιο με εξόφληση μετά χρέωση.
    const after = [granted('k', 50), collected('k', 198.5)];
    expect(debtBeforeLine(after, 1, 198.5)).toBe(248.5);
  });

  it('η ίδια η γραμμή δεν μετράει τον εαυτό της', () => {
    // Αλλιώς «τι χωράει ακόμα» θα απαντούσε πάντα όχι.
    expect(debtBeforeLine([granted('k', 500)], 0, 0)).toBe(0);
  });

  it('άλλος πελάτης δεν επηρεάζει', () => {
    const lines = [collected('allos', 500), granted('k', 36)];
    expect(debtBeforeLine(lines, 1, 198.5)).toBe(198.5);
  });

  it('υπερπληρωμή δεν δίνει επιπλέον όριο', () => {
    // Κατάθεση, όχι πιστωτικό περιθώριο πάνω από τη βαθμίδα.
    expect(debtBeforeLine([collected('k', 300), granted('k', 10)], 1, 198.5)).toBe(0);
  });

  it('πολλές γραμμές μαζεύονται με τη σειρά', () => {
    const lines = [granted('k', 50), collected('k', 30), granted('k', 20), granted('k', 10)];
    expect(debtBeforeLine(lines, 3, 100)).toBe(140);
  });

  it('κενός τύπος είναι χρέωση', () => {
    expect(debtBeforeLine([{ customer_id: 'k', amount: 40 }, granted('k', 5)], 1, 0)).toBe(40);
  });
});

describe('ποιος είναι ο ίδιος πελάτης', () => {
  it('με id όταν υπάρχει', () => {
    expect(sameCustomer({ customer_id: 'a' }, { customer_id: 'a' })).toBe(true);
    expect(sameCustomer({ customer_id: 'a' }, { customer_id: 'b' })).toBe(false);
  });

  it('με όνομα όταν λείπει το id — νέος πελάτης που δεν σώθηκε ακόμα', () => {
    expect(sameCustomer({ customer_name: ' Κώστας ' }, { customer_name: 'κώστας' })).toBe(true);
  });

  it('κενό όνομα δεν ταιριάζει με κενό', () => {
    expect(sameCustomer({ customer_name: '' }, { customer_name: '' })).toBe(false);
  });
});
