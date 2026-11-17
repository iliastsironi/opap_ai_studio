import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  FINAL_SHIFT_STATUSES,
  buildVltDayRows,
  compareVltDay,
  shiftDateKey,
  vltMismatches,
  type VltShiftInput,
} from '../lib/vltReportCheck.ts';

/**
 * Ο πράκτορας: «δεν μπορούμε να ελέγξουμε τα λεφτά που μπαίνουν μέσα στα
 * μηχανάκια· παίρνουμε ένα report μετά από 1-2 μέρες. Θα βάζουμε απλά ένα νούμερο
 * ανά ημέρα· να το διασταυρώνει μόνο του με τα μετρητά στα VLTs - μόνο στη
 * βραδινή βάρδια, το συνολικό ποσό της ημέρας - και αν βρίσκει διαφορά να
 * ειδοποιεί. Δύο στήλες: από τις βάρδιες, και δίπλα το report.»
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

// Τιμές όπως τις γράφει η βάση: 15/11/2026 στην Αθήνα είναι UTC+2.
const shift = (over: Partial<VltShiftInput> & { at: string }): VltShiftInput => {
  const { at, ...rest } = over;
  return {
    id: `s-${at}`, store_id: 'lamia', register_id: 'Ταμείο 1', opened_at: at, status: 'APPROVED',
    vlts_cash_in: 0, vlts_cash_out: 0, ...rest,
  };
};

const MORNING = '2026-11-15T06:30:00Z';   // 08:30 Αθήνας
const EVENING = '2026-11-15T14:30:00Z';   // 16:30 Αθήνας

describe('το νούμερο των βαρδιών: η τελευταία βάρδια της ημέρας, όχι το άθροισμα', () => {
  it('η βραδινή κρατά το σύνολο της ημέρας - η πρωινή δεν προστίθεται', () => {
    const rows = buildVltDayRows({
      shifts: [shift({ at: MORNING, vlts_cash_in: 500 }), shift({ at: EVENING, vlts_cash_in: 1200 })],
      reports: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].shiftsAmount).toBe(1200);            // όχι 1700
    expect(rows[0].shiftCount).toBe(2);
  });

  it('η σειρά της λίστας δεν παίζει ρόλο: η μεταγενέστερη ώρα ανοίγματος κερδίζει', () => {
    const rows = buildVltDayRows({
      shifts: [shift({ at: EVENING, vlts_cash_in: 1200 }), shift({ at: MORNING, vlts_cash_in: 500 })],
      reports: [],
    });
    expect(rows[0].shiftsAmount).toBe(1200);
  });

  it('δύο ταμεία είναι δύο ανεξάρτητα σύνολα και αθροίζονται στο κατάστημα', () => {
    const rows = buildVltDayRows({
      shifts: [
        shift({ at: MORNING, register_id: 'Ταμείο 1', vlts_cash_in: 500 }),
        shift({ at: EVENING, register_id: 'Ταμείο 1', vlts_cash_in: 1000 }),
        shift({ at: MORNING, register_id: 'Ταμείο 2', vlts_cash_in: 200 }),
        shift({ at: EVENING, register_id: 'Ταμείο 2', vlts_cash_in: 300 }),
      ],
      reports: [],
    });
    expect(rows[0].shiftsAmount).toBe(1300);            // 1000 + 300
  });

  it('βάρδια χωρίς ταμείο μετράει ως το πρώτο, όπως στο dailyAggregationService', () => {
    const rows = buildVltDayRows({
      shifts: [shift({ at: MORNING, register_id: null, vlts_cash_in: 100 }), shift({ at: EVENING, register_id: 'Ταμείο 1', vlts_cash_in: 400 })],
      reports: [],
    });
    expect(rows[0].shiftsAmount).toBe(400);
  });

  it('το νούμερο γραμμένο με κόμμα ή ως κείμενο διαβάζεται, δεν γίνεται μηδέν', () => {
    const rows = buildVltDayRows({ shifts: [shift({ at: EVENING, vlts_cash_in: '1563,5' })], reports: [] });
    expect(rows[0].shiftsAmount).toBe(1563.5);
  });

  it('ημέρα Αθήνας: βάρδια μετά τα μεσάνυχτα ώρα Αθήνας ανήκει στη νέα ημερομηνία', () => {
    // 22:30 UTC = 00:30 της επόμενης στην Αθήνα (UTC+2 τον Νοέμβριο)
    const rows = buildVltDayRows({ shifts: [shift({ at: '2026-11-14T22:30:00Z', vlts_cash_in: 90 })], reports: [] });
    expect(rows[0].date).toBe('2026-11-15');
  });

  it('κάθε κατάστημα έχει τη δική του γραμμή την ίδια ημέρα', () => {
    const rows = buildVltDayRows({
      shifts: [shift({ at: EVENING, store_id: 'lamia', vlts_cash_in: 100 }), shift({ at: EVENING, store_id: 'stylida', vlts_cash_in: 700 })],
      reports: [],
    });
    expect(rows.map((r) => `${r.storeId}:${r.shiftsAmount}`)).toEqual(['lamia:100', 'stylida:700']);
  });
});

describe('πότε μια ημέρα συγκρίνεται', () => {
  const day = (opts: { statuses: string[]; report?: number }) =>
    buildVltDayRows({
      shifts: opts.statuses.map((status, i) => shift({ at: `2026-11-15T0${6 + i * 3}:00:00Z`, status, vlts_cash_in: 100 * (i + 1) })),
      reports: opts.report === undefined ? [] : [{ store_id: 'lamia', report_date: '2026-11-15', amount: opts.report }],
    })[0];

  it('υποβλημένες και εγκεκριμένες βάρδιες είναι τελικές', () => {
    expect([...FINAL_SHIFT_STATUSES].sort()).toEqual(['APPROVED', 'SUBMITTED']);
    expect(day({ statuses: ['APPROVED', 'SUBMITTED'], report: 200 }).shiftsFinal).toBe(true);
  });

  it.each(['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'])(
    'όσο μια βάρδια είναι %s, το σύνολο δεν είναι τελικό και δεν ειδοποιεί',
    (open) => {
      const r = day({ statuses: ['APPROVED', open], report: 5 });   // το report διαφέρει πολύ - και όμως
      expect(r.shiftsFinal).toBe(false);
      expect(r.status).toBe('SHIFTS_OPEN');
      expect(vltMismatches([r])).toEqual([]);
    }
  );

  it('χωρίς report δεν υπάρχει τίποτα να συγκριθεί: αναμονή, όχι ειδοποίηση', () => {
    const r = day({ statuses: ['APPROVED', 'APPROVED'] });
    expect(r.status).toBe('AWAITING_REPORT');
    expect(r.difference).toBeNull();
    expect(vltMismatches([r])).toEqual([]);
  });

  it('ίδια νούμερα: ταιριάζει', () => {
    const r = day({ statuses: ['APPROVED', 'APPROVED'], report: 200 });
    expect(r.status).toBe('MATCH');
    expect(r.difference).toBe(0);
  });

  it('διαφορετικά: διαφορά με πρόσημο report − βάρδιες, και ειδοποίηση', () => {
    const more = day({ statuses: ['APPROVED', 'APPROVED'], report: 235.5 });
    expect(more.status).toBe('DIFFERENT');
    expect(more.difference).toBe(35.5);                 // το portal λέει περισσότερα
    const less = day({ statuses: ['APPROVED', 'APPROVED'], report: 180 });
    expect(less.difference).toBe(-20);                  // το portal λέει λιγότερα
    expect(vltMismatches([more, less])).toHaveLength(2);
  });

  it('ένα σεντ διαφορά ειδοποιεί· τα δεκαδικά του υπολογιστή δεν δημιουργούν ψεύτικη διαφορά', () => {
    expect(compareVltDay({ shiftsAmount: 100, shiftsFinal: true, report: 100.01 }).status).toBe('DIFFERENT');
    expect(compareVltDay({ shiftsAmount: 0.1 + 0.2, shiftsFinal: true, report: 0.3 }).status).toBe('MATCH');
    expect(compareVltDay({ shiftsAmount: 1563.5, shiftsFinal: true, report: 1563.5 }).status).toBe('MATCH');
  });

  it('η διαφορά φαίνεται και όταν η βάρδια είναι ακόμα ανοιχτή, χωρίς να ειδοποιεί', () => {
    expect(compareVltDay({ shiftsAmount: 100, shiftsFinal: false, report: 130 })).toEqual({ status: 'SHIFTS_OPEN', difference: 30 });
  });
});

describe('ποιες γραμμές εμφανίζονται', () => {
  it('κατάστημα χωρίς καμία κίνηση VLT δεν γεμίζει τον πίνακα με μηδενικά', () => {
    const rows = buildVltDayRows({
      shifts: [shift({ at: EVENING, store_id: 'cafe-only', vlts_cash_in: 0, vlts_cash_out: 0 }), shift({ at: EVENING, store_id: 'lamia', vlts_cash_in: 50 })],
      reports: [],
    });
    expect(rows.map((r) => r.storeId)).toEqual(['lamia']);
  });

  it('κατάστημα με μόνο ροή VLT (εκροή) εμφανίζεται', () => {
    const rows = buildVltDayRows({ shifts: [shift({ at: EVENING, vlts_cash_in: 0, vlts_cash_out: -300 })], reports: [] });
    expect(rows).toHaveLength(1);
  });

  it('report για ημέρα ΧΩΡΙΣ βάρδιες δεν κρύβεται: το portal λέει ότι μπήκαν χρήματα, οι βάρδιες μηδέν', () => {
    const rows = buildVltDayRows({ shifts: [], reports: [{ store_id: 'lamia', report_date: '2026-11-12', amount: 900 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ shiftCount: 0, shiftsAmount: 0, report: 900, status: 'DIFFERENT', difference: 900 });
  });

  it('report 0 για ημέρα χωρίς βάρδιες ταιριάζει', () => {
    const rows = buildVltDayRows({ shifts: [], reports: [{ store_id: 'lamia', report_date: '2026-11-12', amount: 0 }] });
    expect(rows[0].status).toBe('MATCH');
  });

  it('η πιο πρόσφατη ημέρα πρώτη', () => {
    const rows = buildVltDayRows({
      shifts: [shift({ at: '2026-11-10T14:00:00Z', vlts_cash_in: 1 }), shift({ at: '2026-11-15T14:00:00Z', vlts_cash_in: 1 }), shift({ at: '2026-11-12T14:00:00Z', vlts_cash_in: 1 })],
      reports: [],
    });
    expect(rows.map((r) => r.date)).toEqual(['2026-11-15', '2026-11-12', '2026-11-10']);
  });

  it('το report κρατά το id και τη σημείωσή του για τη διόρθωση', () => {
    const rows = buildVltDayRows({
      shifts: [shift({ at: EVENING, vlts_cash_in: 100 })],
      reports: [{ id: 'rep-1', store_id: 'lamia', report_date: '2026-11-15', amount: '100.00', note: 'portal 17/11' }],
    });
    expect(rows[0]).toMatchObject({ reportId: 'rep-1', note: 'portal 17/11', report: 100 });
  });

  it('shiftDateKey μετατοπίζει ημερομηνία κλειδί, και περνά μήνα', () => {
    expect(shiftDateKey('2026-11-15', -1)).toBe('2026-11-14');
    expect(shiftDateKey('2026-11-30', 2)).toBe('2026-12-02');
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });
});

/* ---------------------------------------------------------------- η οθόνη */

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ organization: { id: 'org' }, user: { id: 'u' }, roles: [], permissions: [] }),
}));
vi.mock('../context/TenantContext.tsx', () => ({
  useTenant: () => ({ selectedStoreId: 'ALL', stores: [{ id: 'lamia', name: 'Allwyn Store | Lamia' }, { id: 'stylida', name: 'Στυλίδα' }] }),
}));

