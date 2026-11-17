import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_SAFE_BUNDLE_SIZES,
  SAFE_DENOMINATIONS,
  bundleValue,
  buildSafeCount,
  normalizeBundleSizes,
  normalizeBundles,
  readSafeCount,
  safeBundleCount,
  safePieceCount,
  safeTotal,
} from '../lib/safeBundles.ts';
import { mergesVltAndExpenses, visibleSteps } from '../lib/closingSteps.ts';
import { CashDenominationCounter } from '../components/shifts/CashDenominationCounter.tsx';
import { SafeCountSummary } from '../components/shifts/SafeCountSummary.tsx';
import { calculateCountedCash } from '../services/financialCalculator.ts';

/**
 * Τρία πράγματα από τον ιδιοκτήτη:
 *  1. στο ταμείο του PLAY, τα VLTs και τα έξοδα είναι μία οθόνη·
 *  2. η καταμέτρηση έχει τρίτη στήλη, το χρηματοκιβώτιο, σε δεσμίδες (5/10/20 € ανά 50,
 *     50 € ανά 20, τα υπόλοιπα ανά 10) - ρυθμιζόμενο από τον admin, και ΞΕΧΩΡΙΣΤΑ από την απόκλιση·
 *  3. τα «Μετρητά στα VLTs» (το κουτί με τα ILink) φεύγουν εντελώς.
 */
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf-8');

describe('το χρηματοκιβώτιο σε δεσμίδες: οι προεπιλογές', () => {
  it('5, 10, 20 € ανά 50 · 50 € ανά 20 · τα υπόλοιπα ανά 10', () => {
    expect(DEFAULT_SAFE_BUNDLE_SIZES).toEqual({ '5': 50, '10': 50, '20': 50, '50': 20, '100': 10, '200': 10, '500': 10 });
  });

  it('μετριούνται τα χαρτονομίσματα από 5 € και πάνω, από το μικρότερο', () => {
    expect(SAFE_DENOMINATIONS.map((d) => d.value)).toEqual([5, 10, 20, 50, 100, 200, 500]);
  });

  it('η αξία μιας δεσμίδας', () => {
    expect(bundleValue('5', DEFAULT_SAFE_BUNDLE_SIZES)).toBe(250);
    expect(bundleValue('10', DEFAULT_SAFE_BUNDLE_SIZES)).toBe(500);
    expect(bundleValue('20', DEFAULT_SAFE_BUNDLE_SIZES)).toBe(1000);
    expect(bundleValue('50', DEFAULT_SAFE_BUNDLE_SIZES)).toBe(1000);
    expect(bundleValue('100', DEFAULT_SAFE_BUNDLE_SIZES)).toBe(1000);
    expect(bundleValue('200', DEFAULT_SAFE_BUNDLE_SIZES)).toBe(2000);
    expect(bundleValue('500', DEFAULT_SAFE_BUNDLE_SIZES)).toBe(5000);
  });

  it('μια άγνωστη αξία δεν έχει αξία δεσμίδας', () => {
    expect(bundleValue('2', DEFAULT_SAFE_BUNDLE_SIZES)).toBe(0);
  });
});

