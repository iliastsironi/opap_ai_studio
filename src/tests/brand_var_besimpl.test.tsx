import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BRAND, BesimplIcon, BesimplLogo, BesimplSymbol, VarWordmark } from '../components/brand/Brand.tsx';

/**
 * Η εφαρμογή λέγεται «var» και η εταιρία BeSimpl.
 *
 * Ο ιδιοκτήτης: «το όνομα της εταιρίας είναι BeSimpl αλλά της εφαρμογής var».
 * Το προηγούμενο όνομα ήταν σε κάθε οθόνη, email και σελίδα· το τεστ εγγυάται ότι
 * δεν ξαναεμφανίζεται εκεί που το βλέπει κάποιος, και ότι το νέο λογότυπο είναι
 * όντως στη θέση του.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

/** Τα αρχεία όπου το όνομα φτάνει στον χρήστη: οθόνες, email, οδηγίες, σελίδα, Copilot. */
const USER_FACING = [
  'index.html',
  'metadata.json',
  'src/components/layout/Sidebar.tsx',
  'src/components/layout/ProtectedLayout.tsx',
  'src/components/auth/LoginForm.tsx',
  'src/components/marketing/LandingPage.tsx',
  'src/components/copilot/CopilotPage.tsx',
  'src/components/admin/UsersManager.tsx',
  'src/components/admin/OrganizationSettings.tsx',
  'src/components/admin/DashboardOverview.tsx',
  'src/components/shifts/DailyShiftReportModal.tsx',
  'src/components/instructions/InstructionsPage.tsx',
  'src/data/instructionsContent.ts',
  'src/lib/emailService.ts',
  'src/lib/rbac.ts',
  'src/context/AuthContext.tsx',
  'api/_lib/copilotChatHandler.ts',
  'server.ts',
];

describe('το παλιό όνομα δεν φαίνεται πουθενά', () => {
  it.each(USER_FACING)('%s δεν γράφει το παλιό όνομα εκτός από σχόλια', (file) => {
    const code = read(file)
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toContain('ShiftLedger');
  });
});

describe('οι οθόνες λένε var, και η BeSimpl υπογράφει', () => {
  it('ο τίτλος της σελίδας και το όνομα για κοινοποίηση', () => {
    const html = read('index.html');
    expect(html).toContain('<title>var - Διαχείριση Βαρδιών, Ταμείου & Credit Score</title>');
    expect(html).toContain('og:title" content="var - ');
    expect(html).toContain('og:site_name" content="var by BeSimpl"');
    expect(JSON.parse(read('metadata.json')).name).toBe('var');
  });

  it('το πλευρικό μενού και η είσοδος δείχνουν το νέο λογότυπο, όχι το κουτάκι «SL»', () => {
    for (const file of ['src/components/layout/Sidebar.tsx', 'src/components/auth/LoginForm.tsx', 'src/components/marketing/LandingPage.tsx']) {
      const code = read(file);
      expect(code, file).toContain('<BesimplIcon');
      expect(code, file).toContain('<VarWordmark');
      expect(code, file).not.toMatch(/>\s*SL\s*</);
    }
  });

  it('η είσοδος και η αρχική σελίδα γράφουν «από την» BeSimpl', () => {
    for (const file of ['src/components/auth/LoginForm.tsx', 'src/components/marketing/LandingPage.tsx']) {
      expect(read(file), file).toContain('<span>από την</span>');
      expect(read(file), file).toContain('<BesimplLogo');
    }
  });

  it('τα email έχουν το όνομα και τα χρώματα της μάρκας, και στέλνονται ως «var»', () => {
    const mail = read('src/lib/emailService.ts');
    expect(mail).toContain('background-color: #17212F');
    expect(mail).toContain('var<span style="color: #35C9BE;">.</span>');
    expect(mail).toContain('from: `var <${senderEmail}>`');
    expect(mail).toContain('var · BeSimpl');
    expect(mail).not.toContain('#4f46e5');   // το παλιό μωβ της εφαρμογής
  });

  it('ο Copilot συστήνεται ως var', () => {
    expect(read('api/_lib/copilotChatHandler.ts')).toContain('"var AI Copilot"');
    expect(read('src/components/copilot/CopilotPage.tsx')).toContain('AI Copilot var');
  });
});

