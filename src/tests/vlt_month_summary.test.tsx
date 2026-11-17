import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildVltDayRows, summariseVltMonth } from '../lib/vltReportCheck.ts';

vi.mock('../context/AuthContext.tsx', () => ({ useAuth: () => ({ organization: { id: 'org' }, user: null }) }));
vi.mock('../context/TenantContext.tsx', () => ({ useTenant: () => ({ selectedStoreId: 'ALL', stores: [] }) }));
const { VltMonthSummaryStrip } = await import('../components/shifts/VltReportCheck.tsx');

/**
 * «Γράψε σύνολο μήνα γενικά και απόκλιση στον έλεγχο VLTs.»
 */
const shift = (date: string, amount: number, status = 'APPROVED') => ({
  id: `s${date}`, store_id: 'st', register_id: 'R1', opened_at: `${date}T08:00:00Z`, status, vlts_cash_in: amount, vlts_cash_out: 0,
});
const report = (date: string, amount: number, approved: number | null = null) => ({
  id: `r${date}`, store_id: 'st', report_date: date, amount,
  ...(approved === null ? {} : { approved_difference: approved, approved_by_name: 'Υπεύθυνος', approved_at: '2026-11-17T08:00:00Z' }),
});
const rows = (shifts: unknown[], reports: unknown[]) => buildVltDayRows({ shifts: shifts as never, reports: reports as never });

describe('το σύνολο του μήνα', () => {
  it('οι βάρδιες αθροίζουν όλες τις ημέρες, το report όσες έχουν report', () => {
    const s = summariseVltMonth(rows(
      [shift('2026-11-14', 225), shift('2026-11-13', 1480), shift('2026-11-15', 955)],
      [report('2026-11-14', 225), report('2026-11-13', 1480)]
    ));
    expect(s.shiftsTotal).toBe(225 + 1480 + 955);
    expect(s.reportTotal).toBe(225 + 1480);
  });

  it('ημέρες που ταιριάζουν: απόκλιση μηδέν', () => {
    const s = summariseVltMonth(rows([shift('2026-11-14', 225), shift('2026-11-13', 1480)], [report('2026-11-14', 225), report('2026-11-13', 1480)]));
    expect(s.deviation).toBe(0);
    expect(s.comparedDays).toBe(2);
    expect(s.differentDays).toBe(0);
  });

  it('η απόκλιση είναι report − βάρδιες στις ημέρες που συγκρίθηκαν: −5 και +5 κάνουν 0, −5 και −10 κάνουν −15', () => {
    const a = summariseVltMonth(rows([shift('2026-10-30', 1195), shift('2026-10-29', 1400)], [report('2026-10-30', 1190), report('2026-10-29', 1405)]));
    expect(a.deviation).toBe(0);
    expect(a.differentDays).toBe(2);
    const b = summariseVltMonth(rows([shift('2026-10-30', 1195), shift('2026-10-29', 1410)], [report('2026-10-30', 1190), report('2026-10-29', 1400)]));
    expect(b.deviation).toBe(-15);
  });

  it('μια ημέρα που περιμένει report ΔΕΝ μπαίνει στην απόκλιση: δεν είναι έλλειμμα ολόκληρου του τζίρου της', () => {
    const s = summariseVltMonth(rows([shift('2026-11-14', 225), shift('2026-11-15', 955)], [report('2026-11-14', 225)]));
    expect(s.deviation).toBe(0);
    expect(s.awaitingDays).toBe(1);
    expect(s.awaitingAmount).toBe(955);
    // και ο απλός «σύνολο report − σύνολο βαρδιών» θα έδινε το λάθος −955
    expect(s.reportTotal - s.shiftsTotal).toBe(-955);
  });

  it('μια ημέρα με βάρδια ανοιχτή δεν συγκρίνεται ούτε μετράει στην απόκλιση', () => {
    const s = summariseVltMonth(rows([shift('2026-11-14', 225, 'OPEN')], [report('2026-11-14', 100)]));
    expect(s.deviation).toBe(0);
    expect(s.openDays).toBe(1);
    expect(s.comparedDays).toBe(0);
  });

  it('οι εγκεκριμένες διαφορές μένουν μέσα στην απόκλιση και φαίνονται χωριστά', () => {
    const s = summariseVltMonth(rows(
      [shift('2026-10-30', 1195), shift('2026-10-29', 1400)],
      [report('2026-10-30', 1190, -5), report('2026-10-29', 1405)]
    ));
    expect(s.deviation).toBe(0);
    expect(s.approvedDays).toBe(1);
    expect(s.approvedDeviation).toBe(-5);
    const only = summariseVltMonth(rows([shift('2026-10-30', 1195)], [report('2026-10-30', 1190, -5)]));
    expect(only.deviation).toBe(-5);
    expect(only.approvedDeviation).toBe(-5);
  });

  it('σε λεπτά: 0,1 + 0,2 δεν δίνει απόκλιση 0,30000000000000004', () => {
    const s = summariseVltMonth(rows([shift('2026-11-01', 100.1), shift('2026-11-02', 100.2)], [report('2026-11-01', 100), report('2026-11-02', 100)]));
    expect(s.deviation).toBe(-0.3);
    expect(s.shiftsTotal).toBe(200.3);
  });

  it('κενός μήνας: όλα μηδέν', () => {
    expect(summariseVltMonth([])).toMatchObject({ shiftsTotal: 0, reportTotal: 0, deviation: 0, comparedDays: 0, awaitingDays: 0, openDays: 0 });
  });

  it('μια ημέρα μόνο με report (χωρίς βάρδιες) είναι διαφορά, και μπαίνει στην απόκλιση', () => {
    const s = summariseVltMonth(rows([], [report('2026-11-02', 300)]));
    expect(s.deviation).toBe(300);
    expect(s.comparedDays).toBe(1);
  });
});