describe('το σύνολο του χρηματοκιβωτίου', () => {
  it('δεσμίδες × τεμάχια × αξία, για κάθε αξία', () => {
    // 2 δεσμίδες των 20 € (2×50×20 = 2000) + 1 των 50 € (20×50 = 1000) + 3 των 100 € (3×10×100 = 3000)
    expect(safeTotal({ '20': 2, '50': 1, '100': 3 }, DEFAULT_SAFE_BUNDLE_SIZES)).toBe(6000);
  });

  it('άδειο χρηματοκιβώτιο: μηδέν', () => {
    expect(safeTotal({}, DEFAULT_SAFE_BUNDLE_SIZES)).toBe(0);
    expect(safeTotal(null, null)).toBe(0);
  });

  it('με τα μεγέθη του admin, όχι με τα προεπιλεγμένα', () => {
    // ο admin όρισε δεσμίδα 25 τεμαχίων για τα 10 €
    expect(safeTotal({ '10': 2 }, { ...DEFAULT_SAFE_BUNDLE_SIZES, '10': 25 })).toBe(500);
    expect(safeTotal({ '10': 2 }, DEFAULT_SAFE_BUNDLE_SIZES)).toBe(1000);
  });

  it('δεσμίδες και χαρτονομίσματα συνολικά', () => {
    const b = { '5': 1, '50': 2 };
    expect(safeBundleCount(b)).toBe(3);
    expect(safePieceCount(b, DEFAULT_SAFE_BUNDLE_SIZES)).toBe(50 + 40);
  });

  it('τα πλήθη καθαρίζονται: αρνητικά, κλάσματα, κείμενο, ό,τι δεν είναι αξία', () => {
    expect(normalizeBundles({ '5': -3, '10': 2.9, '20': 'abc', '50': '4', '7': 9 })).toEqual({
      '5': 0, '10': 2, '20': 0, '50': 4, '100': 0, '200': 0, '500': 0,
    });
  });
});

describe('τα μεγέθη δεσμίδας του admin', () => {
  it('ό,τι λείπει παίρνει την προεπιλογή', () => {
    expect(normalizeBundleSizes({ '5': 100 })).toEqual({ ...DEFAULT_SAFE_BUNDLE_SIZES, '5': 100 });
    expect(normalizeBundleSizes(null)).toEqual(DEFAULT_SAFE_BUNDLE_SIZES);
    expect(normalizeBundleSizes('ουπς')).toEqual(DEFAULT_SAFE_BUNDLE_SIZES);
  });

  it('ποτέ μηδέν: μηδέν τεμάχια ανά δεσμίδα θα μηδένιζε σιωπηλά ό,τι μετρήθηκε', () => {
    const sizes = normalizeBundleSizes({ '5': 0, '10': -1, '20': 'x', '50': 5000 });
    expect(sizes['5']).toBe(50);
    expect(sizes['10']).toBe(50);
    expect(sizes['20']).toBe(50);
    expect(sizes['50']).toBe(20);
    expect(safeTotal({ '5': 1 }, { '5': 0 })).toBe(250);
  });

  it('δέχεται τιμές ως κείμενο, όπως έρχονται από JSON', () => {
    expect(normalizeBundleSizes({ '100': '12' })['100']).toBe(12);
  });
});

describe('αυτό που γράφεται πάνω στη βάρδια', () => {
  it('δεσμίδες, τα μεγέθη της στιγμής και το σύνολο', () => {
    const c = buildSafeCount({ '50': 1 }, DEFAULT_SAFE_BUNDLE_SIZES)!;
    expect(c).toEqual({
      bundles: { '5': 0, '10': 0, '20': 0, '50': 1, '100': 0, '200': 0, '500': 0 },
      sizes: DEFAULT_SAFE_BUNDLE_SIZES,
      total: 1000,
    });
  });

  it('μια άδεια καταμέτρηση δεν αφήνει ίχνος', () => {
    expect(buildSafeCount({}, DEFAULT_SAFE_BUNDLE_SIZES)).toBeNull();
    expect(buildSafeCount({ '5': 0 }, DEFAULT_SAFE_BUNDLE_SIZES)).toBeNull();
  });

  it('διαβάζεται πίσω από τη βάρδια, με τα μεγέθη που είχε τότε', () => {
    const written = buildSafeCount({ '20': 2 }, { ...DEFAULT_SAFE_BUNDLE_SIZES, '20': 40 });
    const back = readSafeCount({ safe_count: written, other: 1 })!;
    expect(back.sizes['20']).toBe(40);
    expect(back.total).toBe(2 * 40 * 20);
  });

  it('μια αλλαγή ρύθμισης αύριο δεν αλλάζει τι μετρήθηκε σήμερα', () => {
    const written = buildSafeCount({ '20': 2 }, DEFAULT_SAFE_BUNDLE_SIZES)!;
    // ο admin αλλάζει τη δεσμίδα των 20 € σε 100 τεμάχια
    const tomorrowsSizes = { ...DEFAULT_SAFE_BUNDLE_SIZES, '20': 100 };
    expect(readSafeCount({ safe_count: written })!.total).toBe(2000);
    expect(safeTotal(written.bundles, tomorrowsSizes)).toBe(4000);
  });

  it('μια βάρδια χωρίς καταμέτρηση ή με χαλασμένα δεδομένα δίνει null, όχι σφάλμα', () => {
    expect(readSafeCount(null)).toBeNull();
    expect(readSafeCount({})).toBeNull();
    expect(readSafeCount({ safe_count: 'ουπς' })).toBeNull();
    expect(readSafeCount({ safe_count: { bundles: null, sizes: null } })).toBeNull();
  });
});

