import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_SAFE_BUNDLE_SIZES,
  buildSafeCount,
  readOpeningSafe,
  resolveOpeningSafe,
} from '../lib/safeBundles.ts';
import {
  inspectionHandover,
  lineFinding,
  summariseInspection,
  type InspectionLine,
} from '../lib/shiftInspection.ts';
import { auditOpeningCash } from '../lib/countedCashAudit.ts';
import { calculateBanknotesAndCoins } from '../services/financialCalculator.ts';
import { CashDenominationCounter } from '../components/shifts/CashDenominationCounter.tsx';

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ roles: [{ code: 'EMPLOYEE' }], permissions: [] }),
}));
const { ShiftInspectionPanel, InspectionHandoverSummary, buildInspectionLines } = await import(
  '../components/shifts/ShiftInspectionPanel.tsx'
);

/**
 * «Όταν θα γίνεται το πρωί το άνοιγμα θα γράφει ότι έχεις κέρματα τόσα,
 * χαρτονομίσματα τόσα και χρηματοκιβώτιο τόσο - θα τα διαχωρίζει τα τρία κομμάτια.
 * Και ενεργοποίηση εκεί την επιθεώρηση.»
 *
 * Οι δεσμίδες μετράνε ως μετρητά στο κλείσιμο, άρα το επόμενο άνοιγμα τις περιέχει:
 * αλλιώς κάθε βάρδια θα έδειχνε πλεόνασμα ίσο με όσα έχει το χρηματοκιβώτιο.
 */
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf-8');

describe('με πόσο χρηματοκιβώτιο ανοίγει η βάρδια', () => {
  const night = buildSafeCount({ '20': 2, '50': 1, '100': 3 }, DEFAULT_SAFE_BUNDLE_SIZES)!; // 6.000 €

  it('η πρώτη βάρδια της ημέρας ανοίγει με ό,τι μέτρησε το προηγούμενο βράδυ', () => {
    expect(resolveOpeningSafe({ enabled: true, continuingDay: false, previousSafeCount: night })).toBe(6000);
  });

  it('μια βάρδια που συνεχίζει τη μέρα ανοίγει με ό,τι άνοιξε η μέρα, όχι με το χθεσινό βράδυ', () => {
    expect(
      resolveOpeningSafe({ enabled: true, continuingDay: true, dayOpeningSafe: 5500, previousSafeCount: night })
    ).toBe(5500);
  });

  it('το σύνολο ξαναϋπολογίζεται από τις δεσμίδες, και αν λείπουν ισχύει το αποθηκευμένο', () => {
    expect(resolveOpeningSafe({ enabled: true, continuingDay: false, previousSafeCount: { total: 1234.5 } })).toBe(1234.5);
    expect(
      resolveOpeningSafe({
        enabled: true,
        continuingDay: false,
        previousSafeCount: { bundles: { '5': 2 }, sizes: DEFAULT_SAFE_BUNDLE_SIZES, total: 1 },
      })
    ).toBe(500);
  });

  it('όταν δεν υπάρχει τίποτα να μεταφερθεί, ανοίγει στο μηδέν: ποτέ επινοημένο νούμερο', () => {
    expect(resolveOpeningSafe({ enabled: true, continuingDay: false })).toBe(0);
    expect(resolveOpeningSafe({ enabled: true, continuingDay: false, previousSafeCount: null })).toBe(0);
    expect(resolveOpeningSafe({ enabled: true, continuingDay: false, previousSafeCount: 'ουπς' })).toBe(0);
    expect(resolveOpeningSafe({ enabled: true, continuingDay: true, dayOpeningSafe: null })).toBe(0);
    expect(resolveOpeningSafe({ enabled: true, continuingDay: true, dayOpeningSafe: -50 })).toBe(0);
    expect(resolveOpeningSafe({ enabled: true, continuingDay: true, dayOpeningSafe: 'abc' })).toBe(0);
  });

  it('ένα κατάστημα που δεν μετράει χρηματοκιβώτιο δεν κουβαλάει τίποτα', () => {
    expect(resolveOpeningSafe({ enabled: false, continuingDay: false, previousSafeCount: night })).toBe(0);
    expect(resolveOpeningSafe({ enabled: false, continuingDay: true, dayOpeningSafe: 5000 })).toBe(0);
  });

  it('διαβάζεται από τη βάρδια όπως γράφτηκε', () => {
    expect(readOpeningSafe({ opening_safe: 6000 })).toBe(6000);
    expect(readOpeningSafe({ opening_safe: '1234,5' })).toBe(1234.5);
    expect(readOpeningSafe({})).toBe(0);
    expect(readOpeningSafe(null)).toBe(0);
    expect(readOpeningSafe({ opening_safe: -1 })).toBe(0);
  });
});

