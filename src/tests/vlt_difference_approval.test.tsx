import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildVltDayRows, vltMismatches } from '../lib/vltReportCheck.ts';

/**
 * «Πάνω στο κόκκινο notice βάλε ένα κουμπάκι «έγκριση διαφοράς»: το πατάς και παύει να σου
 * βγάζει το notice. Οι βάρδιες μένουν κοκκινισμένες, αλλά δίπλα ένα τικ ότι η διαφορά έχει
 * εγκριθεί από υπεύθυνο.»
 */
const db = vi.hoisted(() => {
  const state = {
    updates: [] as Record<string, unknown>[],
    eqs: [] as unknown[][],
    count: 1 as number | null,
    selects: [] as string[],
    failApprovedSelect: false,
  };
  const builder: any = {
    update: (payload: Record<string, unknown>) => (state.updates.push(payload), builder),
    eq: (...a: unknown[]) => (state.eqs.push(a), builder),
    select: (cols: string) => (state.selects.push(cols), builder),
    gte: () => builder,
    lte: () => builder,
    lt: () => builder,
    in: () => builder,
    order: async () => ({ data: [], error: null }),
    then: (resolve: (v: unknown) => unknown) => {
      const last = state.selects[state.selects.length - 1] ?? '';
      if (state.failApprovedSelect && /approved_/.test(last)) {
        return resolve({ data: null, error: { message: 'column vlt_portal_reports.approved_difference does not exist' } });
      }
      return resolve({ data: [], error: null, count: state.count });
    },
  };
  return { state, builder };
});
vi.mock('../services/supabase.ts', () => ({ supabase: { from: () => db.builder } }));
vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ organization: { id: 'org' }, user: { id: 'u1', first_name: 'Γιώργος', last_name: 'Κουτρομάνος' } }),
}));
vi.mock('../context/TenantContext.tsx', () => ({
  useTenant: () => ({ selectedStoreId: 'ALL', stores: [] }),
}));

const { VltAlertBanner, VltCheckTable } = await import('../components/shifts/VltReportCheck.tsx');
const { approveVltDifference, revokeVltApproval, fetchVltCheckData } = await import('../services/vltReportService.ts');

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf-8');

// Μια ημέρα με κλεισμένη βάρδια 1.195 € και report 1.190 €: διαφορά −5 €.
const shift = { id: 's1', store_id: 'st', register_id: 'R1', opened_at: '2026-10-30T08:00:00Z', status: 'APPROVED', vlts_cash_in: 1195, vlts_cash_out: 0 };
const report = (extra: Record<string, unknown> = {}) => ({
  id: 'r1', store_id: 'st', report_date: '2026-10-30', amount: 1190, ...extra,
});
const rowOf = (extra: Record<string, unknown> = {}, shifts = [shift]) =>
  buildVltDayRows({ shifts: shifts as never, reports: [report(extra)] as never })[0];

beforeEach(() => {
  db.state.updates = [];
  db.state.eqs = [];
  db.state.selects = [];
  db.state.count = 1;
  db.state.failApprovedSelect = false;
});