describe('τα components της μάρκας', () => {
  it('το όνομα είναι κείμενο: «var» και τιρκουάζ τελεία', () => {
    const html = renderToStaticMarkup(<VarWordmark />);
    expect(html).toContain('var<span');
    expect(html).toContain(`color:${BRAND.turquoise}`);
    expect(html).toContain('font-weight:800');
    expect(html).toContain('Nunito');
  });

  it('το εικονίδιο είναι το στρογγυλεμένο τετράγωνο της BeSimpl, ως εικόνα με όνομα', () => {
    const html = renderToStaticMarkup(<BesimplIcon size={32} />);
    expect(html).toContain('viewBox="0 0 1024 1024"');
    expect(html).toContain(`fill="${BRAND.ink}"`);
    expect(html).toContain(`stroke="${BRAND.turquoise}"`);
    expect(html).toContain('aria-label="BeSimpl"');
    expect(html).toContain('width="32"');
  });

  it('το λογότυπο γράφει «besimpl.» με τιρκουάζ τελεία, και αλλάζει χρώμα ανάλογα με το φόντο', () => {
    const light = renderToStaticMarkup(<BesimplLogo tone="light" />);
    const dark = renderToStaticMarkup(<BesimplLogo tone="dark" />);
    expect(light).toContain('besimpl<tspan');
    expect(light).toContain(`fill="${BRAND.ink}"`);       // σκούρο κείμενο σε ανοιχτό φόντο
    expect(dark).toContain('fill="#FFFFFF"');              // λευκό κείμενο σε σκούρο φόντο
    expect(dark).toContain(`fill="${BRAND.turquoise}"`);
  });

  it('το σύμβολο μόνο του παίρνει όποιο χρώμα ζητηθεί και κρύβεται από τις βοηθητικές τεχνολογίες όταν είναι διακοσμητικό', () => {
    expect(renderToStaticMarkup(<BesimplSymbol color="#FFFFFF" />)).toContain('stroke="#FFFFFF"');
    expect(renderToStaticMarkup(<BesimplSymbol />)).toContain('aria-hidden="true"');
  });

  it('τα χρώματα είναι αυτά του λογότυπου που παραδόθηκε', () => {
    expect(BRAND.ink).toBe('#17212F');
    expect(BRAND.turquoise).toBe('#35C9BE');
  });
});

describe('τα αρχεία του λογότυπου', () => {
  const brandFiles = [
    'besimpl-app-icon-ink', 'besimpl-app-icon-turquoise', 'besimpl-logo-dark', 'besimpl-logo-light',
    'besimpl-logo-mono-ink', 'besimpl-symbol-ink', 'besimpl-symbol-turquoise', 'besimpl-symbol-white', 'var-besimpl-app-icon',
  ];

  it('και τα εννέα αυτούσια αρχεία είναι στο /brand/ και είναι SVG', () => {
    for (const name of brandFiles) {
      const svg = read(`public/brand/${name}.svg`);
      expect(svg.startsWith('<svg'), name).toBe(true);
      expect(svg, name).not.toMatch(/<script|onload=|javascript:/i);
    }
  });

  it('το εικονίδιο της καρτέλας του browser είναι το εικονίδιο της εφαρμογής, με εφεδρική γραμματοσειρά', () => {
    const fav = read('public/favicon.svg');
    expect(fav).toContain('>var<tspan fill="#35C9BE">.</tspan>');
    expect(fav).toContain("'Arial Rounded MT Bold'");
    expect(read('index.html')).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });

  it('η σελίδα φορτώνει τη γραμματοσειρά Nunito που χρειάζεται το λογότυπο', () => {
    expect(read('index.html')).toContain('family=Nunito:wght@800');
  });
});

