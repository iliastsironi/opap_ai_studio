import { describe, it, expect } from 'vitest';
import { auditExpectedCash, toraPosTotal } from '../lib/reportsAudit';

/**
 * Η βραδινή της 10/11 στη Λαμία, όπως είναι αποθηκευμένη. Η επιθεώρηση
 * έδειχνε κουτάκια που έβγαζαν 2.589,79 € κάτω από μια μπάρα που έλεγε
 * 5.673,99 €. Αυτά είναι τα ωμά πεδία της γραμμής.
 */
const LAMIA_NIGHT_10_11 = {
  number_games_sales: 3473.5,
  number_games_payouts: 1329.3,
  number_games_vouchers: 393.16,
  number_games_cancellations: 13.5,
  // Το σύνθετο που κρύβει το Πάμε Στοίχημα μέσα του. Μπαίνει στο input
  // επίτηδες: αν η συνάρτηση το διαβάσει, το τεστ πέφτει.
  opap_gross_sales: 3642.93,
  opap_payouts: 936.14,
  pame_stoixima_balance: 182.93,
  clever_point: 0,
  ippodromos_balance: 0,
  scratch_lotto_sales: 188,
  scratch_gross_sales: 582,
  scratch_payouts: 394,
  vlts_cash_in: 2260,
  vlts_cash_out: -933.8,
  vlts_net: 1326.2,
  fnb_cash: 201.9,
  tora_total: 1251.1,
  custom_field_values: {
    tora_pos_items: [{ id: 'tora_1', name: 'TORA DIRECT #1', amount: '1251.1' }],
  },
  expected_cash: 5673.99,
};