describe('το ισοζύγιο μένει ισορροπημένο από το βράδυ στο πρωί', () => {
  it('ό,τι μετράει το κλείσιμο ως μετρητά, το άνοιγμα το κουβαλάει: κανένα πλεόνασμα από το χρηματοκιβώτιο', () => {
    // Το βράδυ: συρτάρι 1.050 € (1.000 χαρτ. + 50 κέρματα) και χρηματοκιβώτιο 6.000 €.
    const drawer = calculateBanknotesAndCoins({ '50': 20, '0.50': 100 });
    expect(drawer.banknotes + drawer.coins).toBe(1050);
    const safe = buildSafeCount({ '20': 2, '50': 1, '100': 3 }, DEFAULT_SAFE_BUNDLE_SIZES)!.total;
    const countedAtClose = drawer.banknotes + drawer.coins + safe;

    // Το πρωί: πάγιο 1.000 + κέρματα 50 + χρηματοκιβώτιο όσο μέτρησε το βράδυ.
    const openingSafe = resolveOpeningSafe({ enabled: true, continuingDay: false, previousSafeCount: buildSafeCount({ '20': 2, '50': 1, '100': 3 }, DEFAULT_SAFE_BUNDLE_SIZES) });
    const openingCash = 1000 + 50 + openingSafe;
    expect(openingCash).toBe(countedAtClose);

    // Χωρίς το χρηματοκιβώτιο στο άνοιγμα, μια βάρδια χωρίς καμία κίνηση θα έβγαζε πλεόνασμα 6.000 €.
    expect(countedAtClose - (1000 + 50)).toBe(6000);
  });
});

