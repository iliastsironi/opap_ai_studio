import { describe, expect, it } from 'vitest';
import {
  activeShiftAt, isActiveShift, openBlockedReason, worksThisShift, type ShiftLike,
  ownShift,
  visibleShifts,
  isClosedShift,
  closedShifts,
  lastClosedAt,
  ACTIVE_SHIFT_STATUSES,
  CLOSED_SHIFT_STATUSES,
} from '../lib/shiftOpenRules.ts';

const s = (over: Partial<ShiftLike>): ShiftLike => ({
  id: 'x', store_id: 'lamia', status: 'SUBMITTED',
  opened_at: '2026-11-10T06:00:00Z', opened_by_user_id: 'giorgos',
  opened_by_user_name: 'Γιώργος Κουτρομάνος', ...over,
});

describe('ποια βάρδια τρέχει', () => {
  it('οι καταστάσεις είναι οι ίδιες με τον δείκτη της βάσης', () => {
    // Αν αποκλίνουν, η οθόνη λέει «ελεύθερο» για κάτι που η βάση αρνείται.
    for (const st of ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED']) {
      expect(isActiveShift({ status: st })).toBe(true);
    }
    for (const st of ['SUBMITTED', 'APPROVED', '', undefined]) {
      expect(isActiveShift({ status: st as any })).toBe(false);
    }
  });

  it('βρίσκει την ανοιχτή του καταστήματος και αγνοεί τα άλλα μαγαζιά', () => {
    const shifts = [
      s({ id: 'a', store_id: 'stilida', status: 'OPEN' }),
      s({ id: 'b', store_id: 'lamia', status: 'OPEN' }),
    ];
    expect(activeShiftAt(shifts, 'lamia')?.id).toBe('b');
    expect(activeShiftAt(shifts, 'play')).toBeNull();
    expect(activeShiftAt(shifts, '')).toBeNull();
  });

  it('μια βάρδια ανήκει σε αυτόν που την άνοιξε και σε κανέναν άλλο', () => {
    // Το «σε όλους γράφει Γιώργος Κουτρομάνος»: η ανοιχτή βάρδια του
    // καταστήματος εμφανιζόταν σε όποιον συνδεόταν, με το όνομά ΤΟΥ.
    const shift = s({ status: 'OPEN', opened_by_user_id: 'giorgos' });
    expect(worksThisShift(shift, 'giorgos')).toBe(true);
    expect(worksThisShift(shift, 'katerina')).toBe(false);
    expect(worksThisShift(shift, '')).toBe(false);
    expect(worksThisShift(null, 'giorgos')).toBe(false);
  });
});

describe('ποιος μπορεί να ανοίξει βάρδια', () => {
  const base = {
    storeId: 'lamia', operatorId: 'katerina', operatorName: 'Κατερίνα Αχινιώτη',
    openedAt: '2026-11-10T14:00:00Z',
  };

  it('καθαρό μαγαζί, καθαρή μέρα: ανοίγει', () => {
    expect(openBlockedReason({ ...base, shifts: [] })).toBeNull();
  });

  it('τρέχει βάρδια άλλου: δεν ανοίγει, και λέει ποιανού', () => {
    const why = openBlockedReason({
      ...base,
      shifts: [s({ status: 'OPEN', opened_by_user_id: 'giorgos', opened_at: '2026-11-10T06:00:00Z' })],
    });
    expect(why).toContain('Γιώργος Κουτρομάνος');
    expect(why).toContain('ένα άτομο');
  });

  it('τρέχει η ΔΙΚΗ του βάρδια: άλλο μήνυμα, όχι το ίδιο', () => {
    const why = openBlockedReason({
      ...base,
      shifts: [s({ status: 'OPEN', opened_by_user_id: 'katerina', opened_at: '2026-11-10T06:00:00Z' })],
    });
    expect(why).toContain('Έχετε ήδη ανοιχτή βάρδια');
  });

  it('έκλεισε βάρδια σήμερα: δεν ξανανοίγει — αυστηρό', () => {
    const why = openBlockedReason({
      ...base,
      shifts: [s({ status: 'SUBMITTED', opened_by_user_id: 'katerina', opened_at: '2026-11-10T06:00:00Z' })],
    });
    expect(why).toContain('Κατερίνα Αχινιώτη');
    expect(why).toContain('Μία βάρδια ανά άτομο την ημέρα');
  });

  it('και εγκεκριμένη μετράει — το ζητούμενο είναι ότι δούλεψε', () => {
    expect(openBlockedReason({
      ...base,
      shifts: [s({ status: 'APPROVED', opened_by_user_id: 'katerina', opened_at: '2026-11-10T08:00:00Z' })],
    })).toContain('Μία βάρδια ανά άτομο');
  });

  it('χθεσινή βάρδια δεν εμποδίζει τη σημερινή', () => {
    expect(openBlockedReason({
      ...base,
      shifts: [s({ status: 'APPROVED', opened_by_user_id: 'katerina', opened_at: '2026-11-09T06:00:00Z' })],
    })).toBeNull();
  });

  it('βάρδια του ίδιου σε ΑΛΛΟ μαγαζί δεν εμποδίζει', () => {
    expect(openBlockedReason({
      ...base,
      shifts: [s({ status: 'APPROVED', store_id: 'stilida', opened_by_user_id: 'katerina', opened_at: '2026-11-10T06:00:00Z' })],
    })).toBeNull();
  });

  it('η μέρα μετριέται σε ώρα Αθήνας, όχι UTC', () => {
    // Βραδινή που άνοιξε 23:30 Αθήνας είναι 21:30 UTC της ίδιας μέρας·
    // μια 00:30 Αθήνας είναι 22:30 UTC της ΠΡΟΗΓΟΥΜΕΝΗΣ.
    const lateNight = s({
      status: 'SUBMITTED', opened_by_user_id: 'katerina', opened_at: '2026-11-09T22:30:00Z',
    });
    expect(openBlockedReason({ ...base, openedAt: '2026-11-10T14:00:00Z', shifts: [lateNight] }))
      .toContain('Μία βάρδια ανά άτομο');
  });
});