const { VltAlertBanner, VltCheckTable } = await import('../components/shifts/VltReportCheck.tsx');

describe('ο πίνακας και η ειδοποίηση', () => {
  const rows = buildVltDayRows({
    shifts: [
      shift({ at: EVENING, vlts_cash_in: 1200 }),
      shift({ at: '2026-11-14T14:00:00Z', vlts_cash_in: 800 }),
      shift({ at: '2026-11-13T14:00:00Z', vlts_cash_in: 650 }),
      shift({ at: '2026-11-12T14:00:00Z', vlts_cash_in: 90, status: 'DRAFT_CLOSING' }),
    ],
    reports: [
      { id: 'r15', store_id: 'lamia', report_date: '2026-11-15', amount: 1250 },   // διαφέρει
      { id: 'r14', store_id: 'lamia', report_date: '2026-11-14', amount: 800 },    // ταιριάζει
      { id: 'r12', store_id: 'lamia', report_date: '2026-11-12', amount: 100 },    // βάρδια ανοιχτή
    ],                                                                                  // 13/11: χωρίς report
  });
  const name = (id: string) => (id === 'lamia' ? 'Allwyn Store | Lamia' : id);

  const table = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      <VltCheckTable rows={rows} storeName={name} showStore={false} drafts={{}} {...(over as object)} />
    );

  it('δύο στήλες: από τις βάρδιες, και δίπλα το report', () => {
    const html = table();
    const head = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
    expect(head.indexOf('Από τις βάρδιες')).toBeGreaterThan(0);
    expect(head.indexOf('Report Allwynnet')).toBeGreaterThan(head.indexOf('Από τις βάρδιες'));
    expect(html).toContain('1.200,00');       // βάρδιες 15/11
    expect(html).toContain('value="1250"');   // report 15/11, γραμμένο στο πεδίο
  });

  it('κάθε ημέρα παίρνει τη δική της κατάσταση', () => {
    const html = table();
    const statusOf = (day: string) =>
      html.match(new RegExp(`data-vlt-status="(\\w+)"[^>]*>\\s*<td[^>]*>\\s*<div[^>]*>${day}`))?.[1];
    expect(statusOf('15/11/2026')).toBe('DIFFERENT');
    expect(statusOf('14/11/2026')).toBe('MATCH');
    expect(statusOf('13/11/2026')).toBe('AWAITING_REPORT');
    expect(statusOf('12/11/2026')).toBe('SHIFTS_OPEN');
  });

  it('η ημέρα με διαφορά δείχνει το ποσό της με πρόσημο και τονίζεται', () => {
    const html = table();
    expect(html).toContain('ΔΙΑΦΟΡΑ +€50,00');
    expect(html).toContain('bg-rose-50/60');
    expect(html).toContain('ΤΑΙΡΙΑΖΕΙ');
    expect(html).toContain('ΑΝΑΜΟΝΗ REPORT');
    expect(html).toContain('ΒΑΡΔΙΑ ΣΕ ΕΞΕΛΙΞΗ');
  });

  it('στήλη καταστήματος μόνο όταν φαίνονται όλα τα καταστήματα', () => {
    expect(table({ showStore: false })).not.toContain('>Κατάστημα<');
    expect(table({ showStore: true })).toContain('>Κατάστημα<');
  });

  it('ό,τι πληκτρολογείται εκείνη τη στιγμή υπερισχύει του αποθηκευμένου', () => {
    expect(table({ drafts: { 'lamia|2026-11-15': '1300,5' } })).toContain('value="1300,5"');
  });

  it('σφάλμα γραμμής φαίνεται πάνω στη γραμμή', () => {
    expect(table({ rowErrors: { 'lamia|2026-11-13': 'Δεν αποθηκεύτηκε.' } })).toContain('Δεν αποθηκεύτηκε.');
  });

  it('η ειδοποίηση μετράει τις ημέρες, λέει τα νούμερα και υπάρχει μόνο όταν υπάρχει διαφορά', () => {
    const banner = renderToStaticMarkup(<VltAlertBanner mismatches={vltMismatches(rows)} storeName={name} />);
    expect(banner).toContain('role="alert"');
    expect(banner).toContain('Διαφορά στα μετρητά VLT σε 1 ημέρα');
    expect(banner).toContain('15/11/2026');
    expect(banner).toContain('Allwyn Store | Lamia');
    expect(banner).toContain('1.200,00');     // βάρδιες
    expect(banner).toContain('1.250,00');     // report
    expect(banner).toContain('+€50,00');
    expect(renderToStaticMarkup(<VltAlertBanner mismatches={[]} storeName={name} />)).toBe('');
  });
});