describe('μια εγκεκριμένη διαφορά', () => {
  it('μια διαφορά χωρίς έγκριση ειδοποιεί, όπως πάντα', () => {
    const row = rowOf();
    expect(row.status).toBe('DIFFERENT');
    expect(row.approval).toBeNull();
    expect(vltMismatches([row])).toHaveLength(1);
  });

  it('αν εγκριθεί, ΔΕΝ ειδοποιεί πια - αλλά η γραμμή μένει «διαφορά», γιατί το ποσό δεν βγήκε', () => {
    const row = rowOf({ approved_difference: -5, approved_by_name: 'Γιώργος Κουτρομάνος', approved_at: '2026-11-17T08:44:00Z' });
    expect(row.status).toBe('DIFFERENT');
    expect(row.difference).toBe(-5);
    expect(row.approval).toEqual({ amount: -5, by: 'Γιώργος Κουτρομάνος', at: '2026-11-17T08:44:00Z' });
    expect(vltMismatches([row])).toHaveLength(0);
  });

  it('η έγκριση ισχύει μόνο για ΑΥΤΗ τη διαφορά: αν το report αλλάξει, ξαναβγαίνει η ειδοποίηση', () => {
    // εγκρίθηκε το −5, αλλά το report πλέον είναι 1.185 (διαφορά −10)
    const changed = buildVltDayRows({
      shifts: [shift] as never,
      reports: [report({ amount: 1185, approved_difference: -5 })] as never,
    })[0];
    expect(changed.difference).toBe(-10);
    expect(changed.approval).toBeNull();
    expect(vltMismatches([changed])).toHaveLength(1);
  });

  it('και αν αλλάξει μια βάρδια της ημέρας', () => {
    const changed = rowOf({ approved_difference: -5 }, [{ ...shift, vlts_cash_in: 1200 }]);
    expect(changed.difference).toBe(-10);
    expect(changed.approval).toBeNull();
    expect(vltMismatches([changed])).toHaveLength(1);
  });

  it('συγκρίνεται σε λεπτά: το −0,3 εγκρίνεται και ως −0.30', () => {
    const row = buildVltDayRows({
      shifts: [{ ...shift, vlts_cash_in: 100.3 }] as never,
      reports: [report({ amount: 100, approved_difference: '-0.30' })] as never,
    })[0];
    expect(row.difference).toBe(-0.3);
    expect(row.approval).not.toBeNull();
  });

  it('μια ημέρα που ταιριάζει δεν έχει έγκριση, ό,τι κι αν έχει μείνει γραμμένο', () => {
    const row = buildVltDayRows({
      shifts: [shift] as never,
      reports: [report({ amount: 1195, approved_difference: -5 })] as never,
    })[0];
    expect(row.status).toBe('MATCH');
    expect(row.approval).toBeNull();
  });

  it('μια ημέρα με βάρδια σε εξέλιξη δεν έχει έγκριση (δεν έχει καν διαφορά που να ειδοποιεί)', () => {
    const row = rowOf({ approved_difference: -5 }, [{ ...shift, status: 'OPEN' }]);
    expect(row.status).toBe('SHIFTS_OPEN');
    expect(row.approval).toBeNull();
  });

  it('η έγκριση μιας ημέρας δεν επηρεάζει τις υπόλοιπες', () => {
    const two = buildVltDayRows({
      shifts: [shift, { ...shift, id: 's2', opened_at: '2026-10-29T08:00:00Z', vlts_cash_in: 1400 }] as never,
      reports: [
        report({ approved_difference: -5 }),
        { id: 'r2', store_id: 'st', report_date: '2026-10-29', amount: 1405 },
      ] as never,
    });
    expect(vltMismatches(two).map((r) => r.date)).toEqual(['2026-10-29']);
  });
});

describe('το κουμπί στο κόκκινο notice', () => {
  const mism = [rowOf()];
  const draw = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      React.createElement(VltAlertBanner as never, { mismatches: mism, storeName: () => 'Allwyn Store | Lamia', ...props } as never)
    );

  it('κάθε γραμμή του notice έχει «Έγκριση διαφοράς»', () => {
    const html = draw({ onApprove: () => {} });
    expect(html).toContain('Έγκριση διαφοράς');
    expect(html).toContain('aria-label="Έγκριση διαφοράς 30/10/2026"');
    expect(html).toContain('διαφορά <strong>−€5,00</strong>');
  });

  it('χωρίς δικαίωμα (readOnly) δεν υπάρχει κουμπί', () => {
    expect(draw({})).not.toContain('<button');
  });

  it('χωρίς report δεν υπάρχει τι να εγκριθεί: όχι κουμπί', () => {
    const noReport = { ...mism[0], reportId: null };
    const html = renderToStaticMarkup(
      React.createElement(VltAlertBanner as never, { mismatches: [noReport], storeName: () => 'X', onApprove: () => {} } as never)
    );
    expect(html).not.toContain('<button');
  });

  it('όταν δεν μένει καμία μη εγκεκριμένη διαφορά, το notice δεν φαίνεται', () => {
    const approved = [rowOf({ approved_difference: -5 })];
    expect(renderToStaticMarkup(React.createElement(VltAlertBanner as never, { mismatches: vltMismatches(approved), storeName: () => 'X' } as never))).toBe('');
  });

  it('δείχνει το σφάλμα αν η έγκριση δεν γράφτηκε', () => {
    expect(draw({ onApprove: () => {}, approveError: 'Η διαφορά δεν εγκρίθηκε' })).toContain('Η διαφορά δεν εγκρίθηκε');
  });
});