describe('η στήλη στον καταμετρητή', () => {
  const noop = () => {};
  const draw = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      React.createElement(CashDenominationCounter as never, { denominations: {}, onChange: noop, ...props } as never)
    );

  it('χωρίς ρύθμιση: δύο στήλες, όπως πάντα', () => {
    const html = draw({});
    expect(html).toContain('lg:grid-cols-2');
    expect(html).not.toContain('(δεσμίδες)');
  });

  it('με το χρηματοκιβώτιο: τρεις στήλες', () => {
    const html = draw({ safe: { bundles: {}, sizes: DEFAULT_SAFE_BUNDLE_SIZES, onChange: noop } });
    expect(html).toContain('lg:grid-cols-3');
    expect(html).toContain('Κέρματα');
    expect(html).toContain('Χαρτονομίσματα');
    expect(html).toContain('(δεσμίδες)');
  });

  it('κάθε χαρτονόμισμα έχει γραμμή με το τι είναι μία δεσμίδα', () => {
    const html = draw({ safe: { bundles: {}, sizes: DEFAULT_SAFE_BUNDLE_SIZES, onChange: noop } });
    expect(html).toContain('δεσμίδα 50 τμχ');
    expect(html).toContain('δεσμίδα 20 τμχ');
    expect(html).toContain('δεσμίδα 10 τμχ');
    for (const d of SAFE_DENOMINATIONS) expect(html).toContain(`Δεσμίδες των ${d.label}`);
  });

  it('τα μεγέθη του admin φαίνονται στη γραμμή', () => {
    const html = draw({ safe: { bundles: {}, sizes: { ...DEFAULT_SAFE_BUNDLE_SIZES, '5': 100 }, onChange: noop } });
    expect(html).toContain('δεσμίδα 100 τμχ');
  });

  it('το χρηματοκιβώτιο ΔΕΝ μπαίνει στο Σύνολο Μετρητών του συρταριού', () => {
    const html = draw({
      denominations: { '20': 5 },
      safe: { bundles: { '50': 2 }, sizes: DEFAULT_SAFE_BUNDLE_SIZES, onChange: noop },
    });
    // συρτάρι: 5 × 20 € = 100 €. Χρηματοκιβώτιο: 2 × 1.000 € = 2.000 €.
    const drawer = html.split('Σύνολο Μετρητών')[1].split('</span>')[1];
    expect(drawer).toContain('100,00');
    expect(drawer).not.toContain('2.100');
    expect(html).toContain('2.000,00');
    expect(html).toContain('2 δεσμ.');
  });

  it('και το άθροισμα που κρίνεται η βάρδια (calculateCountedCash) δεν ξέρει τίποτα για το χρηματοκιβώτιο', () => {
    expect(calculateCountedCash({ '20': 5 })).toBe(100);
    expect(calculateCountedCash({ '20': 5, safe_count: 99999 } as never)).toBe(100);
  });

  it('το μηδενισμός του συρταριού δεν αγγίζει το χρηματοκιβώτιο', () => {
    const html = draw({ safe: { bundles: {}, sizes: DEFAULT_SAFE_BUNDLE_SIZES, onChange: noop } });
    expect(html).toContain('όχι του χρηματοκιβωτίου');
  });
});