describe('η επάνω μπάρα', () => {
  it('δεν έχει πια την ένδειξη «Online • Live System»', () => {
    const bar = read('src/components/layout/Topbar.tsx');
    expect(bar).not.toContain('Live System');
    expect(bar).not.toContain('Online •');
  });

  it('το μενού του χρήστη μένει στη θέση του', () => {
    const bar = read('src/components/layout/Topbar.tsx');
    expect(bar).toContain('ref={userMenuRef}');
    expect(bar).toContain('setUserMenuOpen(!userMenuOpen)');
  });
});

/**
 * Ο ιδιοκτήτης: «διέγραψε το παλιό όνομα από παντού, άλλαξε το με το var και το
 * BeSimpl». Ό,τι φαίνεται ή τρέχει έχει αλλάξει. Μένουν ΜΟΝΟ τρεις ταυτότητες
 * λογαριασμών, γιατί είναι αποθηκευμένες στο Supabase και αλλάζοντάς τες στον
 * κώδικα δεν θα μπορούσε κανείς να συνδεθεί:
 *
 *   staff.shiftledger.local   το ψευδο-email με το οποίο συνδέονται οι υπάλληλοι
 *                             (γράφουν μόνο το όνομα χρήστη· δεν το βλέπει κανείς)
 *   @shiftledger.gr           οι τρεις demo λογαριασμοί, και η προεπιλογή EMAIL_FROM
 */