describe('ο πίνακας: κόκκινη γραμμή με τικ', () => {
  const draw = (rows: unknown[], props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      React.createElement(VltCheckTable as never, { rows, storeName: () => 'X', showStore: false, drafts: {}, onApprove: () => {}, onRevoke: () => {}, ...props } as never)
    );

  it('εγκεκριμένη: η γραμμή μένει κόκκινη, με τικ «ΕΓΚΡΙΘΗΚΕ» και το όνομα του υπευθύνου', () => {
    const html = draw([rowOf({ approved_difference: -5, approved_by_name: 'Γιώργος Κουτρομάνος', approved_at: '2026-11-17T08:44:00Z' })]);
    expect(html).toContain('data-vlt-status="DIFFERENT"');
    expect(html).toContain('bg-rose-50/60');
    expect(html).toContain('ΔΙΑΦΟΡΑ −€5,00');
    expect(html).toContain('data-vlt-approval="approved"');
    expect(html).toContain('ΕΓΚΡΙΘΗΚΕ · Γιώργος Κουτρομάνος');
    expect(html).toContain('data-vlt-approved="true"');
  });

  it('το τικ λέει από ποιον και πότε, στο title', () => {
    const html = draw([rowOf({ approved_difference: -5, approved_by_name: 'Γιώργος Κουτρομάνος', approved_at: '2026-11-17T08:44:00Z' })]);
    expect(html).toContain('εγκρίθηκε από Γιώργος Κουτρομάνος στις');
  });

  it('χωρίς όνομα, λέει «από υπεύθυνο»', () => {
    const html = draw([rowOf({ approved_difference: -5 })]);
    expect(html).toContain('από υπεύθυνο');
  });

  it('η εγκεκριμένη έχει «Αναίρεση»: η διαφορά ξαναβγάζει ειδοποίηση', () => {
    const html = draw([rowOf({ approved_difference: -5 })]);
    expect(html).toContain('aria-label="Αναίρεση έγκρισης 30/10/2026"');
  });

  it('η μη εγκεκριμένη έχει δικό της κουμπί «Έγκριση διαφοράς» και κανένα τικ', () => {
    const html = draw([rowOf()]);
    expect(html).toContain('Έγκριση διαφοράς');
    expect(html).not.toContain('ΕΓΚΡΙΘΗΚΕ');
    expect(html).not.toContain('data-vlt-approved');
  });

  it('readOnly: ούτε κουμπί ούτε αναίρεση, αλλά το τικ φαίνεται', () => {
    const html = draw([rowOf({ approved_difference: -5 })], { readOnly: true });
    expect(html).toContain('ΕΓΚΡΙΘΗΚΕ');
    expect(html).not.toContain('Αναίρεση έγκρισης');
  });

  it('μια ημέρα που ταιριάζει δεν έχει τίποτα από αυτά', () => {
    const match = buildVltDayRows({ shifts: [shift] as never, reports: [report({ amount: 1195 })] as never })[0];
    const html = draw([match]);
    expect(html).toContain('ΤΑΙΡΙΑΖΕΙ');
    expect(html).not.toContain('Έγκριση διαφοράς');
  });
});