describe('η σύνοψη του χρηματοκιβωτίου', () => {
  it('δεν ζωγραφίζεται όταν δεν μετρήθηκε τίποτα', () => {
    expect(renderToStaticMarkup(React.createElement(SafeCountSummary, { count: null }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(SafeCountSummary, { count: buildSafeCount({}, null) }))).toBe('');
  });

  it('γράφει δεσμίδες × τεμάχια και το σύνολο, και ότι είναι εκτός ισοζυγίου', () => {
    const html = renderToStaticMarkup(
      React.createElement(SafeCountSummary, { count: buildSafeCount({ '20': 2, '100': 1 }, DEFAULT_SAFE_BUNDLE_SIZES) })
    );
    expect(html).toContain('εκτός ισοζυγίου');
    expect(html).toContain('20 €: 2 × 50 τμχ');
    expect(html).toContain('100 €: 1 × 10 τμχ');
    expect(html).toContain('3.000,00');
    expect(html).not.toContain('5 €:');
  });
});

describe('PLAY: τα VLTs και τα έξοδα είναι μία οθόνη', () => {
  const steps = [
    { num: 1, name: 'Έναρξη', icon: null },
    { num: 2, name: 'VLTs', icon: null },
    { num: 3, name: 'Έξοδα', icon: null },
    { num: 4, name: 'Καταμέτρηση', icon: null },
    { num: 5, name: 'Επιβεβαίωση', icon: null },
  ];

  it('μόνο το κατάστημα PLAY τα ενώνει', () => {
    expect(mergesVltAndExpenses('PLAY_STORE')).toBe(true);
    for (const t of ['OPAP_AGENCY', 'OPAP_FNB', 'GAMING_HALL', 'RETAIL', undefined, null, '']) {
      expect(mergesVltAndExpenses(t as never), String(t)).toBe(false);
    }
  });

  it('ενωμένα: τέσσερα βήματα, χωρίς το 3, αριθμημένα 1-4', () => {
    const v = visibleSteps(steps, true);
    expect(v.map((s) => s.num)).toEqual([1, 2, 4, 5]);
    expect(v.map((s) => s.shown)).toEqual([1, 2, 3, 4]);
  });

  it('αλλιώς πέντε βήματα, όπως πάντα', () => {
    const v = visibleSteps(steps, false);
    expect(v.map((s) => s.num)).toEqual([1, 2, 3, 4, 5]);
    expect(v.map((s) => s.shown)).toEqual([1, 2, 3, 4, 5]);
  });

  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');

  it('το «Επόμενο» από τα VLTs & Έξοδα πηδάει στην Καταμέτρηση, το «Προηγούμενο» γυρίζει', () => {
    expect(wizard).toMatch(/mergeVltAndExpenses && requested === 3 \? \(currentStep < 3 \? 4 : 2\) : requested/);
  });

  it('τα έξοδα ζωγραφίζονται κάτω από τα VLTs στο ίδιο βήμα', () => {
    expect(wizard).toMatch(/\(currentStep === 3 \|\| \(mergeVltAndExpenses && currentStep === 2\)\)/);
  });

  it('το βήμα λέγεται «VLTs & Έξοδα» και οι αριθμοί των επόμενων βημάτων μετράνε ό,τι φαίνεται', () => {
    expect(wizard).toContain("mergeVltAndExpenses ? 'VLTs & Έξοδα' : 'ΟΠΑΠ & VLTs'");
    expect(wizard).toMatch(/\{stepBadge\(4\)\}/);
    expect(wizard).toMatch(/\{stepBadge\(5\)\}/);
    expect(wizard).toMatch(/steps\.length === 4 \? 'grid-cols-4' : 'grid-cols-5'/);
  });

  it('το κατάστημα βρίσκεται από τον τύπο του, όχι από το όνομα', () => {
    expect(wizard).toMatch(/tenantStores\.find\(\(st\) => st\.id === shift\.store_id\)\?\.store_type/);
  });
});

describe('το χρηματοκιβώτιο στο κλείσιμο και στη Διαμόρφωση', () => {
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');
  const config = read('src/components/shifts/ShiftTemplateConfigurator.tsx');

  it('ο καταμετρητής παίρνει τη στήλη μόνο όταν το κατάστημα την έχει ανοιχτή', () => {
    expect(wizard).toMatch(/safe=\{\s*safeCountEnabled\s*\?\s*\{ bundles: safeBundles, sizes: safeBundleSizes, onChange: setSafeBundles \}\s*:\s*undefined\s*\}/);
  });

  it('γράφεται στο custom_field_values.safe_count, μόνο όταν η στήλη είναι ανοιχτή', () => {
    expect(wizard).toMatch(/\.\.\.\(safeCountEnabled \? \{ safe_count: safeCount \} : \{\}\)/);
  });

  it('ΔΕΝ μπαίνει στο συρτάρι ούτε στην απόκλιση', () => {
    expect(wizard).toMatch(/drawerCash: calculateCountedCash\(denominations\)/);
    expect(wizard).not.toMatch(/calculateCountedCash\([^)]*safe/i);
    expect(wizard).not.toMatch(/countedCash\s*=[^;\n]*safeCount/);
  });

  it('μια βάρδια που έχει ήδη καταμέτρηση κρατάει τα μεγέθη δεσμίδας της στιγμής εκείνης', () => {
    expect(wizard).toMatch(/if \(!storedSafeSizesRef\.current\)/);
  });

  it('η επιβεβαίωση δείχνει το χρηματοκιβώτιο σε δικό του κουτί', () => {
    expect(wizard).toMatch(/<SafeCountSummary count=\{safeCount\} \/>/);
  });

  it('η Διαμόρφωση έχει διακόπτη και μεγέθη δεσμίδας ανά χαρτονόμισμα, για τον admin', () => {
    expect(config).toMatch(/Χρηματοκιβώτιο στην καταμέτρηση \(δεσμίδες\)/);
    expect(config).toMatch(/Μέγεθος δεσμίδας ανά χαρτονόμισμα/);
    expect(config).toMatch(/SAFE_DENOMINATIONS\.map\(\(d\) =>/);
    expect(config).toMatch(/disabled=\{!canManageScratchMode\}\s*\n\s*value=\{size\}/);
  });

  it('ένα μέγεθος εκτός ορίων δεν αποθηκεύεται', () => {
    expect(config).toMatch(/if \(!Number\.isFinite\(n\) \|\| n < 1 \|\| n > MAX_BUNDLE_SIZE\) return;/);
  });

  it('η μετανάστευση προσθέτει τις δύο στήλες με τις ίδιες προεπιλογές', () => {
    const sql = read('supabase/migrations/0087_the_safe_is_counted_in_bundles.sql');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS safe_count_enabled BOOLEAN NOT NULL DEFAULT TRUE/);
    const json = sql.match(/DEFAULT '(\{[^']+\})'::jsonb/)![1];
    expect(JSON.parse(json)).toEqual(DEFAULT_SAFE_BUNDLE_SIZES);
  });
});

describe('τα «Μετρητά στα VLTs» (τα ILink) έφυγαν εντελώς', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const sources = walk(path.resolve(__dirname, '..')).filter((f) => !f.includes(`${path.sep}tests${path.sep}`));

  it('δεν υπάρχει πια ούτε κώδικας ούτε κείμενο για τα μηχανήματα ILink', () => {
    const hits = sources.filter((f) => /vlt_machine|vltMachine|machineReadings|ILink #|Προσθήκη μηχανήματος/.test(fs.readFileSync(f, 'utf-8')));
    expect(hits.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it('το αρχείο της λογικής δεν υπάρχει', () => {
    expect(fs.existsSync(path.resolve(__dirname, '..', 'lib', 'vltMachineCash.ts'))).toBe(false);
  });

  it('ΜΕΝΕΙ το πεδίο «Μετρητά στα VLTs (€)» των μηχανών: το χρησιμοποιεί ο Έλεγχος VLTs', () => {
    const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');
    expect(wizard).toContain('Μετρητά στα VLTs (€)');
    expect(wizard).toMatch(/vlts_cash_in: safeNum\(vltsIn\)/);
  });
});
