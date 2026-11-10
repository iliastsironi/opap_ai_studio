import { describe, it, expect } from 'vitest';
import {
  calculateExpectedCash,
  calculateReconciliationBreakdown,
  roundCurrency,
} from '../services/financialCalculator.js';
import { scratchGrossOf } from '../components/shifts/ShiftLedgerSheet.tsx';

/**
 * Η πρώτη βάρδια της Στυλίδας, όπως τη βρήκαμε στη βάση.
 *
 * Shift 51a99192 of store_1794298638451_sfzp, 1/11/2026 πρωί - the agency's
 * third shop, entered by the Owner the day he opened it. Every figure here is
 * the live row, not an invention, because the point of these tests is that the
 * till DOES balance: it comes to five cents, and the only reason the screen
 * said «+10,05 € πλεόνασμα» is that the 10 € of Ιππόδρομος was never counted.
 */
const STILIDA = {
  arithmoGross: 766,
  arithmoCancels: 37,
  arithmoPayouts: 255,
  arithmoVouchers: -165.5,
  // Μεγάλη πληρωμή Πάμε Στοίχημα: το ταμείο έβγαλε πολύ περισσότερα απ' όσα
  // πούλησε, και το υπόλοιπο της αναφοράς είναι αρνητικό.
  pameStoixima: -2605.35,
  ippodromos: 10,
  scratchGross: 94,
  scratchPayouts: 60,
  tora: 112.12,
  vltsNet: 2.5,
  openingCash: 4410.7, // 2.000 χαρτονομίσματα + 410,70 κέρματα + 2.000 προσαύξηση
  drawer: 2289.3,
  pos: 228.72,
  creditsGranted: 47.5,
  creditsCollected: 293,
};

const expectedFor = (ippodromos: number) =>
  calculateExpectedCash({
    opap_gross_sales: STILIDA.arithmoGross,
    opap_payouts: STILIDA.arithmoPayouts,
    vouchers: STILIDA.arithmoVouchers,
    cancellations: STILIDA.arithmoCancels,
    pame_stoixima: STILIDA.pameStoixima,
    scratch_lotto_sales: STILIDA.scratchGross - STILIDA.scratchPayouts,
    tora_pos: STILIDA.tora,
    clever_point: 0,
    ippodromos,
    vlts_cash_in: 0,
    vlts_cash_out: STILIDA.vltsNet,
    fnb_cash: 0,
    fnb_sales: 0,
    fnb_card: 0,
  });

const countedFor = (collected: number) =>
  calculateReconciliationBreakdown({
    openingCash: STILIDA.openingCash,
    countedCashInDrawer: STILIDA.drawer,
    posSalesTotal: STILIDA.pos,
    expensesTotal: 0,
    bankDeposits: 0,
    safeDirection: 'DROP',
    customerCreditsGranted: STILIDA.creditsGranted,
    customerReturns: collected,
  });

describe('ο ιππόδρομος μπαίνει στο ταμείο', () => {
  it('μετράει, όπως μετράει το πάμε στοίχημα', () => {
    const withIt = expectedFor(10);
    const withoutIt = expectedFor(0);
    expect(roundCurrency(withIt - withoutIt)).toBe(10);
  });

  it('είναι προσημασμένος: μια πληρωμή ιπποδρόμου κατεβάζει το αναμενόμενο', () => {
    expect(roundCurrency(expectedFor(-40) - expectedFor(0))).toBe(-40);
  });

  it('το μηδέν του είναι απάντηση, όχι απουσία', () => {
    // Μια βάρδια που μέτρησε τον Ιππόδρομο και τον βρήκε στο μηδέν δεν
    // πρέπει να πέφτει πίσω στο συνώνυμο πεδίο.
    const zeroWins = calculateExpectedCash({ ippodromos: 0, ippodromos_balance: 50 });
    expect(zeroWins).toBe(0);
    const aliasAlone = calculateExpectedCash({ ippodromos_balance: 50 });
    expect(aliasAlone).toBe(50);
  });

  it('η βάρδια της Στυλίδας κλείνει στα πέντε λεπτά, όχι στα δέκα ευρώ', () => {
    const counted = countedFor(STILIDA.creditsCollected).netTotal;
    expect(counted).toBe(-2138.18);

    expect(expectedFor(STILIDA.ippodromos)).toBe(-2138.23);
    expect(roundCurrency(counted - expectedFor(STILIDA.ippodromos))).toBe(0.05);

    // Ό,τι έβλεπε ο ιδιοκτήτης πριν: ο ιππόδρομος έλειπε και η διαφορά ήταν
    // ακριβώς αυτός.
    expect(expectedFor(0)).toBe(-2148.23);
    expect(roundCurrency(counted - expectedFor(0))).toBe(10.05);
  });
});

