import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  acceptanceRecord,
  foundFigures,
  handoverDifference,
  handoverFigures,
  hasDifference,
  parseAmount,
  readHandoverDispute,
  HANDOVER_NOTE_MAX,
} from '../lib/handoverAcceptance';

/**
 * «Στην επιθεώρηση στο Play, από το πρωί στο απόγευμα, έχεις ένα κουμπάκι που λέει “έλαβα και
 * αποδέχομαι την παραλαβή”. Δεν έχεις όμως τη δυνατότητα να διορθώσει ο άλλος κάτι, σε περίπτωση
 * που βρει κάτι διαφορετικό.»
 *
 * Ο εισερχόμενος γράφει τι βρήκε. Η διόρθωση ΚΑΤΑΓΡΑΦΕΤΑΙ: δεν αλλάζει τα ποσά της βάρδιας, δεν
 * χρεώνει κανέναν, δεν γράφει έλλειμμα. Το λάθος που κοστίζει είναι να γίνει επιθεώρηση από την
 * πίσω πόρτα (χρέωση υπαλλήλου από μέτρημα στη μέση της μέρας) ή να χαθεί η διαφορά.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const previous = {
  shift_id: 'shift-1',
  shift_status: 'SUBMITTED',
  previous_operator_name: 'Κωνσταντίνα',
  counted_cash: 5000.5,
  counted_denominations: { '50': 100, '0.50': 1 },
  safe_count: { total: 12000 },
};
const declared = handoverFigures(previous, { safeEnabled: true })!;
const by = { userId: 'u1', name: 'Μαρία' };
const at = new Date('2026-11-18T16:00:00Z');

describe('το ποσό όπως το γράφει ένας άνθρωπος', () => {
  it('δέχεται ακέραιο, τελεία ή κόμμα, έως δύο δεκαδικά', () => {
    expect(parseAmount('1250')).toBe(1250);
    expect(parseAmount('1250.5')).toBe(1250.5);
    expect(parseAmount('1250,50')).toBe(1250.5);
    expect(parseAmount(' 0,5 ')).toBe(0.5);
    expect(parseAmount('0')).toBe(0);
  });

  it('δεν μαντεύει: κενό, γράμματα, αρνητικό, χιλιάδες με τελεία, τρία δεκαδικά → null', () => {
    for (const bad of ['', '  ', 'abc', '-5', '1.250,50', '1,250.50', '12.345', '1e3', null, undefined]) {
      expect(parseAmount(bad), String(bad)).toBeNull();
    }
  });
});

describe('τι βρέθηκε και πόσο διαφέρει', () => {
  it('διαβάζει τα τρία ποσά και βγάζει το σύνολο', () => {
    const f = foundFigures({ notes: '4900', coins: '0,50', safe: '12000' }, { includeSafe: true })!;
    expect(f).toEqual({ notes: 4900, coins: 0.5, safe: 12000, total: 16900.5 });
  });

  it('κάποιο ποσό που δεν διαβάζεται → null, ποτέ μηδέν στη θέση του', () => {
    expect(foundFigures({ notes: '', coins: '0.5', safe: '12000' }, { includeSafe: true })).toBeNull();
    expect(foundFigures({ notes: '4900', coins: 'x', safe: '12000' }, { includeSafe: true })).toBeNull();
    expect(foundFigures({ notes: '4900', coins: '0.5', safe: '' }, { includeSafe: true })).toBeNull();
  });

  it('χωρίς χρηματοκιβώτιο στο κατάστημα, το πεδίο του δεν ζητείται', () => {
    const f = foundFigures({ notes: '100', coins: '1', safe: '' }, { includeSafe: false })!;
    expect(f.safe).toBe(0);
    expect(f.total).toBe(101);
  });

  it('η διαφορά είναι βρέθηκε − δηλώθηκε: αρνητικό λείπει, θετικό περισσεύει', () => {
    const f = foundFigures({ notes: '4900', coins: '0.50', safe: '12100' }, { includeSafe: true })!;
    const d = handoverDifference(declared, f);
    expect(d).toEqual({ notes: -100, coins: 0, safe: 100, total: 0 });
    // +100 και −100 δίνουν σύνολο 0, και ΕΙΝΑΙ διαφορά.
    expect(hasDifference(d)).toBe(true);
  });

  it('ίδια ποσά → καμία διαφορά', () => {
    const f = foundFigures({ notes: '5000', coins: '0.5', safe: '12000' }, { includeSafe: true })!;
    expect(hasDifference(handoverDifference(declared, f))).toBe(false);
  });
});

describe('η εγγραφή της αποδοχής', () => {
  it('χωρίς διόρθωση: ακριβώς η απλή αποδοχή, όπως πριν (κανένα «βρέθηκε», κανένα έλλειμμα)', () => {
    const rec = acceptanceRecord(declared, by, at);
    expect(rec).toMatchObject({ accepted: true, accepted_by_name: 'Μαρία', total: 17000.5 });
    for (const key of ['disputed', 'found', 'difference', 'note', 'shortfall', 'expected']) {
      expect(Object.keys(rec), key).not.toContain(key);
    }
    expect(acceptanceRecord(declared, by, at, null)).toEqual(rec);
  });

  it('διόρθωση με ίδια ποσά: πάλι η απλή αποδοχή, δεν γίνεται «διαφωνία» από πληκτρολόγηση', () => {
    const same = foundFigures({ notes: '5000', coins: '0.5', safe: '12000' }, { includeSafe: true })!;
    expect(acceptanceRecord(declared, by, at, { found: same, note: 'τίποτα' })).toEqual(acceptanceRecord(declared, by, at));
  });

  it('με διαφορά: κρατά τι δηλώθηκε, τι βρέθηκε, τη διαφορά και τη σημείωση', () => {
    const found = foundFigures({ notes: '4900', coins: '0.5', safe: '12000' }, { includeSafe: true })!;
    const rec = acceptanceRecord(declared, by, at, { found, note: '  έλειπαν δύο πεντακόσιαρα  ' });
    expect(rec).toMatchObject({
      accepted: true,
      disputed: true,
      // Τα παλιά πεδία μένουν ό,τι ΔΗΛΩΘΗΚΕ.
      notes: 5000, coins: 0.5, safe: 12000, total: 17000.5,
      found: { notes: 4900, coins: 0.5, safe: 12000, total: 16900.5 },
      difference: { notes: -100, coins: 0, safe: 0, total: -100 },
      note: 'έλειπαν δύο πεντακόσιαρα',
    });
    // Δεν είναι επιθεώρηση: κανένα έλλειμμα, κανένα «αναμενόμενο».
    for (const key of Object.keys(rec)) expect(key).not.toMatch(/shortfall|expected|discrepancy|charge/);
  });

  it('η σημείωση κόβεται στο όριο και η κενή γίνεται null', () => {
    const found = foundFigures({ notes: '1', coins: '0', safe: '0' }, { includeSafe: true })!;
    const long = acceptanceRecord(declared, by, at, { found, note: 'α'.repeat(HANDOVER_NOTE_MAX + 50) });
    expect(String(long.note)).toHaveLength(HANDOVER_NOTE_MAX);
    expect(acceptanceRecord(declared, by, at, { found, note: '   ' }).note).toBeNull();
  });
});

describe('ο υπεύθυνος διαβάζει τη διαφορά από τη βάρδια', () => {
  const found = foundFigures({ notes: '4900', coins: '0.5', safe: '12000' }, { includeSafe: true })!;

  it('μια διαφωνία διαβάζεται όπως γράφτηκε', () => {
    const cfv = { handover_acceptance: acceptanceRecord(declared, by, at, { found, note: 'λείπουν 100' }) };
    const d = readHandoverDispute(cfv)!;
    expect(d.acceptedByName).toBe('Μαρία');
    expect(d.fromOperatorName).toBe('Κωνσταντίνα');
    expect(d.declared.total).toBe(17000.5);
    expect(d.found.total).toBe(16900.5);
    expect(d.difference).toEqual({ notes: -100, coins: 0, safe: 0, total: -100 });
    expect(d.note).toBe('λείπουν 100');
  });

  it('η απλή αποδοχή, το τίποτα και τα σπασμένα δεν δίνουν διαφωνία', () => {
    expect(readHandoverDispute({ handover_acceptance: acceptanceRecord(declared, by, at) })).toBeNull();
    expect(readHandoverDispute({})).toBeNull();
    expect(readHandoverDispute(null)).toBeNull();
    expect(readHandoverDispute({ handover_acceptance: { disputed: true } })).toBeNull();
    expect(readHandoverDispute({ handover_acceptance: { disputed: true, notes: 1, coins: 1, found: { notes: 'x', coins: 1 } } })).toBeNull();
  });

  it('η διαφορά που φαίνεται βγαίνει από τα δύο ποσά που φαίνονται, όχι από ό,τι είναι γραμμένο', () => {
    const rec = acceptanceRecord(declared, by, at, { found, note: null }) as any;
    rec.difference = { notes: 999, coins: 999, safe: 999, total: 999 };
    expect(readHandoverDispute({ handover_acceptance: rec })!.difference.total).toBe(-100);
  });
});

describe('οι οθόνες', () => {
  const modal = read('src/components/shifts/ShiftOpeningModal.tsx');

  it('η φόρμα έναρξης γράφει τη διόρθωση πάνω στην αποδοχή', () => {
    expect(modal).toMatch(/handoverFoundNow \? \{ found: handoverFoundNow, note: handoverNote \} : null/);
  });

  it('ποσό που δεν διαβάζεται κλειδώνει το «Επιβεβαίωση & Έναρξη»', () => {
    expect(modal).toMatch(/if \(handoverCorrectionInvalid\) \{\s+setError\(/);
    expect(modal).toMatch(/type="submit"\s+disabled=\{loading \|\| fetchingPrev \|\| blockedReason !== null \|\| handoverCorrectionInvalid\}/);
  });

  it('η αποδοχή είναι το ίδιο το «Επιβεβαίωση & Έναρξη»: κανένα κουτάκι, καμία ξεχωριστή κατάσταση', () => {
    expect(modal).not.toContain('handoverAccepted');
    expect(modal).not.toContain('Έλαβα και αποδέχομαι');
    const card = modal.slice(modal.indexOf('data-testid="handover-acceptance"'), modal.indexOf('<ShiftInspectionPanel'));
    expect(card).not.toContain('type="checkbox"');
    // Η εγγραφή γράφεται πάντα όταν η κάρτα φάνηκε, χωρίς δεύτερη συνθήκη.
    expect(modal).toMatch(/\.\.\.\(handoverToAccept\n\s+\? \{\s+handover_acceptance: acceptanceRecord\(/);
    // Η γραμμή απλώς το λέει.
    expect(card).toContain('data-testid="handover-accept-note"');
    expect(card).toContain('Με το «Επιβεβαίωση & Έναρξη» αποδέχεστε την παραλαβή');
  });

  it('η διόρθωση ΔΕΝ αγγίζει τα ποσά της βάρδιας (η μέρα συνεχίζει από το αρχικό της)', () => {
    const start = modal.indexOf('data-testid="handover-correct-toggle"');
    const end = modal.indexOf('data-testid="handover-accept-note"');
    const block = modal.slice(start, end);
    for (const setter of ['setOpeningBanknotes', 'setOpeningCoins', 'setOpeningSafe', 'setFloatShortfall', 'recordShiftInspection']) {
      expect(block, setter).not.toContain(setter);
    }
  });

  it('η διαφωνία δεν περνά από την επιθεώρηση: ούτε χρέωση ούτε έλλειμμα', () => {
    const stamp = modal.slice(modal.indexOf('handover_acceptance: acceptanceRecord('), modal.indexOf('created_at: new Date().toISOString()'));
    expect(stamp).not.toMatch(/recordShiftInspection|employee_charge|shortfall/);
  });

  it('οι λεπτομέρειες βάρδιας δείχνουν τη διαφορά στον υπεύθυνο', () => {
    const details = read('src/components/shifts/ShiftDetailsModal.tsx');
    expect(details).toContain("import { readHandoverDispute } from '../../lib/handoverAcceptance.ts'");
    expect(details).toContain('data-testid="details-handover-dispute"');
    expect(details).toMatch(/readHandoverDispute\(shift\.custom_field_values\)/);
  });
});