describe('τίποτα δεν έμεινε εκτός από τις ταυτότητες λογαριασμών', () => {
  const ALLOWED = [/staff\.shiftledger\.local/i, /@shiftledger\.gr/i, /shiftledger\.gr\b/i];

  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'tests' || e.name === 'node_modules' ? [] : walk(rel);
      return /\.(ts|tsx|mjs|json|html|css)$/.test(e.name) ? [rel] : [];
    });

  const files = [...walk('src'), ...walk('api'), 'server.ts', 'index.html', 'metadata.json', 'package.json', ...walk('supabase/scripts')];

  it('κανένα αρχείο κώδικα δεν έχει το παλιό όνομα έξω από αυτές τις ταυτότητες (και τα σχόλιά τους)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file === path.join('src', 'lib', 'storageMigration.ts')) continue;   // πρέπει να το ονομάζει: μεταφέρει τα παλιά κλειδιά
      read(file).split('\n').forEach((line, i) => {
        if (!/shiftledger/i.test(line)) return;
        if (/^\s*(\/\/|\*|\/\*|--)/.test(line)) return;                         // σχόλιο
        if (ALLOWED.some((re) => re.test(line.replace(/shiftledger\.local|shiftledger\.gr/gi, (m) => m)))) return;
        offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('το component της σελίδας βάρδιας δεν λέγεται πια ShiftLedgerSheet', () => {
    expect(fs.existsSync(path.join(root, 'src/components/shifts/ShiftSheet.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/components/shifts/ShiftLedgerSheet.tsx'))).toBe(false);
    expect(read('src/components/shifts/ShiftDetailsModal.tsx')).toContain("from './ShiftSheet.tsx'");
  });

  it('η σελίδα login δεν τυπώνει πια τις διευθύνσεις των demo, αλλά τα κουμπιά δουλεύουν με τις ίδιες', () => {
    const login = read('src/components/auth/LoginForm.tsx');
    const shown = login.split('\n').filter((l) => /^\s*(OWNER|MANAGER|EMPLOYEE)\s*$/.test(l));
    expect(shown).toHaveLength(3);
    expect(login).toContain("handleDemoLogin('owner@shiftledger.gr')");   // η ταυτότητα του λογαριασμού μένει
    expect(login).not.toMatch(/font-mono">\s*\n\s*\w+@shiftledger\.gr/);
  });

  it('η απόδειξη που τυπώνεται δεν γράφει το παλιό όνομα', () => {
    const receipt = read('src/components/shifts/ShiftReceiptPrintView.tsx');
    expect(receipt).toContain('*** VAR • BESIMPL •');
    expect(receipt).not.toMatch(/SHIFTLEDGER/i);
  });

  it('τα κλειδιά του browser είναι var_ και όχι shiftledger_', () => {
    for (const f of [
      'src/components/national-lottery/NationalLotteryManager.tsx', 'src/components/shifts/ShiftsManager.tsx',
      'src/components/shifts/ShiftClosingWizard.tsx', 'src/components/shifts/ScratchCalculatorTable.tsx',
      'src/lib/lazyWithRetry.ts', 'src/services/notificationService.ts',
    ]) {
      const code = read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      expect(code, f).not.toMatch(/shiftledger[_:]/i);
    }
    expect(read('src/lib/lazyWithRetry.ts')).toContain("'var_chunk_reload'");
    expect(read('src/components/shifts/ScratchCalculatorTable.tsx')).toContain("'var_scratch_catalog_v2'");
  });
});

describe('η μεταφορά των κλειδιών του browser', () => {
  const makeStorage = (initial: Record<string, string>) => {
    const data = new Map(Object.entries(initial));
    return {
      get length() { return data.size; },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
      dump: () => Object.fromEntries(data),
    };
  };

  it('αντιγράφει όσα έχουν το παλιό πρόθεμα στο νέο, και σβήνει τα παλιά', async () => {
    const { migrateStoragePrefix } = await import('../lib/storageMigration.ts');
    const s = makeStorage({
      shiftledger_shared_pos_count_store1: '3',
      shiftledger_shifts_view_mode: 'CARDS',
      shiftledger_scratch_inv_abc: '{"x":1}',
      shift_draft_123: 'draft',            // δεν ξεκινά με το παλιό πρόθεμα: δεν το αγγίζει
      unrelated: 'keep',
    });
    expect(migrateStoragePrefix(s)).toBe(3);
    expect(s.dump()).toEqual({
      var_shared_pos_count_store1: '3',
      var_shifts_view_mode: 'CARDS',
      var_scratch_inv_abc: '{"x":1}',
      shift_draft_123: 'draft',
      unrelated: 'keep',
    });
  });

  it('δεν γράφει πάνω σε τιμή που υπάρχει ήδη με το νέο όνομα', async () => {
    const { migrateStoragePrefix } = await import('../lib/storageMigration.ts');
    const s = makeStorage({ shiftledger_shifts_view_mode: 'CARDS', var_shifts_view_mode: 'TABLE' });
    expect(migrateStoragePrefix(s)).toBe(0);
    expect(s.dump()).toEqual({ var_shifts_view_mode: 'TABLE' });     // κρατά ό,τι έχει επιλέξει ήδη στη νέα έκδοση
  });

  it('δεύτερο τρέξιμο: δεν υπάρχει τίποτα να μεταφερθεί', async () => {
    const { migrateStoragePrefix } = await import('../lib/storageMigration.ts');
    const s = makeStorage({ shiftledger_a: '1' });
    expect(migrateStoragePrefix(s)).toBe(1);
    expect(migrateStoragePrefix(s)).toBe(0);
    expect(s.dump()).toEqual({ var_a: '1' });
  });

  it('δεν σπάει με αποκλεισμένο ή ανύπαρκτο storage', async () => {
    const { migrateStoragePrefix } = await import('../lib/storageMigration.ts');
    expect(migrateStoragePrefix(null)).toBe(0);
    expect(migrateStoragePrefix(undefined)).toBe(0);
    const blocked = { get length(): number { throw new Error('SecurityError'); }, key: () => null, getItem: () => null, setItem: () => {}, removeItem: () => {} };
    expect(migrateStoragePrefix(blocked as never)).toBe(0);
  });

  it('τρέχει πριν ζωγραφιστεί η εφαρμογή', () => {
    const main = read('src/main.tsx');
    expect(main).toContain('migrateBrowserStorage();');
    expect(main.indexOf('migrateBrowserStorage();')).toBeLessThan(main.indexOf('createRoot('));
  });
});
