import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { debtUsage } from '../lib/debtUsage.ts';
import { CreditFigureCells } from '../components/shifts/CreditFigureCells.tsx';

/**
 * Το τεφτέρι είχε τρεις στήλες με χρώμα και μπέρδευε. Τώρα χρώμα έχει μόνο η
 * τρέχουσα οφειλή: έως 50% του ορίου πράσινο, 51-80% πορτοκαλί, 81% και πάνω κόκκινο.
 */

const tone = (debt: number, limit: number) => debtUsage(debt, limit, false).tone;

describe('το χρώμα της οφειλής ως ποσοστό του ορίου', () => {
  it('έως και 50% είναι πράσινο, ακριβώς στο 50 ανήκει στο πράσινο', () => {
    expect(tone(0, 100)).toBe('GREEN');
    expect(tone(25, 100)).toBe('GREEN');
    expect(tone(50, 100)).toBe('GREEN');
    expect(tone(150, 300)).toBe('GREEN');
  });

  it('51% έως 80% είναι πορτοκαλί, ακριβώς στο 80 ανήκει στο πορτοκαλί', () => {
    expect(tone(51, 100)).toBe('ORANGE');
    expect(tone(65, 100)).toBe('ORANGE');
    expect(tone(80, 100)).toBe('ORANGE');
    expect(tone(240, 300)).toBe('ORANGE');
  });

  it('81% και πάνω είναι κόκκινο, και το ίδιο το όριο, και πάνω από αυτό', () => {
    expect(tone(81, 100)).toBe('RED');
    expect(tone(100, 100)).toBe('RED');
    expect(tone(130, 100)).toBe('RED');
    expect(debtUsage(130, 100, false).over).toBe(true);
    expect(debtUsage(100, 100, false).over).toBe(false);
  });

  /**
   * Τα όρια των 50 και 80 κρίνονται σε ακέραιο ποσοστό όπως τα είπε ο χρήστης:
   * το 50,4% είναι «51» και είναι πορτοκαλί· το 80,4% είναι «81» και είναι κόκκινο.
   */
  it('ποσοστό με δεκαδικά πέφτει στην επόμενη ζώνη, όχι στην προηγούμενη', () => {
    expect(tone(40.4, 80)).toBe('ORANGE');          // 50,5%
    expect(debtUsage(40.4, 80, false).percent).toBe(51);
    expect(tone(40.2, 80)).toBe('ORANGE');          // 50,25% - όχι «50»
    expect(tone(40, 80)).toBe('GREEN');             // ακριβώς 50%
    expect(tone(64.4, 80)).toBe('RED');             // 80,5%
    expect(debtUsage(64.4, 80, false).percent).toBe(81);
    expect(tone(64, 80)).toBe('ORANGE');            // ακριβώς 80%
  });

  it('τα δεκαδικά των λεπτών δεν σπρώχνουν ένα ακριβές 50% στην επόμενη ζώνη', () => {
    // 0,1 + 0,2 = 0.30000000000000004: ως δεκαδικό περνά το 30% του 1 €
    expect(tone(0.1 + 0.2, 0.6)).toBe('GREEN');
    expect(debtUsage(0.1 + 0.2, 0.6, false).percent).toBe(50);
    expect(tone(33.33 + 6.67, 80)).toBe('GREEN');   // 40,00 € / 80 € = 50%
    expect(tone(0.8 * 100, 100)).toBe('ORANGE');
  });

  it('ο απεριόριστος πελάτης δεν έχει ποσοστό ούτε χρώμα', () => {
    expect(debtUsage(5000, 999999, true)).toEqual({ percent: null, tone: null, over: false });
  });

  it('όριο 0: οφειλή είναι υπέρβαση, χωρίς οφειλή δεν υπάρχει τίποτα να κοκκινίσει', () => {
    expect(debtUsage(1, 0, false)).toEqual({ percent: null, tone: 'RED', over: true });
    expect(debtUsage(0, 0, false)).toEqual({ percent: null, tone: 'GREEN', over: false });
  });

  it('πιστωτικό υπόλοιπο (αρνητική οφειλή) μετράει ως μηδέν', () => {
    expect(debtUsage(-20, 100, false)).toEqual({ percent: 0, tone: 'GREEN', over: false });
  });

  it('ό,τι δεν είναι αριθμός δεν σπάει τον πίνακα', () => {
    expect(debtUsage(undefined, 100, false).tone).toBe('GREEN');
    expect(debtUsage('abc', 100, false).tone).toBe('GREEN');
  });
});

