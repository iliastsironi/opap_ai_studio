import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  buildVltDayRows,
  summariseVltMonth,
  usesManualVltCount,
  vltMismatches,
  type VltShiftInput,
} from '../lib/vltReportCheck.ts';

/**
 * «Στον έλεγχο VLTs ΜΟΝΟ ΣΤΟ PLAY να γίνεται manual. Δηλαδή το ποσό που μπαίνει μόνο του από το
 * "μετρητά στα VLTs" να το βάζουμε εμείς manual.»
 *
 * Στο Play το νούμερο της ημέρας το γράφει ο άνθρωπος και συγκρίνεται με το Report Allwynnet. Το
 * λάθος που κοστίζει: ένα report απέναντι σε «τίποτα» να βγάζει διαφορά ίση με ολόκληρο το report
 * (ψεύτικη ειδοποίηση κάθε μέρα), ή το πρακτορείο να αλλάξει. Γι' αυτό τα τεστ κοιτάνε και τα δύο.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const PLAY = 'play';
const LAMIA = 'lamia';
const MORNING = '2026-11-15T06:30:00Z'; // 08:30 Αθήνας
const EVENING = '2026-11-15T14:30:00Z'; // 16:30 Αθήνας

const shift = (over: Partial<VltShiftInput> & { at: string }): VltShiftInput => {
  const { at, ...rest } = over;
  return {
    id: `s-${at}`, store_id: LAMIA, register_id: 'Ταμείο 1', opened_at: at, status: 'APPROVED',
    vlts_cash_in: 0, vlts_cash_out: 0, ...rest,
  };
};

// Το Play: οι βάρδιες γράφουν μόνο πληρωμές (cash_out αρνητικό), ποτέ μετρητά μέσα (cash_in = 0).
const playShifts = [
  shift({ at: MORNING, store_id: PLAY, vlts_cash_out: -1419.8 }),
  shift({ at: EVENING, store_id: PLAY, vlts_cash_out: -4691.1 }),
];

const rowOf = (rows: ReturnType<typeof buildVltDayRows>, store: string, date: string) =>
  rows.find((r) => r.storeId === store && r.date === date)!;

describe('ποιο κατάστημα γράφει το νούμερο με το χέρι', () => {
  it('μόνο το Play', () => {
    expect(usesManualVltCount('PLAY_STORE')).toBe(true);
    expect(usesManualVltCount('OPAP_AGENCY')).toBe(false);
    expect(usesManualVltCount('OPAP_FNB')).toBe(false);
    expect(usesManualVltCount(undefined)).toBe(false);
    expect(usesManualVltCount(null)).toBe(false);
  });
});

describe('Play: το νούμερο της ημέρας γράφεται με το χέρι και συγκρίνεται με το report', () => {
  const build = (manualCounts: any[], reports: any[], shifts = playShifts) =>
    buildVltDayRows({ shifts, reports, manualStoreIds: [PLAY], manualCounts });

  it('χωρίς νούμερο η ημέρα περιμένει: ΔΕΝ συγκρίνεται με μηδέν και δεν ειδοποιεί', () => {
    const rows = build([], [{ id: 'r', store_id: PLAY, report_date: '2026-11-15', amount: 9000 }]);
    const row = rowOf(rows, PLAY, '2026-11-15');
    expect(row.status).toBe('AWAITING_COUNT');
    expect(row.difference).toBeNull();        // όχι 9.000
    expect(row.manualAmount).toBeNull();
    expect(vltMismatches(rows)).toHaveLength(0);
  });

  it('τα μετρητά στα VLTs των βαρδιών δεν μετράνε στο Play, ακόμα κι αν κάποτε γραφτούν', () => {
    const shifts = [shift({ at: EVENING, store_id: PLAY, vlts_cash_in: 777 })];
    const row = rowOf(build([{ id: 'c', store_id: PLAY, count_date: '2026-11-15', amount: 1200 }], [], shifts), PLAY, '2026-11-15');
    expect(row.shiftsAmount).toBe(1200);      // όχι 777
    expect(row.manualAmount).toBe(1200);
  });

  it('νούμερο και report ίδια: ταιριάζει', () => {
    const rows = build(
      [{ id: 'c', store_id: PLAY, count_date: '2026-11-15', amount: 1250.5 }],
      [{ id: 'r', store_id: PLAY, report_date: '2026-11-15', amount: 1250.5 }]
    );
    expect(rowOf(rows, PLAY, '2026-11-15')).toMatchObject({ status: 'MATCH', difference: 0, manual: true, manualId: 'c' });
  });

  it('νούμερο και report διαφορετικά: διαφορά report − νούμερο, και ειδοποιεί', () => {
    const rows = build(
      [{ id: 'c', store_id: PLAY, count_date: '2026-11-15', amount: 1200 }],
      [{ id: 'r', store_id: PLAY, report_date: '2026-11-15', amount: 1250 }]
    );
    expect(rowOf(rows, PLAY, '2026-11-15')).toMatchObject({ status: 'DIFFERENT', difference: 50 });
    expect(vltMismatches(rows)).toHaveLength(1);
  });

  it('το νούμερο μπορεί να γραφτεί πριν έρθει το report: περιμένει report', () => {
    const rows = build([{ id: 'c', store_id: PLAY, count_date: '2026-11-15', amount: 1200 }], []);
    expect(rowOf(rows, PLAY, '2026-11-15')).toMatchObject({ status: 'AWAITING_REPORT', difference: null });
  });

  it('δεν περιμένει να κλείσουν οι βάρδιες: το νούμερο που γράφτηκε είναι το τελικό', () => {
    const open = [shift({ at: EVENING, store_id: PLAY, status: 'OPEN', vlts_cash_out: -10 })];
    const rows = build(
      [{ id: 'c', store_id: PLAY, count_date: '2026-11-15', amount: 500 }],
      [{ id: 'r', store_id: PLAY, report_date: '2026-11-15', amount: 500 }],
      open
    );
    expect(rowOf(rows, PLAY, '2026-11-15').status).toBe('MATCH');
  });

  it('ημέρα χωρίς βάρδιες αλλά με νούμερο εμφανίζεται', () => {
    const rows = build([{ id: 'c', store_id: PLAY, count_date: '2026-11-10', amount: 300 }], [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-11-10', shiftCount: 0, shiftsAmount: 300, status: 'AWAITING_REPORT' });
  });

  it('λεπτά, όχι δεκαδικά: 0,1 + 0,2 δεν βγάζει διαφορά', () => {
    const rows = build(
      [{ id: 'c', store_id: PLAY, count_date: '2026-11-15', amount: 0.1 + 0.2 }],
      [{ id: 'r', store_id: PLAY, report_date: '2026-11-15', amount: 0.3 }]
    );
    expect(rowOf(rows, PLAY, '2026-11-15').status).toBe('MATCH');
  });

  it('η έγκριση διαφοράς ισχύει όσο η διαφορά είναι η ίδια, και πέφτει αν αλλάξει το νούμερο', () => {
    const report = { id: 'r', store_id: PLAY, report_date: '2026-11-15', amount: 1250, approved_difference: 50, approved_by_name: 'Μαρία' };
    const same = build([{ id: 'c', store_id: PLAY, count_date: '2026-11-15', amount: 1200 }], [report]);
    expect(rowOf(same, PLAY, '2026-11-15').approval).toMatchObject({ amount: 50, by: 'Μαρία' });
    expect(vltMismatches(same)).toHaveLength(0);

    const changed = build([{ id: 'c', store_id: PLAY, count_date: '2026-11-15', amount: 1100 }], [report]);
    expect(rowOf(changed, PLAY, '2026-11-15').approval).toBeNull();
    expect(vltMismatches(changed)).toHaveLength(1);
  });
});

describe('το πρακτορείο δεν αλλάζει', () => {
  const shifts = [shift({ at: EVENING, vlts_cash_in: 1200 }), ...playShifts];
  const withPlay = buildVltDayRows({
    shifts,
    reports: [
      { id: 'rl', store_id: LAMIA, report_date: '2026-11-15', amount: 1250 },
      { id: 'rp', store_id: PLAY, report_date: '2026-11-15', amount: 5000 },
    ],
    manualStoreIds: [PLAY],
    manualCounts: [],
  });
  const without = buildVltDayRows({
    shifts: shifts.filter((s) => s.store_id === LAMIA),
    reports: [{ id: 'rl', store_id: LAMIA, report_date: '2026-11-15', amount: 1250 }],
  });

  it('η γραμμή του πρακτορείου βγαίνει ίδια με πριν, με ή χωρίς το Play δίπλα του', () => {
    expect(rowOf(withPlay, LAMIA, '2026-11-15')).toEqual(rowOf(without, LAMIA, '2026-11-15'));
    expect(rowOf(withPlay, LAMIA, '2026-11-15')).toMatchObject({
      manual: false, manualAmount: null, shiftsAmount: 1200, status: 'DIFFERENT', difference: 50,
    });
  });

  it('χωρίς καταστήματα με χειροκίνητο νούμερο όλα βγαίνουν από τις βάρδιες, όπως πάντα', () => {
    const rows = buildVltDayRows({ shifts, reports: [] });
    expect(rows.every((r) => r.manual === false && r.status !== 'AWAITING_COUNT')).toBe(true);
  });

  it('ένα νούμερο που γράφτηκε για κατάστημα που δεν το γράφει με το χέρι αγνοείται', () => {
    const rows = buildVltDayRows({
      shifts: [shift({ at: EVENING, vlts_cash_in: 1200 })],
      reports: [],
      manualStoreIds: [PLAY],
      manualCounts: [
        { id: 'x', store_id: LAMIA, count_date: '2026-11-15', amount: 99999 },
        // Ημέρα χωρίς βάρδια και χωρίς report: ένα ξεχασμένο νούμερο δεν πρέπει να φτιάξει γραμμή στο πρακτορείο.
        { id: 'y', store_id: LAMIA, count_date: '2026-11-10', amount: 500 },
      ],
    });
    expect(rowOf(rows, LAMIA, '2026-11-15')).toMatchObject({ manual: false, shiftsAmount: 1200, manualAmount: null });
    expect(rows.map((r) => r.date)).toEqual(['2026-11-15']);
  });

  it('το Play στην ίδια λίστα δεν ειδοποιεί όσο δεν έχει νούμερο, μόνο το πρακτορείο ειδοποιεί', () => {
    const alerting = vltMismatches(withPlay);
    expect(alerting.map((r) => r.storeId)).toEqual([LAMIA]);
  });
});

describe('σύνολο μήνα με χειροκίνητες ημέρες', () => {
  const rows = buildVltDayRows({
    shifts: [
      shift({ at: '2026-11-15T14:00:00Z', store_id: PLAY, vlts_cash_out: -1 }),
      shift({ at: '2026-11-14T14:00:00Z', store_id: PLAY, vlts_cash_out: -1 }),
      shift({ at: '2026-11-13T14:00:00Z', store_id: PLAY, vlts_cash_out: -1 }),
    ],
    reports: [
      { id: 'r15', store_id: PLAY, report_date: '2026-11-15', amount: 1250 },
      { id: 'r14', store_id: PLAY, report_date: '2026-11-14', amount: 800 },
      { id: 'r13', store_id: PLAY, report_date: '2026-11-13', amount: 4000 },
    ],
    manualStoreIds: [PLAY],
    manualCounts: [
      { id: 'c15', store_id: PLAY, count_date: '2026-11-15', amount: 1200 },
      { id: 'c14', store_id: PLAY, count_date: '2026-11-14', amount: 800 },
    ], // 13/11: έχει report, όχι νούμερο
  });
  const summary = summariseVltMonth(rows);

  it('η ημέρα χωρίς νούμερο δεν μετράει στην απόκλιση (όχι −4.000 «έλλειμμα»)', () => {
    expect(summary.comparedDays).toBe(2);
    expect(summary.deviation).toBe(50);       // (1250−1200) + (800−800)
    expect(summary.awaitingCountDays).toBe(1);
  });

  it('το σύνολο είναι ό,τι γράφτηκε', () => {
    expect(summary.shiftsTotal).toBe(2000);
    expect(summary.reportTotal).toBe(6050);
  });
});

/* ---------------------------------------------------------------- η οθόνη */

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ organization: { id: 'org' }, user: { id: 'u' }, roles: [], permissions: [] }),
}));
vi.mock('../context/TenantContext.tsx', () => ({
  useTenant: () => ({ selectedStoreId: 'ALL', stores: [{ id: 'lamia', name: 'Lamia' }, { id: 'play', name: 'Play' }] }),
}));