describe('η καρτέλα λέει ό,τι λέει το κλείσιμο', () => {
  it('το ίδιο αναμενόμενο, όπως κι αν κρατάει κανείς τα VLT', () => {
    // Το κλείσιμο γράφει τα δύο σκέλη, η καρτέλα κρατάει το καθαρό.
    const closing = expectedFor(STILIDA.ippodromos);
    const ledger = calculateExpectedCash({
      opap_gross_sales: STILIDA.arithmoGross,
      opap_payouts: STILIDA.arithmoPayouts,
      vouchers: STILIDA.arithmoVouchers,
      cancellations: STILIDA.arithmoCancels,
      pame_stoixima: STILIDA.pameStoixima,
      scratch_lotto_sales: STILIDA.scratchGross - STILIDA.scratchPayouts,
      tora_pos: STILIDA.tora,
      clever_point: 0,
      ippodromos: STILIDA.ippodromos,
      vlts_net: STILIDA.vltsNet,
      fnb_cash: 0,
      fnb_card: 0,
    });
    expect(ledger).toBe(closing);
  });

  it('η είσπραξη πελάτη δεν είναι έσοδο της βάρδιας', () => {
    const right = countedFor(STILIDA.creditsCollected).grossTotal;
    expect(right).toBe(2272.52);

    // Η καρτέλα την πρόσθετε αντί να την αφαιρεί. Η απόσταση των δύο
    // απαντήσεων είναι δύο φορές η είσπραξη - 586 € σε μια βάρδια που
    // ισοσκελίζει στα πέντε λεπτά.
    const wrong = roundCurrency(
      STILIDA.drawer + STILIDA.pos + STILIDA.creditsGranted + STILIDA.creditsCollected
    );
    expect(roundCurrency(wrong - right)).toBe(roundCurrency(2 * STILIDA.creditsCollected));
  });

  it('τα τέσσερα πλακίδια της καρτέλας κλείνουν μεταξύ τους', () => {
    // Αρχικό + Αναμενόμενα = Φυσική Καταμέτρηση − Απόκλιση. Αυτή η ισότητα
    // έσπαγε, και είναι ο λόγος που ο ιδιοκτήτης δεν έβγαζε τις πράξεις.
    const recon = countedFor(STILIDA.creditsCollected);
    const expected = expectedFor(STILIDA.ippodromos);
    const discrepancy = roundCurrency(recon.netTotal - expected);
    expect(roundCurrency(STILIDA.openingCash + expected)).toBe(
      roundCurrency(recon.grossTotal - discrepancy)
    );
  });

  it('το χρηματοκιβώτιο της αίθουσας PLAY γυρίζει αντίστροφα', () => {
    // 0058: στο PLAY τα μετρητά ΒΓΑΙΝΟΥΝ από το χρηματοκιβώτιο για να
    // πληρωθούν πελάτες. Η καρτέλα τα πρόσθετε κι εκεί.
    const drop = calculateReconciliationBreakdown({
      openingCash: 0,
      countedCashInDrawer: 1000,
      posSalesTotal: 0,
      expensesTotal: 0,
      bankDeposits: 300,
      safeDirection: 'DROP',
      customerCreditsGranted: 0,
      customerReturns: 0,
    });
    const withdraw = calculateReconciliationBreakdown({
      openingCash: 0,
      countedCashInDrawer: 1000,
      posSalesTotal: 0,
      expensesTotal: 0,
      bankDeposits: 300,
      safeDirection: 'WITHDRAW',
      customerCreditsGranted: 0,
      customerReturns: 0,
    });
    expect(drop.grossTotal).toBe(1300);
    expect(withdraw.grossTotal).toBe(700);
  });
});

describe('το ακαθάριστο των σκρατς δεν είναι το καθαρό', () => {
  it('διαβάζει τη στήλη του ακαθάριστου', () => {
    expect(
      scratchGrossOf({ scratch_gross_sales: 94, scratch_payouts: 60, scratch_lotto_sales: 34 })
    ).toBe(94);
  });

  it('χωρίς στήλη ακαθάριστου, το ξαναφτιάχνει - δεν δίνει το καθαρό', () => {
    // Αυτό ήταν το σφάλμα: το καθαρό 34 έμπαινε στο κουτί «Πωλήσεις» και οι
    // 60 € εξαργυρώσεις αφαιρούνταν δεύτερη φορά, δίνοντας −26 €.
    const gross = scratchGrossOf({ scratch_payouts: 60, scratch_lotto_sales: 34 });
    expect(gross).toBe(94);
    expect(roundCurrency(gross - 60)).toBe(34);
  });

  it('καμία εγγραφή σκρατς είναι μηδέν, όχι αρνητικό', () => {
    expect(scratchGrossOf({})).toBe(0);
  });
});