describe('τα τρία κελιά του πίνακα', () => {
  const cells = (debt: number, limit: number, isUnlimited = false) =>
    renderToStaticMarkup(
      <table><tbody><tr><CreditFigureCells debt={debt} limit={limit} isUnlimited={isUnlimited} /></tr></tbody></table>
    );
  const tds = (html: string) => html.match(/<td[\s\S]*?<\/td>/g) ?? [];
  const COLOURS = /emerald|amber|rose|orange|purple|red-|green-|yellow/;

  it('δείχνει το όριο, την οφειλή και το υπόλοιπο ορίου, με αυτή τη σειρά', () => {
    const [limit, debt, left] = tds(cells(60, 100));
    expect(limit).toContain('100,00');
    expect(debt).toContain('60,00');
    expect(left).toContain('40,00');
  });

  it('χρώμα έχει ΜΟΝΟ η οφειλή: το όριο και το υπόλοιπο είναι ουδέτερα', () => {
    for (const [debt, lim] of [[10, 100], [60, 100], [90, 100], [150, 100]]) {
      const [limit, d, left] = tds(cells(debt, lim));
      expect(limit).not.toMatch(COLOURS);
      expect(left).not.toMatch(COLOURS);
      expect(d).toMatch(COLOURS);
    }
  });

  it('κάθε ζώνη δίνει το δικό της χρώμα στην οφειλή', () => {
    expect(tds(cells(50, 100))[1]).toContain('data-debt-tone="GREEN"');
    expect(tds(cells(50, 100))[1]).toContain('emerald');
    expect(tds(cells(51, 100))[1]).toContain('data-debt-tone="ORANGE"');
    expect(tds(cells(51, 100))[1]).toContain('orange');
    expect(tds(cells(81, 100))[1]).toContain('data-debt-tone="RED"');
    expect(tds(cells(81, 100))[1]).toContain('rose');
  });

  it('το χρώμα δεν είναι ο μόνος τρόπος: το ποσοστό είναι στο title', () => {
    expect(tds(cells(65, 100))[1]).toContain('title="65% του ορίου"');
  });

  it('πάνω από το όριο: κόκκινο με την ένδειξη «Υπέρβαση», και υπόλοιπο 0', () => {
    const [, debt, left] = tds(cells(130, 100));
    expect(debt).toContain('Υπέρβαση');
    expect(debt).toContain('rose');
    expect(left.replace(/<[^>]*>/g, '')).toBe('€0,00');   // ποτέ αρνητικό υπόλοιπο
  });

  it('απεριόριστος πελάτης: ουδέτερα και τα τρία, χωρίς «Υπέρβαση»', () => {
    const html = cells(5000, 999999, true);
    expect(html).not.toMatch(COLOURS);
    expect(html).not.toContain('Υπέρβαση');
    expect(html).toContain('data-debt-tone="NONE"');
    expect(html.match(/Απεριόριστο/g)?.length).toBe(2);   // όριο και υπόλοιπο
  });
});