describe('η οθόνη του συνόλου', () => {
  const draw = (rs: ReturnType<typeof rows>) =>
    renderToStaticMarkup(React.createElement(VltMonthSummaryStrip as never, { summary: summariseVltMonth(rs), monthText: 'Νοέμβριος 2026' } as never));

  it('δείχνει σύνολο βαρδιών, σύνολο report και απόκλιση', () => {
    const html = draw(rows([shift('2026-10-30', 1195), shift('2026-10-29', 1410)], [report('2026-10-30', 1190), report('2026-10-29', 1400)]));
    expect(html).toContain('Σύνολο μήνα · βάρδιες');
    expect(html).toContain('€2.605,00');
    expect(html).toContain('Σύνολο μήνα · Report Allwynnet');
    expect(html).toContain('€2.590,00');
    expect(html).toContain('Απόκλιση μήνα');
    expect(html).toContain('−€15,00');
    expect(html).toContain('2 ημέρες που συγκρίθηκαν');
  });

  it('απόκλιση μηδέν: πράσινη και γράφει €0,00', () => {
    const html = draw(rows([shift('2026-11-14', 225)], [report('2026-11-14', 225)]));
    expect(html).toContain('text-emerald-700');
    expect(html).toMatch(/data-testid="vlt-month-deviation">€0,00</);
  });

  it('χωρίς καμία ημέρα συγκρίσιμη δεν παριστάνει μηδέν: γράφει «—»', () => {
    const html = draw(rows([shift('2026-11-15', 955)], []));
    expect(html).toMatch(/data-testid="vlt-month-deviation">—</);
    expect(html).toContain('καμία ημέρα δεν συγκρίθηκε ακόμα');
    expect(html).toContain('1 περιμένουν report (€955,00)');
  });

  it('λέει πόση από την απόκλιση έχει εγκριθεί', () => {
    const html = draw(rows([shift('2026-10-30', 1195)], [report('2026-10-30', 1190, -5)]));
    expect(html).toContain('εκ των οποίων εγκεκριμένες: −€5,00 (1)');
  });

  it('η καρτέλα το ζωγραφίζει μόνο όταν υπάρχουν γραμμές', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/shifts/VltReportCheck.tsx'), 'utf-8');
    expect(src).toMatch(/rows\.length > 0 && <VltMonthSummaryStrip summary=\{monthSummary\} monthText=\{monthLabel\(month\)\} \/>/);
    expect(src).toContain('const monthSummary = useMemo(() => summariseVltMonth(rows), [rows]);');
  });
});