describe('auditExpectedCash', () => {
  it('αναπαράγει το αποθηκευμένο σύνολο της βραδινής 10/11 στο λεπτό', () => {
    const audit = auditExpectedCash(LAMIA_NIGHT_10_11);
    expect(audit.computed).toBe(5673.99);
    expect(audit.stored).toBe(5673.99);
    expect(audit.unexplained).toBe(0);
    expect(audit.balances).toBe(true);
  });

  it('δεν βάζει γραμμή αδικαιολόγητης διαφοράς όταν βγαίνει', () => {
    const audit = auditExpectedCash(LAMIA_NIGHT_10_11);
    expect(audit.lines.some((l) => l.key === 'UNEXPLAINED')).toBe(false);
  });

  it('δίνει στο Πάμε Στοίχημα δική του γραμμή αντί να το κρύβει στο μικτό ΟΠΑΠ', () => {
    const pame = auditExpectedCash(LAMIA_NIGHT_10_11).lines.find((l) => l.key === 'PAME');
    expect(pame?.amount).toBe(182.93);
  });

  it('διαβάζει τα ωμά αριθμοπαιχνίδια, όχι το σύνθετο opap_gross_sales', () => {
    const lines = auditExpectedCash(LAMIA_NIGHT_10_11).lines;
    expect(lines.find((l) => l.key === 'GAMES_SALES')?.amount).toBe(3473.5);
    expect(lines.find((l) => l.key === 'GAMES_PAYOUTS')?.amount).toBe(-1329.3);
  });

  it('προσθέτει το TORA POS, δεν το αφαιρεί', () => {
    const tora = auditExpectedCash(LAMIA_NIGHT_10_11).lines.find((l) => l.key === 'TORA');
    expect(tora?.amount).toBe(1251.1);
  });

  it('το άθροισμα των γραμμών ΕΙΝΑΙ το computed - καμία κρυφή πράξη', () => {
    const audit = auditExpectedCash(LAMIA_NIGHT_10_11);
    const sum = audit.lines
      .filter((l) => l.key !== 'UNEXPLAINED')
      .reduce((acc, l) => acc + l.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(audit.computed);
  });

  it('ονοματίζει ό,τι δεν εξηγείται, με πρόσημο', () => {
    const audit = auditExpectedCash({ ...LAMIA_NIGHT_10_11, expected_cash: 5700 });
    expect(audit.balances).toBe(false);
    expect(audit.unexplained).toBe(26.01);
    const gap = audit.lines.find((l) => l.key === 'UNEXPLAINED');
    expect(gap?.amount).toBe(26.01);
    expect(gap?.label).toBe('Αδικαιολόγητη διαφορά');
  });

  it('χωρίς αποθηκευμένο σύνολο δεν κατηγορεί τη βάρδια για ολόκληρο το ταμείο', () => {
    const { expected_cash, ...noStored } = LAMIA_NIGHT_10_11;
    void expected_cash;
    const audit = auditExpectedCash(noStored);
    expect(audit.stored).toBe(audit.computed);
    expect(audit.balances).toBe(true);
  });

  it('πέφτει στα arithmo_* όταν λείπουν τα number_games_*', () => {
    const audit = auditExpectedCash({
      arithmo_gross: 1000,
      arithmo_payouts: 400,
      arithmo_vouchers: 50,
      arithmo_cancels: 10,
      scratch_lotto_sales: 0,
      vlts_net: 0,
      fnb_cash: 0,
      expected_cash: 640,
    });
    expect(audit.computed).toBe(640);
    expect(audit.balances).toBe(true);
  });

  it('ένας μηδενικός ιππόδρομος που δηλώθηκε δεν πέφτει στο alias', () => {
    const audit = auditExpectedCash({
      ippodromos: 0,
      ippodromos_balance: 50,
      scratch_lotto_sales: 0,
      vlts_net: 0,
      fnb_cash: 0,
    });
    expect(audit.lines.find((l) => l.key === 'IPPODROMOS')?.amount).toBe(0);
  });

  it('οι μηδενικές γραμμές που δεν αφορούν κανέναν κρύβονται, οι βασικές μένουν', () => {
    const audit = auditExpectedCash({
      number_games_sales: 100,
      number_games_payouts: 0,
      scratch_lotto_sales: 0,
      vlts_net: 0,
      fnb_cash: 0,
      expected_cash: 100,
    });
    const shown = audit.lines.filter((l) => !l.onlyWhenSet || Math.abs(l.amount) > 0.005);
    const keys = shown.map((l) => l.key);
    // Πληρωμές στο μηδέν: «δεν πλήρωσε τίποτα» είναι απάντηση, μένει.
    expect(keys).toContain('GAMES_PAYOUTS');
    expect(keys).toContain('SCRATCH');
    expect(keys).toContain('TORA');
    // Πάμε Στοίχημα και Clever σε κατάστημα που δεν τα έχει: δεν φουσκώνουν.
    expect(keys).not.toContain('PAME');
    expect(keys).not.toContain('CLEVER');
  });

  it('τα μετρητά του καφέ αφαιρούν τις κάρτες όταν δεν δηλώθηκαν ξεχωριστά', () => {
    const audit = auditExpectedCash({
      fnb_cash: 0,
      fnb_sales: 120,
      fnb_card: 120,
      scratch_lotto_sales: 0,
      vlts_net: 0,
    });
    expect(audit.lines.find((l) => l.key === 'FNB')?.amount).toBe(0);
  });
});

describe('ελληνικό κόμμα στα ποσά', () => {
  /**
   * Ο υπάλληλος γράφει «117,22» σε ελληνικό πληκτρολόγιο και το ποσό
   * αποθηκεύεται έτσι. Το parseFloat σταματάει στο κόμμα και δίνει 117:
   * δύο λεπτά χαμένα ανά γραμμή, σε 97 από τις 102 βάρδιες.
   */
  it('διαβάζει τα λεπτά από ποσό με κόμμα', () => {
    expect(toraPosTotal({ tora_pos_items: [{ amount: '117,22' }] })).toBe(117.22);
  });

  it('η στήλη βγαίνει όταν το TORA είναι γραμμένο με κόμμα', () => {
    const audit = auditExpectedCash({
      number_games_sales: 2022,
      number_games_payouts: 1043.24,
      number_games_vouchers: 19.73,
      number_games_cancellations: 19,
      pame_stoixima_balance: 111.23,
      ippodromos_balance: -0.5,
      scratch_lotto_sales: 17,
      vlts_net: -22.1,
      fnb_cash: 0,
      custom_field_values: { tora_pos_items: [{ amount: '117,22' }] },
      expected_cash: 1202.34,
    });
    expect(audit.computed).toBe(1202.34);
    expect(audit.balances).toBe(true);
  });

  it('ποσό με τελεία μένει όπως ήταν', () => {
    expect(toraPosTotal({ tora_pos_items: [{ amount: '117.22' }] })).toBe(117.22);
  });
});

describe('toraPosTotal', () => {
  it('αθροίζει τις γραμμές που πληκτρολόγησε ο υπάλληλος', () => {
    expect(
      toraPosTotal({ tora_pos_items: [{ amount: '100.5' }, { amount: 20 }], tora_total: 999 })
    ).toBe(120.5);
  });

  it('πέφτει στη στήλη όταν δεν υπάρχουν γραμμές', () => {
    expect(toraPosTotal({ tora_pos_items: [], tora_total: 1251.1 })).toBe(1251.1);
  });

  it('διαβάζει και από τα custom_field_values', () => {
    expect(toraPosTotal({ custom_field_values: { tora_pos_items: [{ amount: 7 }] } })).toBe(7);
  });
});