describe('ο πίνακας του τεφτεριού', () => {
  const modal = fs.readFileSync(path.join(process.cwd(), 'src/components/shifts/CustomerCreditDirectoryModal.tsx'), 'utf8');

  it('γράφει τα τρία κελιά από το ένα component, όχι με δικά του χρώματα', () => {
    expect(modal).toContain('<CreditFigureCells debt={debt} limit={limit} isUnlimited={isUnlimited} />');
    expect(modal).not.toContain("'text-emerald-700'");
    expect(modal).not.toContain('available <= 0');
  });

  it('οι επικεφαλίδες λένε Όριο, Τρέχουσα Οφειλή, Υπόλοιπο Ορίου', () => {
    const head = modal.slice(modal.indexOf('<thead>'), modal.indexOf('</thead>'));
    const order = ['>Όριο<', '>Τρέχουσα Οφειλή<', '>Υπόλοιπο Ορίου<'].map((t) => head.indexOf(t));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

/**
 * Η ίδια ιδέα μέσα στη βάρδια: στη γραμμή πίστωσης του πελάτη, μόνο τα νούμερα
 * οφειλής έχουν χρώμα· το όριο και το υπόλοιπο ορίου είναι απλά.
 */
describe('η γραμμή πελάτη μέσα στη βάρδια', async () => {
  const { CreditStatusPanel } = await import('../components/shifts/CreditStatusPanel.tsx');
  const { DEFAULT_CREDIT_TIER_CONFIGS } = await import('../services/customerCreditService.ts');

  const customer = (over: Record<string, unknown> = {}) => ({
    id: 'c1', organization_id: 'o', store_id: 's', name: 'Γιώργος', tier: 'B', current_debt: 0,
    created_at: '', updated_at: '', ...over,
  }) as never;

  const panel = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      <CreditStatusPanel
        customer={customer((props.customer as Record<string, unknown>) ?? {})}
        liveDebt={(props.liveDebt as number) ?? 0}
        savedDebt={(props.savedDebt as number) ?? (props.liveDebt as number) ?? 0}
        tierConfigs={DEFAULT_CREDIT_TIER_CONFIGS}
        amount={(props.amount as number) ?? 0}
        isGranted={(props.isGranted as boolean) ?? true}
      />
    );
  /** Ό,τι μένει όταν βγουν τα χρωματισμένα νούμερα οφειλής: δεν πρέπει να έχει καθόλου χρώμα. */
  const withoutDebtFigures = (html: string) => html.replace(/<span data-debt-tone[\s\S]*?<\/span>(?:<\/span>)?/g, '');
  const COLOURS = /emerald|amber|rose|orange|purple|red-|green-|yellow/;

  it('δείχνει όριο, οφειλή και υπόλοιπο ορίου, με αυτή τη σειρά', () => {
    const html = panel({ liveDebt: 60 });
    const order = ['Όριο:', 'Τρέχουσα Οφειλή:', 'Υπόλοιπο Ορίου:'].map((t) => html.indexOf(t));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('100,00');   // όριο κατηγορίας Β
    expect(html).toContain('40,00');    // υπόλοιπο
  });

  it('η οφειλή παίρνει το χρώμα του ποσοστού, όλα τα άλλα μένουν χωρίς χρώμα', () => {
    for (const [debt, toneName] of [[40, 'GREEN'], [65, 'ORANGE'], [90, 'RED']] as const) {
      const html = panel({ liveDebt: debt });
      expect(html).toContain(`data-debt-tone="${toneName}"`);
      expect(withoutDebtFigures(html)).not.toMatch(COLOURS);
    }
  });

  /** Το σήμα Score είχε φανάρι ανά κατηγορία (A πράσινο, B κεχριμπάρι, C κόκκινο) και μπέρδευε δίπλα στην οφειλή. */
  it('το σήμα της κατηγορίας δεν έχει χρώμα φαναριού', () => {
    for (const tier of ['A', 'B', 'C', 'A+']) {
      expect(withoutDebtFigures(panel({ customer: { tier }, liveDebt: 10 }))).not.toMatch(COLOURS);
    }
  });

  it('το όριο είναι το πραγματικό όριο του πελάτη, όχι πάντα της κατηγορίας', () => {
    // Β = 100 €, αλλά ο πελάτης έχει δικό του όριο 40 €.
    const html = panel({ customer: { custom_limit: 40 }, liveDebt: 30 });
    expect(html).toContain('40,00');
    expect(html).not.toContain('100,00');
    expect(html).toContain('data-debt-tone="ORANGE"');   // 30/40 = 75%
  });

  it('με το νέο ποσό, το νέο σύνολο οφειλής έχει το χρώμα του δικού του ποσοστού', () => {
    const html = panel({ liveDebt: 40, amount: 30 });          // 40 → 70 € από 100 €
    expect(html).toContain('Νέο Σύνολο Οφειλής:');
    const total = html.slice(html.indexOf('Νέο Σύνολο Οφειλής:'));
    expect(total).toContain('data-debt-tone="ORANGE"');
    expect(total).toContain('70,00');
  });

  it('νέο σύνολο πάνω από το όριο: κόκκινο με «Υπέρβαση»', () => {
    const total = panel({ liveDebt: 80, amount: 50 });
    expect(total.slice(total.indexOf('Νέο Σύνολο Οφειλής:'))).toContain('Υπέρβαση');
  });

  it('είσπραξη: το νέο υπόλοιπο οφειλής χρωματίζεται κι αυτό ως ποσοστό του ορίου', () => {
    const html = panel({ liveDebt: 90, amount: 50, isGranted: false });   // 90 → 40 €
    const after = html.slice(html.indexOf('Νέο Υπόλοιπο μετά την Είσπραξη:'));
    expect(after).toContain('data-debt-tone="GREEN"');
    expect(after).toContain('40,00');
  });

  it('απεριόριστος πελάτης: όριο «Απεριόριστο», χωρίς υπόλοιπο και χωρίς χρώμα', () => {
    const html = panel({ customer: { tier: 'A+' }, liveDebt: 5000 });
    expect(html).toContain('Απεριόριστο');
    expect(html).not.toContain('Υπόλοιπο Ορίου:');
    expect(html).toContain('data-debt-tone="NONE"');
    expect(withoutDebtFigures(html)).not.toMatch(COLOURS);
  });

  it('εξηγεί τη διαφορά από τη βάση όταν οι γραμμές της βάρδιας την άλλαξαν', () => {
    const text = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '');
    expect(text(panel({ liveDebt: 70, savedDebt: 50 }))).toContain('στη βάση €50,00');
    expect(text(panel({ liveDebt: 50, savedDebt: 50 }))).not.toContain('στη βάση');
  });

  it('η βάρδια χρησιμοποιεί αυτό το component και όχι τα παλιά χρώματα', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/components/shifts/CustomerCreditSection.tsx'), 'utf8');
    expect(src).toContain('<CreditStatusPanel');
    expect(src).not.toContain('Διαθέσιμο Περιθώριο');
    expect(src).not.toContain("'text-emerald-700 font-black'");
  });
});

describe('ο τύπος πελάτη στο τεφτέρι', () => {
  it('το σήμα Credit Score του πίνακα είναι ουδέτερο, όχι φανάρι', () => {
    const modal = fs.readFileSync(path.join(process.cwd(), 'src/components/shifts/CustomerCreditDirectoryModal.tsx'), 'utf8');
    expect(modal).not.toContain('${tierConfig.badgeBg}');
    expect(modal).toContain('border bg-slate-100 text-slate-700 border-slate-300"');
  });
});