/* -------------------------------------------------------------- το καλώδιο */

describe('το όνομα που βλέπει ο χρήστης: Report Allwynnet', () => {
  const component = read('src/components/shifts/VltReportCheck.tsx');

  it('η στήλη, το πεδίο, ο τίτλος, η περιγραφή και η ειδοποίηση το λένε Report Allwynnet', () => {
    expect(component).toContain('<th className="p-3 text-right">Report Allwynnet</th>');
    expect(component).toContain('aria-label={`Report Allwynnet ${formatDay(row.date)}`}');
    expect(component).toContain("toGreekUpper('Ελεγχος VLTs: βαρδιες και Report Allwynnet')");
    expect(component).toContain('νούμερο από το Report Allwynnet.');
    expect(component).toContain('Το Report Allwynnet δεν ταιριάζει με ό,τι έγραψαν οι βάρδιες.');
  });

  it('το παλιό όνομα «portal» δεν φαίνεται πια πουθενά στην οθόνη', () => {
    const visible = component.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(visible).not.toMatch(/Report portal/i);
    expect(visible).not.toContain('report του portal');
  });

  it('το ονομάζει σωστά και η ειδοποίηση που ζωγραφίζεται', () => {
    const banner = renderToStaticMarkup(
      <VltAlertBanner
        mismatches={buildVltDayRows({ shifts: [shift({ at: EVENING, vlts_cash_in: 100 })], reports: [{ store_id: 'lamia', report_date: '2026-11-15', amount: 150 }] })}
        storeName={(id) => id}
      />
    );
    expect(banner).toContain('Report Allwynnet');
    expect(banner).not.toMatch(/portal/i);
  });
});