describe('η αποθήκευση της έγκρισης', () => {
  it('γράφει ΠΟΙΑ διαφορά εγκρίθηκε, ποιος και πότε', async () => {
    await approveVltDifference({ reportId: 'r1', difference: -5, userId: 'u1', userName: ' Γιώργος Κουτρομάνος ' });
    const u = db.state.updates[0];
    expect(u.approved_difference).toBe(-5);
    expect(u.approved_by_user_id).toBe('u1');
    expect(u.approved_by_name).toBe('Γιώργος Κουτρομάνος');
    expect(typeof u.approved_at).toBe('string');
    expect(db.state.eqs[0]).toEqual(['id', 'r1']);
  });

  it('στρογγυλεύει σε λεπτά, όχι 0.30000000000000004', () => {
    return approveVltDifference({ reportId: 'r1', difference: -0.1 - 0.2 }).then(() => {
      expect(db.state.updates[0].approved_difference).toBe(-0.3);
    });
  });

  it('ένα UPDATE που το RLS φιλτράρει (0 γραμμές) δεν παριστάνει ότι εγκρίθηκε', async () => {
    db.state.count = 0;
    await expect(approveVltDifference({ reportId: 'r1', difference: -5 })).rejects.toThrow(/δεν εγκρίθηκε/);
  });

  it('η αναίρεση μηδενίζει και τα τέσσερα πεδία, και μετράει τις γραμμές', async () => {
    await revokeVltApproval('r1');
    expect(db.state.updates[0]).toEqual({
      approved_difference: null,
      approved_at: null,
      approved_by_user_id: null,
      approved_by_name: null,
    });
    db.state.count = 0;
    await expect(revokeVltApproval('r1')).rejects.toThrow(/δεν αναιρέθηκε/);
  });

  it('η ανάγνωση ζητάει και τις στήλες της έγκρισης', async () => {
    await fetchVltCheckData('org', null, '2026-10-01', '2026-10-31');
    expect(db.state.selects.some((c) => c.includes('approved_difference'))).toBe(true);
  });

  it('πριν το 0090 (δεν υπάρχουν οι στήλες) τα reports ΔΕΝ χάνονται: ξαναζητούνται χωρίς αυτές', async () => {
    db.state.failApprovedSelect = true;
    const data = await fetchVltCheckData('org', null, '2026-10-01', '2026-10-31');
    expect(data.reportsError).toBeNull();
    expect(db.state.selects.some((c) => !c.includes('approved_') && c.includes('report_date'))).toBe(true);
  });
});

describe('η καρτέλα και η ένδειξη', () => {
  const component = read('src/components/shifts/VltReportCheck.tsx');
  const hook = read('src/components/shifts/useVltMismatchCount.ts');

  it('η ειδοποίηση παίρνει την έγκριση μόνο όταν ο χρήστης μπορεί να επεξεργαστεί', () => {
    expect(component).toMatch(/onApprove=\{canEdit \? approve : undefined\}/);
  });

  it('η έγκριση γράφει τη διαφορά που φαίνεται τώρα και τον υπεύθυνο που τη δίνει', () => {
    expect(component).toMatch(/difference: row\.difference,/);
    expect(component).toMatch(/userName: user \? `\$\{user\.first_name \?\? ''\} \$\{user\.last_name \?\? ''\}`\.trim\(\) : null,/);
  });

  it('μετά την έγκριση η οθόνη ξαναφορτώνεται, άρα το notice φεύγει από μόνο του', () => {
    expect(component).toMatch(/await approveVltDifference\([\s\S]*?\);\s*await load\(\);/);
  });

  it('η ένδειξη στην καρτέλα μετράει μόνο ό,τι δεν έχει εγκριθεί', () => {
    expect(hook).toContain('vltMismatches(rows).length');
  });
});

describe('η μετανάστευση 0090', () => {
  const sql = read('supabase/migrations/0090_a_vlt_difference_can_be_approved.sql');
  it('προσθέτει τέσσερις στήλες έγκρισης στο report', () => {
    for (const col of ['approved_difference NUMERIC(12,2)', 'approved_at TIMESTAMPTZ', 'approved_by_user_id UUID', 'approved_by_name TEXT']) {
      expect(sql).toContain(col);
    }
  });
  it('δεν αλλάζει τις πολιτικές: ο υπεύθυνος που γράφει το report εγκρίνει κιόλας', () => {
    expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY/);
  });
});
