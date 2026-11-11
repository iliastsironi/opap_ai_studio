import { describe, expect, it } from 'vitest';
import { auditCountedCash, auditGrossCount } from '../lib/countedCashAudit.ts';

const line = (a: ReturnType<typeof auditCountedCash>, key: string) =>
  a.lines.find((l) => l.key === key);

/**
 * Η βραδινή της 10/11 στη Λαμία, με τα πραγματικά της νούμερα.
 *
 * Τα κοψίματα έβγαζαν 6.091 € και το αποθηκευμένο σύνολο 6.116 €. Τα 25 €
 * ήταν το κύπελλο που είχε στείλει ο μεσημεριανός - σωστά μετρημένα, και
 * χωρίς καμία γραμμή στην οθόνη να τα εξηγεί.
 */
describe('βγαίνει το μέτρημα της βάρδιας;', () => {
  it('τα 25 € του μεσημεριανού έχουν πια γραμμή, και το σύνολο βγαίνει', () => {
    const a = auditCountedCash({
      notes: 5800, coins: 291, ownHandover: 0, carriedToday: 25, stored: 6116,
    });
    expect(line(a, 'CARRIED_CUP')!.amount).toBe(25);
    expect(a.computed).toBe(6116);
    expect(a.unexplained).toBe(0);
    expect(a.balances).toBe(true);
    expect(line(a, 'UNEXPLAINED')).toBeUndefined();
  });

  it('και ο μεσημεριανός δείχνει το ΔΙΚΟ του κύπελλο, όχι κουβαλημένο', () => {
    const a = auditCountedCash({
      notes: 2215, coins: 203.4, ownHandover: 25, carriedToday: 0, stored: 2443.4,
    });
    expect(line(a, 'OWN_CUP')!.amount).toBe(25);
    expect(line(a, 'CARRIED_CUP')!.amount).toBe(0);
    expect(a.balances).toBe(true);
  });

  it('ό,τι δεν εξηγείται παίρνει δική του γραμμή και δικό του όνομα', () => {
    // Αυτό είναι το νόημα της επιθεώρησης: να ΦΑΙΝΕΤΑΙ το λάθος.
    const a = auditCountedCash({ notes: 1000, coins: 50, stored: 1120 });
    expect(a.balances).toBe(false);
    expect(a.unexplained).toBe(70);
    expect(line(a, 'UNEXPLAINED')!.amount).toBe(70);
    expect(line(a, 'UNEXPLAINED')!.hint).toContain('έλεγχο');
  });

  it('διαφορά προς τα κάτω φαίνεται κι αυτή, με πρόσημο', () => {
    const a = auditCountedCash({ notes: 1000, coins: 50, stored: 1020 });
    expect(a.unexplained).toBe(-30);
  });

  it('τα λεπτά δεν γίνονται καταγγελία', () => {
    const a = auditCountedCash({ notes: 1000, coins: 50.004, stored: 1050 });
    expect(a.balances).toBe(true);
  });

  it('χωρίς αποθηκευμένο σύνολο δεν κατηγορεί κανέναν', () => {
    // Μια παλιά γραμμή χωρίς counted_cash δεν επιτρέπεται να διαβαστεί ως
    // «λείπει ολόκληρο το ταμείο».
    const a = auditCountedCash({ notes: 1000, coins: 50 });
    expect(a.stored).toBe(1050);
    expect(a.balances).toBe(true);
  });

  it('οι βασικές γραμμές υπάρχουν πάντα, ακόμα και στο μηδέν', () => {
    // «Δεν παραδόθηκαν κέρματα» είναι απάντηση· μια γραμμή που λείπει
    // αφήνει τον αναγνώστη να αναρωτιέται αν ήταν μηδέν ή αν δεν γράφτηκε.
    const a = auditCountedCash({ notes: 500, coins: 20, stored: 520 });
    expect(a.lines.filter((l) => !l.onlyWhenSet).map((l) => l.key))
      .toEqual(['NOTES', 'COINS', 'OWN_CUP']);
  });
});

describe('auditGrossCount', () => {
  /** Η βραδινή της 10/11: 6.116 μετρημένα + 796 POS + 160,15 έξοδα + 55 − 258,50. */
  const LAMIA_NIGHT = {
    counted: 6116,
    bankDeposits: 0,
    storePos: 796,
    expensesGp: 160.15,
    expensesFnb: 0,
    creditsGranted: 55,
    creditsCollected: 258.5,
    stored: 6868.65,
  };

  it('βγαίνει όταν οι γραμμές δίνουν το αποθηκευμένο μικτό', () => {
    const audit = auditGrossCount(LAMIA_NIGHT);
    expect(audit.computed).toBe(6868.65);
    expect(audit.stored).toBe(6868.65);
    expect(audit.unexplained).toBe(0);
    expect(audit.balances).toBe(true);
  });

  it('τα 25 € της προηγούμενης βάρδιας μετρούν μέσα στο μικτό', () => {
    // Χωρίς αυτά, όπως υπολόγιζε η οθόνη πριν: 6.091 αντί 6.116.
    const audit = auditGrossCount({ ...LAMIA_NIGHT, counted: 6091 });
    expect(audit.computed).toBe(6843.65);
    expect(audit.balances).toBe(false);
    expect(audit.unexplained).toBe(25);
  });

  it('ονοματίζει ένα παλιωμένο αποθηκευμένο μικτό αντί να το δείχνει σιωπηλά', () => {
    // Πρόχειρη βάρδια του demo: όλες οι γραμμές μηδέν, αποθηκευμένο 180 €.
    const audit = auditGrossCount({ counted: 0, stored: 180 });
    expect(audit.computed).toBe(0);
    expect(audit.stored).toBe(180);
    expect(audit.unexplained).toBe(180);
    expect(audit.balances).toBe(false);
  });

  it('χωρίς αποθηκευμένο μικτό δεν κατηγορεί τη βάρδια', () => {
    const audit = auditGrossCount({ counted: 500, storePos: 100 });
    expect(audit.stored).toBe(600);
    expect(audit.balances).toBe(true);
  });

  it('οι επιστροφές αφαιρούνται', () => {
    expect(auditGrossCount({ counted: 100, creditsCollected: 40 }).computed).toBe(60);
  });

  it('διαβάζει ποσό γραμμένο με ελληνικό κόμμα', () => {
    expect(auditGrossCount({ counted: '100,50', storePos: '10,25' }).computed).toBe(110.75);
  });
});