describe('η επιθεώρηση μετράει και το χρηματοκιβώτιο', () => {
  const lines = buildInspectionLines({ notes: 1000, coins: 50, safe: 6000 }, []);
  const withFound = (key: string, found: number | null): InspectionLine[] =>
    lines.map((l) => (l.key === key ? { ...l, found } : l));

  it('τρεις γραμμές μετρητών: χαρτονομίσματα, κέρματα, χρηματοκιβώτιο', () => {
    expect(lines.map((l) => [l.key, l.kind, l.expected])).toEqual([
      ['cash', 'CASH', 1000],
      ['coins', 'COINS', 50],
      ['safe', 'SAFE', 6000],
    ]);
  });

  it('χωρίς χρηματοκιβώτιο (το κατάστημα δεν το μετράει) δεν υπάρχει γραμμή', () => {
    expect(buildInspectionLines({ notes: 1000, coins: 50 }, []).map((l) => l.kind)).toEqual(['CASH', 'COINS']);
    expect(buildInspectionLines({ notes: 1000, coins: 50, safe: null }, []).map((l) => l.kind)).toEqual(['CASH', 'COINS']);
  });

  it('και ένα δηλωμένο 0 € είναι δήλωση: η γραμμή υπάρχει', () => {
    expect(buildInspectionLines({ notes: 1000, coins: 50, safe: 0 }, []).some((l) => l.kind === 'SAFE')).toBe(true);
  });

  it('ό,τι λείπει από τις δεσμίδες χρεώνεται ολόκληρο, όπως τα χαρτονομίσματα', () => {
    const f = lineFinding(withFound('safe', 5500).find((l) => l.key === 'safe')!);
    expect(f.missingUnits).toBe(500);
    expect(f.shortfall).toBe(500);
    expect(summariseInspection(withFound('safe', 5500)).shortfall).toBe(500);
  });

  it('το περισσότερο δεν είναι πίστωση: είναι λάθος μέτρημα', () => {
    expect(lineFinding(withFound('safe', 6500).find((l) => l.key === 'safe')!).shortfall).toBe(0);
    expect(lineFinding(withFound('safe', 6500).find((l) => l.key === 'safe')!).corrected).toBe(true);
  });

  it('το ίδιο ποσό όπως δηλώθηκε: καμία διαφορά', () => {
    const f = lineFinding(withFound('safe', 6000).find((l) => l.key === 'safe')!);
    expect(f).toEqual({ missingUnits: 0, shortfall: 0, corrected: false });
  });

  it('το σύνολο που λείπει αθροίζει και τα τρία κομμάτια', () => {
    const l = lines.map((x) => ({ ...x, found: x.key === 'cash' ? 990 : x.key === 'coins' ? 45 : 5900 }));
    expect(summariseInspection(l).shortfall).toBe(10 + 5 + 100);
  });

  it('τα παραδοτέα έχουν τρία κομμάτια, και το σύνολο μετρητών τα περιέχει όλα', () => {
    expect(inspectionHandover(lines)).toMatchObject({ notes: 1000, coins: 50, safe: 6000, money: 7050 });
  });

  it('χωρίς γραμμή χρηματοκιβωτίου, τα παραδοτέα είναι όπως πάντα', () => {
    const h = inspectionHandover(buildInspectionLines({ notes: 1000, coins: 50 }, []));
    expect(h).toMatchObject({ safe: 0, money: 1050 });
  });
});

describe('η οθόνη της επιθεώρησης', () => {
  const lines = buildInspectionLines({ notes: 1000, coins: 50, safe: 6000 }, []);
  const noop = () => {};
  const panel = (ls: InspectionLine[]) =>
    renderToStaticMarkup(
      React.createElement(ShiftInspectionPanel as never, {
        previousOperatorName: 'Νίκος',
        lines: ls,
        onChangeFound: noop,
        onSkip: noop,
      } as never)
    );

  it('το «Παραλαμβάνετε» δείχνει τα τρία κομμάτια χωριστά', () => {
    const html = renderToStaticMarkup(React.createElement(InspectionHandoverSummary as never, { lines } as never));
    expect(html).toContain('Χαρτονομίσματα');
    expect(html).toContain('Κέρματα');
    expect(html).toContain('Χρηματοκιβώτιο');
    expect(html).toContain('6.000,00');
    expect(html).toContain('7.050,00');
    expect(html).toContain('grid-cols-3');
  });

  it('χωρίς χρηματοκιβώτιο, δύο στήλες όπως πριν και τίποτα δεν αλλάζει', () => {
    const html = renderToStaticMarkup(
      React.createElement(InspectionHandoverSummary as never, { lines: buildInspectionLines({ notes: 1000, coins: 50 }, []) } as never)
    );
    expect(html).toContain('grid-cols-2');
    expect(html).not.toContain('Χρηματοκιβώτιο');
  });

  it('υπάρχει ενότητα για το χρηματοκιβώτιο, με το δηλωμένο ποσό και πεδίο «Βρήκα»', () => {
    const html = panel(lines);
    expect(html).toContain('Χρηματοκιβώτιο (δεσμίδες)');
    expect(html).toContain('Δηλώθηκε: €6.000,00');
    expect(html).toContain('Βρήκα — Χρηματοκιβώτιο (δεσμίδες)');
  });

  it('οι ενότητες αριθμούνται όσες φαίνονται: 1, 2, 3', () => {
    const html = panel(lines);
    expect(html).toMatch(/1\. Αρχικό Κεφάλαιο/);
    expect(html).toMatch(/2\. Κέρματα/);
    expect(html).toMatch(/3\. Χρηματοκιβώτιο/);
  });

  it('και με εισιτήρια από κάτω, η ενότητα τους είναι η 4η', () => {
    const withTickets = buildInspectionLines({ notes: 1000, coins: 50, safe: 6000 }, [
      { id: 'a', name: 'ΓΑΤΑ', price: 2, endNo: '55', kind: 'SCRATCH' },
    ]);
    expect(panel(withTickets)).toMatch(/4\. Σκρατς &amp; Λαχεία/);
  });

  it('χωρίς χρηματοκιβώτιο, τα εισιτήρια μένουν η 3η ενότητα, όπως πριν', () => {
    const noSafe = buildInspectionLines({ notes: 1000, coins: 50 }, [
      { id: 'a', name: 'ΓΑΤΑ', price: 2, endNo: '55', kind: 'SCRATCH' },
    ]);
    expect(panel(noSafe)).toMatch(/3\. Σκρατς &amp; Λαχεία/);
    expect(panel(noSafe)).not.toContain('Χρηματοκιβώτιο');
  });
});

