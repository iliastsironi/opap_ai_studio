/**
 * Τα χρώματα της εφαρμογής βγαίνουν από το λογότυπο: μελάνι #17212F και
 * τιρκουάζ #35C9BE. Το κύριο χρώμα ήταν πάντα το `indigo` του Tailwind
 * (πάνω από 1.100 σημεία), οπότε η κλίμακά του ορίζεται από το brand σε ΕΝΑ
 * μέρος, το src/index.css, και δεν μετονομάστηκε καμία κλάση.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf-8');

const INK = '#17212f';
const TURQUOISE = '#35c9be';

const token = (name: string): string | null => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  return m ? m[1].toLowerCase() : null;
};

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
};
const sources = walk(path.join(root, 'src')).filter((f) => !f.includes(`${path.sep}tests${path.sep}`));

describe('brand colours come from the logo', () => {
  it('the primary (indigo-600) is the logo ink and the brand colour is the turquoise', () => {
    expect(token('indigo-600')).toBe(INK);
    expect(token('brand')).toBe(TURQUOISE);
    expect(token('indigo-400')).toBe(TURQUOISE);
  });

  it('defines every step of the primary scale', () => {
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      expect(token(`indigo-${step}`), `indigo-${step}`).not.toBeNull();
    }
  });

  it('the scale gets steadily darker from 50 to 950 (a hover is always one step the right way)', () => {
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
    const lum = steps.map((s) => luminance(token(`indigo-${s}`)!));
    for (let i = 1; i < lum.length; i++) expect(lum[i], `indigo-${steps[i]}`).toBeLessThan(lum[i - 1]);
  });

  it('a button reads: white text on the ink and on its hover step', () => {
    expect(contrast('#ffffff', token('indigo-600')!)).toBeGreaterThan(7);
    // bg-indigo-600 hover:bg-indigo-500 text-white is on eight buttons
    expect(contrast('#ffffff', token('indigo-500')!)).toBeGreaterThanOrEqual(4.5);
  });

  it('turquoise is never a button fill: white on it would be about 2:1', () => {
    expect(contrast('#ffffff', TURQUOISE)).toBeLessThan(3);
    const offenders = sources.filter((f) => /bg-(brand|indigo-400)\b[^"'`]*text-white/.test(fs.readFileSync(f, 'utf-8')));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it('text on the light tints (the selected rows and chips) is readable', () => {
    expect(contrast(token('indigo-600')!, token('indigo-50')!)).toBeGreaterThan(7);
    expect(contrast(token('indigo-700')!, token('indigo-100')!)).toBeGreaterThan(7);
  });

  it('the turquoise on the dark panels is readable', () => {
    expect(contrast(token('indigo-300')!, token('indigo-950')!)).toBeGreaterThan(7);
    expect(contrast(TURQUOISE, token('indigo-900')!)).toBeGreaterThan(4.5);
  });

  it('the darkest neutrals are the logo ink, so the sidebar matches the logo tile', () => {
    expect(token('slate-900')).toBe(INK);
  });

  it('the focus ring and the active border are the turquoise, not the old indigo-500', () => {
    const stray: string[] = [];
    for (const f of sources) {
      if (/\b(border|ring|outline)-indigo-500\b/.test(fs.readFileSync(f, 'utf-8'))) stray.push(path.relative(root, f));
    }
    expect(stray).toEqual([]);
    const withBrand = sources.filter((f) => /\b(focus:ring|focus:border)-brand\b/.test(fs.readFileSync(f, 'utf-8')));
    expect(withBrand.length).toBeGreaterThan(20);
  });

  it('no screen carries the old indigo hex (charts used hard-coded values)', () => {
    const old = /#(4f46e5|6366f1|4338ca|3730a3|818cf8|c7d2fe|e0e7ff|eef2ff)\b/i;
    const hits = sources.filter((f) => old.test(fs.readFileSync(f, 'utf-8'))).map((f) => path.relative(root, f));
    expect(hits).toEqual([]);
  });

  it('the revenue chart is ink and the counted-cash bar is turquoise', () => {
    const reports = fs.readFileSync(path.join(root, 'src/components/modules/ReportsManager.tsx'), 'utf-8');
    expect(reports).toMatch(/dataKey="revenue"[^>]*fill="#17212f"/i);
    expect(reports).toMatch(/dataKey="countedCash"[^>]*fill="#35c9be"/i);
  });

  it('the semantic colours are untouched: ok, careful and problem do not become brand', () => {
    for (const name of ['emerald', 'amber', 'rose']) {
      expect(css, name).not.toMatch(new RegExp(`--color-${name}-`));
    }
  });
});

/**
 * Ο κανόνας που έσπασε όταν το indigo έγινε μελάνι: ένα κουμπί γεμισμένο με το
 * μελάνι, μέσα σε σκούρο πάνελ, ΧΑΝΕΤΑΙ (μελάνι πάνω σε μελάνι - το κουμπί
 * «Σύνδεση στο Σύστημα» έμεινε μόνο με γράμματα). Στα σκούρα πάνελ το κουμπί
 * είναι τιρκουάζ με μελανί γράμματα (7,7:1), στα ανοιχτά είναι μελάνι με λευκά.
 */