describe('ownShift / visibleShifts', () => {
  const ME = 'user_me';
  const COLLEAGUE = 'user_other';

  const mine = { id: 's1', store_id: 'stilida', status: 'OPEN', opened_by_user_id: ME };
  const theirs = { id: 's2', store_id: 'lamia', status: 'OPEN', opened_by_user_id: COLLEAGUE };
  const iClosedIt = {
    id: 's3',
    store_id: 'stilida',
    status: 'SUBMITTED',
    opened_by_user_id: COLLEAGUE,
    closed_by_user_id: ME,
  };

  it('δική του είναι αυτή που άνοιξε', () => {
    expect(ownShift(mine, ME)).toBe(true);
  });

  it('δική του και αυτή που έκλεισε — η βάρδια αλλάζει χέρια', () => {
    expect(ownShift(iClosedIt, ME)).toBe(true);
  });

  it('του συναδέλφου δεν είναι δική του', () => {
    expect(ownShift(theirs, ME)).toBe(false);
  });

  it('χωρίς χρήστη δεν είναι τίποτα δικό του', () => {
    expect(ownShift(mine, null)).toBe(false);
    expect(ownShift(mine, '')).toBe(false);
  });

  /**
   * Το παράπονο του ιδιοκτήτη: «έχει ανοίξει υπάλληλος στη Στυλίδα βάρδια
   * και του δείχνει και τις δύο βάρδιες κι απ' τα δύο τα μαγαζιά».
   */
  it('ο υπάλληλος βλέπει μόνο τη δική του, καμία άλλη', () => {
    const seen = visibleShifts([mine, theirs, iClosedIt], ME, false);
    expect(seen.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('η ανοιχτή βάρδια του άλλου μαγαζιού δεν περνάει', () => {
    const seen = visibleShifts([theirs], ME, false);
    expect(seen).toEqual([]);
  });

  it('ο admin βλέπει όλες τις ανοιχτές βάρδιες', () => {
    const seen = visibleShifts([mine, theirs, iClosedIt], 'user_admin', true);
    expect(seen.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('δεν πειράζει τον πίνακα που του δόθηκε', () => {
    const list = [mine, theirs];
    visibleShifts(list, ME, false);
    expect(list).toHaveLength(2);
  });

  it('κενό ή άγνωστο δεν σκάει', () => {
    expect(visibleShifts(null, ME, false)).toEqual([]);
    expect(visibleShifts(undefined, ME, true)).toEqual([]);
  });
});

/**
 * Τι μπαίνει στα σύνολα που διαβάζει άνθρωπος.
 *
 * Η επισκόπηση άθροιζε κάθε βάρδια, και ένα ταμείο στη μέση της βάρδιας
 * έχει νούμερα που δεν έχουν μετρηθεί ακόμα. Στα πραγματικά δεδομένα η
 * συνολική απόκλιση έγραφε −1.658,11 € ενώ μέχρι την τελευταία κλεισμένη
 * βάρδια ήταν −136,70 €: η διαφορά ήταν δύο ταμεία σε εξέλιξη, το ένα με
 * μισοσυμπληρωμένη απόκλιση −1.531,10 €.
 */
describe('ποια βάρδια μπαίνει στα σύνολα', () => {
  it('κλεισμένη είναι η υποβληθείσα και η εγκεκριμένη', () => {
    expect(isClosedShift({ status: 'SUBMITTED' })).toBe(true);
    expect(isClosedShift({ status: 'APPROVED' })).toBe(true);
  });

  it('ό,τι δουλεύεται ακόμα δεν μπαίνει', () => {
    for (const st of ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED']) {
      expect(isClosedShift({ status: st })).toBe(false);
    }
    expect(isClosedShift({ status: '' })).toBe(false);
    expect(isClosedShift(null)).toBe(false);
  });

  /**
   * Οι δύο λίστες μαζί είναι ΟΛΟ το ShiftStatus, και ξένες μεταξύ τους. Αν
   * μπει έβδομη κατάσταση και ξεχαστεί, αυτό το τεστ το λέει πριν αρχίσει
   * μια οθόνη να την αθροίζει και μια άλλη να την αγνοεί.
   */
  it('κάθε κατάσταση ανήκει σε μία ακριβώς μεριά', () => {
    const all = ['OPEN', 'DRAFT_CLOSING', 'SUBMITTED', 'APPROVED', 'CORRECTION_REQUESTED', 'REOPENED'];
    for (const st of all) {
      const sides = [ACTIVE_SHIFT_STATUSES.includes(st), CLOSED_SHIFT_STATUSES.includes(st)];
      expect(sides.filter(Boolean).length, st).toBe(1);
    }
    expect(ACTIVE_SHIFT_STATUSES.length + CLOSED_SHIFT_STATUSES.length).toBe(all.length);
  });

  it('ΤΟ ΑΘΡΟΙΣΜΑ ΑΦΗΝΕΙ ΕΞΩ ΤΟ ΤΑΜΕΙΟ ΠΟΥ ΤΡΕΧΕΙ', () => {
    const shifts = [
      { status: 'APPROVED', discrepancy: -136.7 },
      { status: 'DRAFT_CLOSING', discrepancy: -1531.1 },
      { status: 'DRAFT_CLOSING', discrepancy: 9.69 },
    ];
    const sum = (rows: { discrepancy: number }[]) => rows.reduce((a, r) => a + r.discrepancy, 0);
    expect(sum(shifts)).toBeCloseTo(-1658.11, 2);
    expect(sum(closedShifts(shifts))).toBeCloseTo(-136.7, 2);
  });

  it('χωρίς κλεισμένη βάρδια, κανένα σύνολο', () => {
    expect(closedShifts([{ status: 'OPEN' }])).toEqual([]);
    expect(closedShifts(null)).toEqual([]);
  });
});

describe('μέχρι πότε φτάνουν τα σύνολα', () => {
  it('η ώρα της τελευταίας κλεισμένης', () => {
    expect(
      lastClosedAt([
        { status: 'APPROVED', closed_at: '2026-11-10T20:14:00Z' },
        { status: 'SUBMITTED', closed_at: '2026-11-11T08:42:00Z' },
      ])
    ).toBe('2026-11-11T08:42:00Z');
  });

  it('ένα ταμείο που τρέχει δεν μετακινεί το «μέχρι πότε»', () => {
    expect(
      lastClosedAt([
        { status: 'SUBMITTED', closed_at: '2026-11-11T08:42:00Z' },
        { status: 'DRAFT_CLOSING', closed_at: '2026-11-11T14:16:00Z' },
      ])
    ).toBe('2026-11-11T08:42:00Z');
  });

  it('χωρίς ώρα κλεισίματος πέφτει στο άνοιγμα', () => {
    expect(lastClosedAt([{ status: 'APPROVED', opened_at: '2026-10-01T06:00:00Z' }])).toBe(
      '2026-10-01T06:00:00Z'
    );
  });

  it('χωρίς καμία κλεισμένη, τίποτα να πει', () => {
    expect(lastClosedAt([{ status: 'OPEN', opened_at: '2026-11-11T14:16:00Z' }])).toBe(null);
    expect(lastClosedAt([])).toBe(null);
  });
});