describe('το άνοιγμα στο πρόγραμμα', () => {
  const modal = read('src/components/shifts/ShiftOpeningModal.tsx');
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');

  it('το αρχικό ταμείο είναι χαρτονομίσματα + κέρματα + χρηματοκιβώτιο + προσαυξήσεις', () => {
    expect(modal).toMatch(/roundCurrency\(banknotesNum \+ coinsNum \+ safeNum \+ inheritedTopUps\)/);
  });

  it('έχει δικό του πεδίο «Χρηματοκιβώτιο», μόνο όταν το κατάστημα το μετράει', () => {
    expect(modal).toContain('data-testid="opening-safe-field"');
    expect(modal).toMatch(/\{safeCountEnabled && \(\s*<div data-testid="opening-safe-field">/);
  });

  it('τη συνέχεια της ημέρας και την πρώτη βάρδια τις λύνει η ίδια συνάρτηση', () => {
    expect(modal).toMatch(/continuingDay: true,\s*dayOpeningSafe: \(todaySnapshot as any\)\.opening_safe/);
    expect(modal).toMatch(/continuingDay: false,\s*previousSafeCount: \(prev as any\)\?\.safe_count/);
  });

  it('γράφεται στη βάρδια, ώστε η επόμενη της ημέρας και οι λεπτομέρειες να το βρίσκουν', () => {
    expect(modal).toMatch(/opening_safe: safeNum,/);
  });

  it('η επιθεώρηση παίρνει γραμμή χρηματοκιβωτίου, και μια διόρθωση γίνεται το άνοιγμα', () => {
    expect(modal).toMatch(/safe: safeEnabled \? openingSafeResolved : undefined/);
    expect(modal).toMatch(/if \(key === 'safe'\) setOpeningSafe\(found\.toFixed\(2\)\);/);
  });

  it('το κλείσιμο της βάρδιας βάζει το χρηματοκιβώτιο στο αρχικό σύνολο και το γράφει πίσω', () => {
    expect(wizard).toMatch(/safeNum\(openingSafeAmount\) \+\s*topUpTotal/);
    expect(wizard).toMatch(/opening_safe: safeNum\(openingSafeAmount\),/);
    expect(wizard).toContain('data-testid="wizard-opening-safe"');
  });
});

describe('ο έλεγχος του αρχικού κεφαλαίου ξέρει το χρηματοκιβώτιο', () => {
  it('βγαίνει όταν το αποθηκευμένο opening_cash το περιέχει', () => {
    const a = auditOpeningCash({ notes: 1000, coins: 50, safe: 6000, stored: 7050 });
    expect(a.computed).toBe(7050);
    expect(a.balances).toBe(true);
  });

  it('αν το αποθηκευμένο δεν το περιέχει, η διαφορά ονομάζεται', () => {
    const a = auditOpeningCash({ notes: 1000, coins: 50, safe: 6000, stored: 1050 });
    expect(a.balances).toBe(false);
    expect(a.unexplained).toBe(-6000);
  });

  it('μια βάρδια χωρίς χρηματοκιβώτιο βγαίνει όπως πάντα', () => {
    expect(auditOpeningCash({ notes: 1000, coins: 50, stored: 1050 }).balances).toBe(true);
  });

  it('οι λεπτομέρειες το περνούν και το δείχνουν', () => {
    const d = read('src/components/shifts/ShiftDetailsModal.tsx');
    expect(d).toContain('safe: shift.custom_field_values?.opening_safe');
    expect(d).toContain('data-testid="details-opening-safe"');
  });
});

describe('η μετανάστευση 0089', () => {
  const sql = read('supabase/migrations/0089_the_safe_travels_with_the_opening.sql');

  it('και οι δύο συναρτήσεις ξαναγράφονται με DROP πριν το CREATE (αλλάζει η λίστα στηλών)', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS shift_handover_snapshot\(TEXT, TEXT, TIMESTAMPTZ\);\s*\n\s*CREATE FUNCTION shift_handover_snapshot/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS shift_day_opening\(TEXT, TEXT, DATE\);\s*\n\s*CREATE FUNCTION shift_day_opening/);
  });

  it('το handover επιστρέφει το safe_count και το day opening το opening_safe', () => {
    expect(sql).toContain("safe_count             JSONB");
    expect(sql).toContain("s.custom_field_values -> 'safe_count'");
    expect(sql).toContain('opening_safe          NUMERIC');
    expect(sql).toContain("COALESCE((d.custom_field_values ->> 'opening_safe')::NUMERIC, 0)");
  });

  it('δεν αλλάζει κανένα από τα υπάρχοντα πεδία: οι παλιές στήλες μένουν όπως ήταν', () => {
    for (const col of ['previous_operator_name', 'counted_denominations', 'opening_cash_coins', 'scratch_ticket_items', 'inspection_status', 'opened_by_user_id']) {
      expect(sql).toContain(col);
    }
    for (const col of ['scratch_gross_today', 'scratch_payouts_today', 'topups_today', 'shift_types_today']) {
      expect(sql).toContain(col);
    }
  });

  it('δίνει ξανά δικαίωμα εκτέλεσης και στις δύο', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION shift_handover_snapshot(TEXT, TEXT, TIMESTAMPTZ) TO authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION shift_day_opening(TEXT, TEXT, DATE) TO authenticated;');
  });
});