describe('the screens on a dark ground carry turquoise buttons, not ink ones', () => {
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf-8');
  const DARK_SCREENS = [
    'src/components/auth/LoginForm.tsx',
    'src/components/auth/ForcePasswordChange.tsx',
    'src/components/auth/OrganizationUnavailable.tsx',
  ];

  it('ink on the turquoise reads well', () => {
    expect(contrast(INK, TURQUOISE)).toBeGreaterThan(7);
  });

  it.each(DARK_SCREENS)('%s has no ink-filled button on its dark card', (file) => {
    expect(read(file)).not.toMatch(/\bbg-indigo-(600|700)\b/);
  });

  it.each(DARK_SCREENS)('%s: every turquoise fill carries ink text, never white', (file) => {
    const src = read(file);
    expect(src).toMatch(/bg-brand[^"'`]*text-slate-900/);
    expect(src).not.toMatch(/bg-brand[^"'`]*text-white/);
  });

  it('the sign-in button, the sign-in/sign-up switch and the reset buttons are all turquoise', () => {
    const src = read('src/components/auth/LoginForm.tsx');
    expect(src.match(/bg-brand hover:bg-indigo-300 text-slate-900/g)?.length).toBeGreaterThanOrEqual(4);
    expect(src).toMatch(/!isSignUp \? 'bg-brand text-slate-900/);
    expect(src).toMatch(/isSignUp \? 'bg-brand text-slate-900/);
  });

  it('the background glows are the brand turquoise (indigo-900 is now near-black and invisible)', () => {
    const src = read('src/components/auth/LoginForm.tsx');
    expect(src).toMatch(/bg-brand\/10 rounded-full blur-3xl/);
    expect(src).not.toMatch(/bg-(indigo|blue)-900\/\d+ rounded-full blur-3xl/);
  });

  it('the shift wizard marks the active step turquoise on its dark header', () => {
    const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');
    expect(wizard).toMatch(/'bg-brand text-slate-900 font-extrabold shadow-md scale-102'/);
  });
});

describe('the landing page is the brand: ink top, turquoise accents', () => {
  const landing = fs.readFileSync(path.join(root, 'src/components/marketing/LandingPage.tsx'), 'utf-8');

  it('the header and the hero are the ink, with the wordmark in white', () => {
    expect(landing).toMatch(/<header className="sticky top-0 z-10 bg-slate-900\/95/);
    // the hero and the closing band: two ink sections, not one
    expect((landing.match(/<section className="relative overflow-hidden bg-slate-900">/g) ?? []).length).toBe(2);
    expect(landing).toMatch(/<VarWordmark className="text-2xl text-white" \/>/);
  });

  it('the headline has one turquoise word and the call to action is turquoise with ink text', () => {
    expect(landing).toMatch(/Ο ψηφιακός <span className="text-brand">συνεργάτης<\/span> για το πρακτορείο σας/);
    expect(landing).toMatch(/bg-brand hover:bg-indigo-300 text-slate-900 font-bold[^"]*"\s*>\s*<span>Δωρεάν Δοκιμή 30 Ημερών/);
  });

  it('the closing call to action is an ink band with a turquoise button', () => {
    expect(landing).toMatch(/<section className="relative overflow-hidden bg-slate-900">[\s\S]*Έτοιμοι να σταματήσετε/);
    expect(landing).toMatch(/bg-brand hover:bg-indigo-300 text-slate-900 font-bold[^"]*"\s*>\s*<span>Ξεκινήστε τη Δωρεάν Δοκιμή σας/);
  });

  it('the highlighted plan is ink with a turquoise button; the others keep ink buttons on white', () => {
    expect(landing).toMatch(/'bg-slate-900 ring-1 ring-brand\/40/);
    expect(landing).toMatch(/'bg-brand text-slate-900 font-bold hover:bg-indigo-300'/);
    expect(landing).toMatch(/'bg-slate-900 hover:bg-slate-800 text-white'/);
  });

  it('the old indigo surfaces and old name are gone', () => {
    expect(landing).not.toMatch(/bg-indigo-(100|600)\b[^"']*blur-3xl/);
    expect(landing).not.toMatch(/shiftledger|ShiftLedger/i);
  });
});