describe('οι Βάρδιες, η βάση και οι υπηρεσίες', () => {
  const manager = read('src/components/shifts/ShiftsManager.tsx');
  const service = read('src/services/vltReportService.ts');
  const component = read('src/components/shifts/VltReportCheck.tsx');
  const hook = read('src/components/shifts/useVltMismatchCount.ts');
  const sql = read('supabase/migrations/0086_the_vlt_report_is_one_number_per_day.sql');
  const body = sql.replace(/--.*$/gm, '');

  it('η καρτέλα είναι στις Βάρδιες, φορτώνει τεμπέλικα και την βλέπει μόνο ο διευθυντής και πάνω', () => {
    expect(manager).toContain("import('./VltReportCheck.tsx')");
    expect(manager).toContain('const canCheckVlt = isElevatedRole(roleCodes, permissions);');
    expect(manager).toMatch(/\{canCheckVlt && \(\s*<button\s+onClick=\{\(\) => setManagerTab\('VLT'\)\}/);
    expect(manager).toContain("managerTab === 'VLT' && canCheckVlt");
    expect(manager).toContain("toGreekUpper('Ελεγχος VLTs')");
  });

  it('η ένδειξη πάνω στην καρτέλα μετράει στο παρασκήνιο και ξαναμετράει όταν αλλάζει καρτέλα', () => {
    expect(manager).toContain('useVltMismatchCount(canCheckVlt, organization?.id, selectedStoreId, managerTab)');
    expect(manager).toContain('{vltMismatchCount > 0 && (');
    expect(hook).toContain('refreshKey');
    expect(hook).toContain('setCount(0)');   // δεν σπάει ποτέ την οθόνη που τη φιλοξενεί
  });

  it('ο πίνακας έχει ένα report ανά κατάστημα και ημέρα, και γράφεται ως upsert', () => {
    expect(body).toMatch(/UNIQUE \(organization_id, store_id, report_date\)/);
    expect(service).toContain("onConflict: 'organization_id,store_id,report_date'");
  });

  it('η βάση το δίνει μόνο στον διευθυντή και πάνω, και στις τέσσερις κινήσεις', () => {
    for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const at = body.indexOf(`CREATE POLICY vlt_portal_reports_${cmd.toLowerCase()}`);
      expect(at, cmd).toBeGreaterThan(0);
      expect(body.slice(at, at + 330)).toContain('auth_is_elevated()');
      expect(body.slice(at, at + 330)).toContain('belongs_to_org(organization_id)');
    }
    expect(body).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('το migration δεν αγγίζει βάρδιες, έξοδα ή άλλον πίνακα', () => {
    expect(body).not.toMatch(/ALTER TABLE (?!vlt_portal_reports)/);
    expect(body).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/);
    expect(body).not.toMatch(/\b(DELETE FROM|INSERT INTO)\b/);
    expect(body).not.toMatch(/\bshifts\b\s*(\(|SET|;)/i);
  });

  it('το σβήσιμο μετράει τις γραμμές, και τα reports που δεν φορτώνουν δεν κρύβουν τις βάρδιες', () => {
    expect(service).toContain("delete({ count: 'exact' })");
    expect(service).toContain('rowsWrittenProblem(count)');
    expect(service).toContain('reports: reportError ? [] :');
    expect(component).toContain('Δεν φορτώθηκαν τα Report Allwynnet.');
  });

  it('οι βάρδιες ζητούνται με περιθώριο ημερών, γιατί η ημέρα μιας βάρδιας είναι ημέρα Αθήνας', () => {
    expect(service).toContain('shiftDateKey(from, -1)');
    expect(service).toContain('shiftDateKey(to, 2)');
  });

  it('η ίδια η καρτέλα δείχνει την ειδοποίηση πάνω από τον πίνακα, με τις γραμμές που διαφέρουν', () => {
    const at = component.search(/<VltAlertBanner\s+mismatches=\{mismatches\}\s+storeName=\{storeName\}/);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(component.indexOf('<VltCheckTable'));
    expect(component).toContain('const mismatches = useMemo(() => vltMismatches(rows), [rows]);');
  });

  it('το report σώζεται όταν φεύγει ο χρήστης από το πεδίο, και άδειο πεδίο σβήνει το report', () => {
    expect(component).toContain('onBlur={() => onCommit?.(row)}');
    expect(component).toContain('await deleteVltReport(row.reportId);');
    expect(component).toContain('await saveVltReport({ orgId, storeId: row.storeId, date: row.date, amount: parsed.value, userId: user?.id });');
  });

  it('ό,τι διαβάζει από τις βάρδιες είναι μόνο ανάγνωση: καμία εγγραφή σε βάρδια', () => {
    expect(service).not.toMatch(/from\('shifts'\)[\s\S]{0,200}\.(update|upsert|insert|delete)\(/);
  });
});

describe('η καρτέλα λέγεται Έλεγχος VLTs, και η στήλη Report Allwynnet', () => {
  const manager = read('src/components/shifts/ShiftsManager.tsx');
  const component = read('src/components/shifts/VltReportCheck.tsx');

  it('το κουμπί της καρτέλας και ο τίτλος της οθόνης λένε Έλεγχος VLTs', () => {
    const tab = manager.slice(manager.indexOf("onClick={() => setManagerTab('VLT')}"), manager.indexOf("onClick={() => setManagerTab('VLT')}") + 700);
    expect(tab).toContain("toGreekUpper('Ελεγχος VLTs')");
    expect(component).toContain("{toGreekUpper('Ελεγχος VLTs: βαρδιες και Report Allwynnet')}");
  });

  /**
   * Ο πράκτορας: «το όνομα της κατηγορίας για τα VLT check έγινε κι αυτό Allwyn report· βάλτο
   * Έλεγχος VLTs όπως ήταν». Το «Report Allwynnet» είναι το όνομα του νούμερου που γράφει ο
   * χρήστης (η στήλη), όχι της καρτέλας.
   */
  it('η καρτέλα ΔΕΝ λέγεται Report Allwynnet - μόνο η στήλη και τα κείμενα που μιλούν για το report', () => {
    const tab = manager.slice(manager.indexOf("onClick={() => setManagerTab('VLT')}"), manager.indexOf("onClick={() => setManagerTab('VLT')}") + 700);
    expect(tab).not.toMatch(/Report Allwynnet/i);
    expect(component).toContain('<th className="p-3 text-right">Report Allwynnet</th>');
  });
});

/**
 * Η κεφαλίδα των Βαρδιών είχε όλα τα κουμπιά σε ένα ρευστό κουτί δίπλα στον
 * τίτλο και έσπαγαν όπου τύχαινε: το «Έναρξη Νέας Βαρδιάς» έπεφτε μόνο του σε
 * τρίτη γραμμή. Δύο σταθερές γραμμές: πάνω οι κύριες ενέργειες, κάτω οι καρτέλες
 * αριστερά και τα δευτερεύοντα κουμπιά δεξιά.
 */
describe('η κεφαλίδα των Βαρδιών', () => {
  const manager = read('src/components/shifts/ShiftsManager.tsx');
  const header = manager.slice(manager.indexOf('{/* Top Header Card */}'), manager.indexOf('{/* Quick KPI Strip'));
  const primaryGroup = header.slice(header.indexOf('{/* Κύριες ενέργειες'), header.indexOf('{/* Οι καρτέλες αριστερά'));
  const tabsRow = header.slice(header.indexOf('{/* Οι καρτέλες αριστερά'));

  it('η έναρξη νέας βάρδιας είναι στην ομάδα των κύριων ενεργειών, μαζί με την ανοιχτή βάρδια', () => {
    expect(primaryGroup).toContain("setShowOpeningModal(true)");
    expect(primaryGroup).toContain('openShifts.length === 1');
    expect(primaryGroup).not.toContain("setManagerTab('SHIFTS')");
  });

  it('οι καρτέλες και τα δευτερεύοντα κουμπιά είναι σε δική τους γραμμή, με τις καρτέλες αριστερά', () => {
    expect(tabsRow).toContain('justify-between');
    expect(tabsRow.indexOf("setManagerTab('SHIFTS')")).toBeGreaterThan(-1);
    expect(tabsRow.indexOf("setManagerTab('VLT')")).toBeGreaterThan(tabsRow.indexOf("setManagerTab('DISCREPANCIES')"));
    expect(tabsRow.indexOf('setShowCreditDirectoryModal(true)')).toBeGreaterThan(tabsRow.indexOf("setManagerTab('VLT')"));
    expect(tabsRow.indexOf('onClick={fetchShifts}')).toBeGreaterThan(tabsRow.indexOf('setShowCreditDirectoryModal(true)'));
    expect(tabsRow).not.toContain('setShowOpeningModal(true)');
  });

  it('κανένα κουμπί δεν χάθηκε από την κεφαλίδα', () => {
    for (const handle of ["setManagerTab('SHIFTS')", "setManagerTab('DISCREPANCIES')", "setManagerTab('VLT')", "setManagerTab('TEMPLATE')",
                          'setShowCreditDirectoryModal(true)', 'onClick={fetchShifts}', 'setShowOpeningModal(true)', 'handleOpenWizard(openShifts[0])']) {
      expect(header.split(handle).length - 1, handle).toBe(1);
    }
  });
});
