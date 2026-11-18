import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveOpeningFloat } from '../lib/openingFloat.ts';
import { calculateEnvelope } from '../lib/shiftEnvelope.ts';
import { shiftHandover } from '../lib/shiftHandover.ts';
import { acceptanceRecord, handoverFigures, shouldAskAcceptance } from '../lib/handoverAcceptance.ts';
import { DEFAULT_OPAP_SHIFT_TEMPLATE } from '../services/shiftTemplateService.ts';
import { overridesFor } from '../lib/storeTypeDefaults.ts';

/**
 * Το Play, και ΜΟΝΟ το Play (ο ιδιοκτήτης: «αν αλλάξει το πρακτορείο τον ήπιαμε»):
 *
 *   1. Τα χαρτονομίσματα έχουν τη συμπεριφορά των κερμάτων: ό,τι μέτρησε η βραδινή
 *      είναι το αρχικό της επόμενης μέρας. Δεν υπάρχει πάγιο ποσό.
 *   2. Οι βάρδιες μετά την πρώτη δείχνουν τι παραλαμβάνουν και ζητούν μόνο αποδοχή.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

// Ένα πάγιο 465 € χαρτονομίσματα και 46 € κέρματα, όπως στο πραγματικό Play.
const FLOAT = { notes: 465, coins: 46 };
const LAST_NIGHT = { countedCash: 9300.5, openingCash: 511, notes: 9250, coins: 50.5 };

describe('το άνοιγμα της πρώτης βάρδιας: χαρτονομίσματα όπως τα κέρματα (μόνο Play)', () => {
  it('ΠΡΑΚΤΟΡΕΙΟ (διακόπτης κλειστός ή απών): τα χαρτονομίσματα ξαναγυρίζουν στο πάγιο, όπως πάντα', () => {
    for (const flag of [undefined, false]) {
      const out = resolveOpeningFloat(LAST_NIGHT, { ...FLOAT, morningNotesCarryOver: flag });
      expect(out.notes, String(flag)).toBe(465);
      expect(out.coins).toBe(50.5); // τα κέρματα μεταφέρονταν ήδη
    }
  });

  it('ΠΡΑΚΤΟΡΕΙΟ: το ίδιο και με ό,τι άλλο έχει ο παλιός κώδικας (λιγότερα από το πάγιο → ό,τι έμεινε)', () => {
    const low = { countedCash: 300, openingCash: 511, notes: 300, coins: 10 };
    const out = resolveOpeningFloat(low, { ...FLOAT });
    expect(out.notes).toBe(300);
    expect(out.shortfall).toBe(165);
  });

  it('PLAY (διακόπτης ανοιχτός): το αρχικό είναι ΑΚΡΙΒΩΣ ό,τι μέτρησε το βράδυ, χωρίς πάγιο', () => {
    const out = resolveOpeningFloat(LAST_NIGHT, { ...FLOAT, morningNotesCarryOver: true });
    expect(out.notes).toBe(9250);
    expect(out.coins).toBe(50.5);
    expect(out.shortfall).toBe(0);
    expect(out.topUpsInherited).toBe(0);
  });

  it('PLAY: λιγότερα από το «πάγιο» δεν σημαίνει έλλειμμα, γιατί πάγιο δεν υπάρχει', () => {
    const low = { countedCash: 300, openingCash: 511, notes: 300, coins: 10 };
    const out = resolveOpeningFloat(low, { ...FLOAT, morningNotesCarryOver: true });
    expect(out.notes).toBe(300);
    expect(out.shortfall).toBe(0);
  });

  it('PLAY: κλείσιμο που δεν ανέλυσε χαρτονομίσματα (0) δεν ανοίγει την ημέρα στο μηδέν', () => {
    const out = resolveOpeningFloat({ countedCash: 100, openingCash: 100, notes: 0, coins: 5 }, { ...FLOAT, morningNotesCarryOver: true });
    expect(out.notes).toBe(465);
  });

  it('PLAY: τα κέρματα ακολουθούν τον δικό τους διακόπτη όπως πάντα', () => {
    const out = resolveOpeningFloat(LAST_NIGHT, { ...FLOAT, morningNotesCarryOver: true, morningCoinsCarryOver: false });
    expect(out.notes).toBe(9250);
    expect(out.coins).toBe(46);
  });

  it('PLAY: καμία προηγούμενη βάρδια (πρώτη φορά): ανοίγει με το ορισμένο ποσό, όπως πριν', () => {
    expect(resolveOpeningFloat(null, { ...FLOAT, morningNotesCarryOver: true }).notes).toBe(465);
  });

  it('η συνέχεια της ημέρας (δεύτερη βάρδια) ΔΕΝ αλλάζει από τον διακόπτη', () => {
    const day = { notes: 7000, coins: 40, topUpsToday: 0 };
    const withFlag = resolveOpeningFloat(LAST_NIGHT, { ...FLOAT, morningNotesCarryOver: true }, day);
    const without = resolveOpeningFloat(LAST_NIGHT, { ...FLOAT }, day);
    expect(withFlag).toEqual(without);
    expect(withFlag.notes).toBe(7000);
  });
});

describe('ο φάκελος παράδοσης', () => {
  const base = { countedNotes: 9250, countedCoins: 50.5, floatNotes: 465 };

  it('ΠΡΑΚΤΟΡΕΙΟ: ό,τι περισσεύει πάνω από το πάγιο φεύγει σε φάκελο, όπως πάντα', () => {
    const e = calculateEnvelope(base);
    expect(e.amount).toBe(8785);
    expect(e.retainedNotes).toBe(465);
    const off = calculateEnvelope({ ...base, notesCarryOver: false });
    expect(off).toEqual(e);
  });

  it('PLAY: δεν φεύγει κανένα χαρτονόμισμα, όλα μένουν στο ταμείο και δεν υπάρχει «έλλειμμα παγίου»', () => {
    const e = calculateEnvelope({ ...base, notesCarryOver: true });
    expect(e.amount).toBe(0);
    expect(e.retainedNotes).toBe(9250);
    expect(e.isShort).toBe(false);
    expect(e.handedOver).toBe(0);
  });

  it('PLAY: ούτε όταν το συρτάρι έχει λιγότερα από το «πάγιο»', () => {
    const e = calculateEnvelope({ countedNotes: 100, floatNotes: 465, notesCarryOver: true });
    expect(e.isShort).toBe(false);
    expect(e.amount).toBe(0);
  });

  it('η παράδοση της λίστας βαρδιών διαβάζει το σημάδι της βάρδιας', () => {
    const closed = {
      counted_denominations: { '50': 100 }, // 5.000 €
      opening_cash_notes: 465,
    };
    expect(shiftHandover(closed).envelope).toBeGreaterThan(0);
    expect(shiftHandover({ ...closed, custom_field_values: { notes_carry_over: true } }).envelope).toBe(0);
    expect(shiftHandover({ ...closed, custom_field_values: { notes_carry_over: false } }).envelope).toBeGreaterThan(0);
  });
});

describe('η αποδοχή παραλαβής', () => {
  const previous = {
    shift_id: 'shift-1',
    shift_status: 'SUBMITTED',
    previous_operator_name: 'Κωνσταντίνα',
    counted_cash: 5000.5,
    counted_denominations: { '50': 100, '0.50': 1 },
    safe_count: { total: 12000 },
  };

  it('δείχνει τι παραλαμβάνεται: χαρτονομίσματα, κέρματα, χρηματοκιβώτιο, σύνολο', () => {
    const f = handoverFigures(previous, { safeEnabled: true })!;
    expect(f.notes).toBe(5000);
    expect(f.coins).toBe(0.5);
    expect(f.safe).toBe(12000);
    expect(f.total).toBe(17000.5);
    expect(f.fromOperatorName).toBe('Κωνσταντίνα');
  });

  it('το χρηματοκιβώτιο μετράει μόνο όπου το κατάστημα το έχει ανοιχτό', () => {
    expect(handoverFigures(previous, { safeEnabled: false })!.safe).toBe(0);
  });

  it('δεν υπάρχει αποδοχή για βάρδια που δεν έχει κλείσει, ή που δεν μέτρησε τίποτα', () => {
    expect(handoverFigures({ ...previous, shift_status: 'OPEN' }, { safeEnabled: true })).toBeNull();
    expect(handoverFigures({ ...previous, shift_status: 'DRAFT_CLOSING' }, { safeEnabled: true })).toBeNull();
    expect(handoverFigures(null, { safeEnabled: true })).toBeNull();
    expect(
      handoverFigures({ shift_id: 's', shift_status: 'SUBMITTED', counted_cash: 0, counted_denominations: {}, safe_count: null }, { safeEnabled: true })
    ).toBeNull();
  });

  it('χωρίς ανάλυση σε κοψίματα, το σύνολο μένει στα χαρτονομίσματα: δεν επινοούνται κέρματα', () => {
    const f = handoverFigures({ shift_id: 's', shift_status: 'APPROVED', counted_cash: 800, counted_denominations: {} }, { safeEnabled: false })!;
    expect(f.notes).toBe(800);
    expect(f.coins).toBe(0);
  });

  it('ζητείται ΜΟΝΟ όταν το κατάστημα το ζητά ρητά, σε βάρδια μετά την πρώτη, και υπάρχει τι να αποδεχτεί', () => {
    const figures = handoverFigures(previous, { safeEnabled: true });
    expect(shouldAskAcceptance({ enabled: true, continuingDay: true, figures })).toBe(true);
    // Πρακτορείο και ό,τι δεν είναι ρητά ανοιχτό:
    for (const enabled of [false, undefined, null, 'true', 1]) {
      expect(shouldAskAcceptance({ enabled, continuingDay: true, figures }), String(enabled)).toBe(false);
    }
    // Η πρώτη βάρδια της ημέρας έχει την επιθεώρησή της:
    expect(shouldAskAcceptance({ enabled: true, continuingDay: false, figures })).toBe(false);
    expect(shouldAskAcceptance({ enabled: true, continuingDay: true, figures: null })).toBe(false);
  });

  it('η εγγραφή κρατά ποιος, πότε και τι είδε - και ΔΕΝ είναι επιθεώρηση (καμία διαφορά, κανένα έλλειμμα)', () => {
    const f = handoverFigures(previous, { safeEnabled: true })!;
    const rec = acceptanceRecord(f, { userId: 'u1', name: 'Μαρία' }, new Date('2026-11-17T16:00:00Z'));
    expect(rec).toMatchObject({ accepted: true, accepted_by_name: 'Μαρία', from_shift_id: 'shift-1', total: 17000.5 });
    expect(Object.keys(rec).join(',')).not.toMatch(/shortfall|found|expected|discrepancy/);
  });
});

describe('τα πρότυπα καταστημάτων', () => {
  const templateFor = (type: string) => ({ ...DEFAULT_OPAP_SHIFT_TEMPLATE, ...overridesFor(type) });

  it('ΠΡΑΚΤΟΡΕΙΟ και κάθε άλλος τύπος: και τα δύο κλειστά', () => {
    for (const type of ['OPAP_AGENCY', 'OPAP_FNB', 'GAMING_HALL', 'RETAIL', undefined as unknown as string]) {
      expect(templateFor(type).morning_notes_carry_over, String(type)).toBe(false);
      expect(templateFor(type).handover_acceptance_enabled, String(type)).toBe(false);
    }
    expect(DEFAULT_OPAP_SHIFT_TEMPLATE.morning_notes_carry_over).toBe(false);
    expect(DEFAULT_OPAP_SHIFT_TEMPLATE.handover_acceptance_enabled).toBe(false);
  });

  it('PLAY: και τα δύο ανοιχτά', () => {
    expect(templateFor('PLAY_STORE').morning_notes_carry_over).toBe(true);
    expect(templateFor('PLAY_STORE').handover_acceptance_enabled).toBe(true);
  });
});

describe('οι οθόνες διαβάζουν «ανοιχτό μόνο αν είναι ρητά ανοιχτό»', () => {
  const modal = read('src/components/shifts/ShiftOpeningModal.tsx');
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');
  const configurator = read('src/components/shifts/ShiftTemplateConfigurator.tsx');

  it('η φόρμα έναρξης', () => {
    expect(modal).toContain('const [morningNotesCarryOver, setMorningNotesCarryOver] = useState<boolean>(false);');
    expect(modal).toContain('(config as any)?.morning_notes_carry_over === true');
    expect(modal).toContain('morningNotesCarryOver: carryNotes,');
    expect(modal).not.toMatch(/morning_notes_carry_over !== false/);
    // Η αποδοχή: μόνο με ρητό true. Δεν υπάρχει ξεχωριστό κουτάκι: αποδέχεσαι με το «Επιβεβαίωση & Έναρξη».
    expect(modal).toContain('enabled: (config as any)?.handover_acceptance_enabled,');
    expect(modal).not.toContain('handoverAccepted');
    expect(modal).not.toMatch(/type="checkbox"[\s\S]{0,200}handover/);
  });

  it('η βάρδια παίρνει το σημάδι και την αποδοχή μόνο όπου ισχύουν', () => {
    expect(modal).toContain('...(morningNotesCarryOver ? { notes_carry_over: true } : {}),');
    expect(modal).toContain('...(handoverToAccept\n');
  });

  it('η οθόνη κλεισίματος περνά το σημάδι στον φάκελο, και αλλάζει το κείμενο', () => {
    expect(wizard).toContain('(shift.custom_field_values as any)?.notes_carry_over === true');
    expect(wizard).toContain('(config as any).morning_notes_carry_over === true');
    expect(wizard).toContain('    notesCarryOver,\n');
    expect(wizard).toContain("notesCarryOver ? 'δεν παραδίδονται — μένουν στο ταμείο' : 'ταμείο − πάγιο κεφάλαιο'");
  });

  it('η Διαμόρφωση δείχνει τους δύο διακόπτες ως κλειστούς όταν λείπουν', () => {
    expect(configurator).toContain('aria-checked={template.morning_notes_carry_over === true}');
    expect(configurator).toContain('aria-checked={template.handover_acceptance_enabled === true}');
  });
});

describe('η βάση (0094)', () => {
  const sql = read('supabase/migrations/0094_play_keeps_its_notes_and_accepts_the_handover.sql');
  const code = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

  it('δύο στήλες, κλειστές από προεπιλογή', () => {
    expect(code).toContain('morning_notes_carry_over    BOOLEAN NOT NULL DEFAULT FALSE');
    expect(code).toContain('handover_acceptance_enabled BOOLEAN NOT NULL DEFAULT FALSE');
  });

  it("ανοίγουν ΜΟΝΟ στα καταστήματα Play, και τίποτα άλλο δεν αγγίζεται", () => {
    expect(code).toMatch(/SET morning_notes_carry_over\s+= TRUE,\s+handover_acceptance_enabled = TRUE\s+FROM stores s/);
    expect(code).toContain("s.store_type = 'PLAY_STORE'");
    expect(code).not.toMatch(/IS DISTINCT FROM 'PLAY_STORE'|<> 'PLAY_STORE'|!= 'PLAY_STORE'/);
    expect(code).not.toMatch(/DELETE|DROP|custom_field_values/i);
  });
});