describe('δεν υπάρχει πια το «Χ» δίπλα στο + και το − των χαρτονομισμάτων και κερμάτων', () => {
  const draw = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      React.createElement(CashDenominationCounter as never, { denominations: {}, onChange: () => {}, ...props } as never)
    );

  it('ούτε όταν υπάρχει ποσότητα (εκεί εμφανιζόταν και σου μηδένιζε το μέτρημα κατά λάθος)', () => {
    const html = draw({ denominations: { '20': 5, '2': 10, '0.50': 31 } });
    expect(html).not.toContain('Μηδενισμός αξίας');
  });

  it('ούτε στη στήλη του χρηματοκιβωτίου', () => {
    const html = draw({
      denominations: { '20': 5 },
      safe: { bundles: { '50': 2 }, sizes: DEFAULT_SAFE_BUNDLE_SIZES, onChange: () => {} },
    });
    expect(html).not.toContain('Μηδενισμός αξίας');
  });

  it('το κώδικας δεν έχει το κουμπί ούτε το εικονίδιο', () => {
    const src = read('src/components/shifts/CashDenominationCounter.tsx');
    expect(src).not.toContain('updateCount(denom.key, -qty)');
    expect(src).not.toMatch(/<X className=/);
    expect(src).not.toMatch(/lucide-react';[\s\S]*\bX\b[\s\S]*from/);
  });

  it('το μηδενισμός ολόκληρης της στήλης (με το δικό του κουμπί) μένει, γιατί αυτό είναι επιλογή και όχι ατύχημα', () => {
    const html = draw({ denominations: { '20': 5 } });
    expect(html).toContain('Μηδενισμός');
  });
});