const { VltCheckTable, VltAlertBanner, VltMonthSummaryStrip, countKey } = await import('../components/shifts/VltReportCheck.tsx');

describe('ο πίνακας', () => {
  const rows = buildVltDayRows({
    shifts: [shift({ at: EVENING, vlts_cash_in: 1200 }), ...playShifts],
    reports: [
      { id: 'rl', store_id: LAMIA, report_date: '2026-11-15', amount: 1250 },
      { id: 'rp', store_id: PLAY, report_date: '2026-11-15', amount: 5000 },
    ],
    manualStoreIds: [PLAY],
    manualCounts: [],
  });
  const name = (id: string) => (id === 'play' ? 'Play' : 'Lamia');
  const html = (over: Record<string, unknown> = {}, list = rows) =>
    renderToStaticMarkup(<VltCheckTable rows={list} storeName={name} showStore drafts={{}} {...(over as object)} />);

  it('η γραμμή του Play έχει πεδίο για το νούμερο της ημέρας, του πρακτορείου όχι', () => {
    const out = html();
    expect(out).toContain('aria-label="Μετρητά στα VLTs 15/11/2026"');
    expect(out.match(/aria-label="Μετρητά στα VLTs/g)).toHaveLength(1);
    expect(out).toContain('γράφεται χειροκίνητα');
    expect(out).toContain('1.200,00'); // το πρακτορείο δείχνει ακόμα το νούμερο των βαρδιών
  });

  it('η ημέρα του Play χωρίς νούμερο λέει ΑΝΑΜΟΝΗ ΝΟΥΜΕΡΟ', () => {
    expect(html()).toContain('ΑΝΑΜΟΝΗ ΝΟΥΜΕΡΟ');
  });

  it('το πεδίο δείχνει ό,τι έχει γραφτεί, και ό,τι πληκτρολογείται αυτή τη στιγμή', () => {
    const typed = buildVltDayRows({
      shifts: playShifts, reports: [], manualStoreIds: [PLAY],
      manualCounts: [{ id: 'c', store_id: PLAY, count_date: '2026-11-15', amount: 1200.5 }],
    });
    expect(html({}, typed)).toContain('value="1200,5"');
    expect(html({ drafts: { [countKey('play|2026-11-15')]: '1300' } }, typed)).toContain('value="1300"');
  });

  it('χωρίς δικαίωμα επεξεργασίας το πεδίο είναι μόνο για ανάγνωση', () => {
    expect(html({ readOnly: true })).toMatch(/aria-label="Μετρητά στα VLTs 15\/11\/2026"[^>]*readOnly=""|readOnly=""[^>]*aria-label="Μετρητά στα VLTs 15\/11\/2026"/);
  });

  it('όταν όλες οι γραμμές είναι του Play η στήλη το λέει', () => {
    const playOnly = rows.filter((r) => r.manual);
    expect(html({}, playOnly)).toContain('Μετρητά στα VLTs (χειροκίνητα)');
    expect(html()).toContain('Από τις βάρδιες');
  });

  it('η ειδοποίηση λέει «χειροκίνητα» για το Play και «βάρδιες» για το πρακτορείο', () => {
    const diff = buildVltDayRows({
      shifts: [shift({ at: EVENING, vlts_cash_in: 1200 }), ...playShifts],
      reports: [
        { id: 'rl', store_id: LAMIA, report_date: '2026-11-15', amount: 1250 },
        { id: 'rp', store_id: PLAY, report_date: '2026-11-15', amount: 1250 },
      ],
      manualStoreIds: [PLAY],
      manualCounts: [{ id: 'c', store_id: PLAY, count_date: '2026-11-15', amount: 1000 }],
    });
    const banner = renderToStaticMarkup(<VltAlertBanner mismatches={vltMismatches(diff)} storeName={name} />);
    expect(banner).toContain('Lamia: βάρδιες');
    expect(banner).toContain('Play: χειροκίνητα');
    expect(banner).toContain('Στο Play το νούμερο της ημέρας το γράφετε εσείς');
  });

  it('η ειδοποίηση του πρακτορείου μόνου του μένει όπως ήταν', () => {
    const onlyLamia = vltMismatches(rows).filter((r) => !r.manual);
    const banner = renderToStaticMarkup(<VltAlertBanner mismatches={onlyLamia} storeName={name} />);
    expect(banner).not.toContain('χειροκίνητα');
    expect(banner).not.toContain('Στο Play');
  });

  it('το σύνολο μήνα το λέει όταν είναι γραμμένο με το χέρι', () => {
    const s = summariseVltMonth(rows);
    expect(renderToStaticMarkup(<VltMonthSummaryStrip summary={s} monthText="Νοέμβριος" manual="ALL" />)).toContain('Σύνολο μήνα · χειροκίνητα');
    expect(renderToStaticMarkup(<VltMonthSummaryStrip summary={s} monthText="Νοέμβριος" manual="SOME" />)).toContain('Play: όπως τα γράψατε');
    expect(renderToStaticMarkup(<VltMonthSummaryStrip summary={s} monthText="Νοέμβριος" />)).toContain('από τις βάρδιες');
    expect(renderToStaticMarkup(<VltMonthSummaryStrip summary={s} monthText="Νοέμβριος" />)).not.toContain('Play');
  });
});

describe('σύνδεση: ένας κανόνας, μία πηγή, ένα νέο τραπέζι', () => {
  const service = read('src/services/vltReportService.ts');
  const hook = read('src/components/shifts/useVltMismatchCount.ts');
  const component = read('src/components/shifts/VltReportCheck.tsx');
  const sql = read('supabase/migrations/0097_the_vlt_check_at_play_is_typed_by_hand.sql');

  it('η υπηρεσία διαβάζει τον τύπο κάθε καταστήματος και τα νούμερα του πίνακα, και δεν συνεχίζει αν αποτύχει ο τύπος', () => {
    expect(service).toContain("supabase.from('stores').select('id, store_type')");
    expect(service).toContain('.filter((s) => usesManualVltCount(s.store_type))');
    expect(service).toContain("const MANUAL_TABLE = 'vlt_manual_counts';");
    expect(service).toMatch(/if \(storeError\) throw new Error/);
  });

  it('η ένδειξη της καρτέλας και η οθόνη δίνουν στον κανόνα τα ίδια δεδομένα', () => {
    for (const source of [hook, component]) {
      expect(source).toContain('manualStoreIds: data.manualStoreIds');
      expect(source).toContain('manualCounts: data.manualCounts');
    }
  });

  it('το νούμερο γράφεται στον δικό του πίνακα, ποτέ στις βάρδιες ή στο report', () => {
    expect(service).toMatch(/export async function saveVltManualCount/);
    expect(service).toMatch(/\.from\(MANUAL_TABLE\)\s*\.upsert/);
    expect(service).toContain("{ onConflict: 'organization_id,store_id,count_date' }");
    expect(component).toContain('saveVltManualCount({ orgId, storeId: row.storeId');
    expect(component).not.toMatch(/from\('shifts'\)\s*\.update/);
  });

  it('η μετάπτωση φτιάχνει μόνο τον νέο πίνακα, με τις πολιτικές του report, και δεν αγγίζει τίποτα άλλο', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vlt_manual_counts');
    expect(sql).toContain('UNIQUE (organization_id, store_id, count_date)');
    expect(sql).toContain('ALTER TABLE vlt_manual_counts ENABLE ROW LEVEL SECURITY;');
    expect(sql.match(/CREATE POLICY vlt_manual_counts_\w+ ON vlt_manual_counts FOR (SELECT|INSERT|UPDATE|DELETE)/g)).toHaveLength(4);
    expect(sql.match(/auth_is_elevated\(\)/g)!.length).toBeGreaterThanOrEqual(5);
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/ALTER TABLE (shifts|vlt_portal_reports|stores)/i);
    expect(code).not.toMatch(/(UPDATE|DELETE FROM)\s+(shifts|vlt_portal_reports)/i);
  });
});
