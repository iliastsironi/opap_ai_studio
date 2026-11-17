import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPAP_SHIFT_TEMPLATE } from '../services/shiftTemplateService.ts';
import { overridesFor, PLAY_TEMPLATE_OVERRIDES } from '../lib/storeTypeDefaults.ts';

/**
 * «Η αλλαγή που κάναμε νωρίτερα για το χρηματοκιβώτιο στα Play έγινε και στο OPAP
 * store· αυτό είναι λάθος, επανέφερέ το όπως ήταν. Μιλάμε πάντα για το Play και το
 * ταμείο του.»
 *
 * Η τρίτη στήλη της καταμέτρησης (χρηματοκιβώτιο σε δεσμίδες) ήταν ανοιχτή εξ ορισμού
 * παντού: στη βάση (0087, DEFAULT TRUE), στο πρότυπο του κώδικα, και στις οθόνες, που
 * διάβαζαν «ανοιχτό εκτός αν είναι ρητά κλειστό». Τα πρακτορεία είχαν τρίτη στήλη.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** Το πρότυπο που παίρνει ένα νέο κατάστημα, με τον τύπο του, όπως το φτιάχνει το service. */
const templateFor = (storeType: string) => ({ ...DEFAULT_OPAP_SHIFT_TEMPLATE, ...overridesFor(storeType) });

describe('το πρότυπο ενός νέου καταστήματος', () => {
  it('το πρακτορείο ΔΕΝ γεννιέται με χρηματοκιβώτιο σε δεσμίδες', () => {
    expect(DEFAULT_OPAP_SHIFT_TEMPLATE.safe_count_enabled).toBe(false);
    expect(templateFor('OPAP_AGENCY').safe_count_enabled).toBe(false);
  });

  it('το Play γεννιέται με αυτό ανοιχτό', () => {
    expect(PLAY_TEMPLATE_OVERRIDES.safe_count_enabled).toBe(true);
    expect(templateFor('PLAY_STORE').safe_count_enabled).toBe(true);
  });

  it('οι άλλοι τύποι καταστήματος μένουν όπως το πρακτορείο (κλειστό)', () => {
    for (const type of ['OPAP_FNB', 'GAMING_HALL', 'RETAIL', undefined as unknown as string]) {
      expect(templateFor(type).safe_count_enabled, String(type)).toBe(false);
    }
  });

  it('τα μεγέθη δεσμίδας υπάρχουν και στα δύο, ώστε να μην χαλάσει το άνοιγμα του διακόπτη', () => {
    expect(templateFor('OPAP_AGENCY').safe_bundle_sizes).toBeDefined();
    expect(templateFor('PLAY_STORE').safe_bundle_sizes).toBeDefined();
  });
});

describe('οι οθόνες διαβάζουν «ανοιχτό μόνο αν είναι ρητά ανοιχτό»', () => {
  const opening = read('src/components/shifts/ShiftOpeningModal.tsx');
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');
  const configurator = read('src/components/shifts/ShiftTemplateConfigurator.tsx');

  it('η φόρμα έναρξης ξεκινά κλειστή και ανοίγει μόνο με safe_count_enabled === true', () => {
    expect(opening).toContain('const [safeCountEnabled, setSafeCountEnabled] = useState(false);');
    expect(opening).toContain('(config as any)?.safe_count_enabled === true');
    expect(opening).not.toContain('safe_count_enabled !== false');
  });

  it('η οθόνη κλεισίματος ξεκινά κλειστή και ανοίγει μόνο με safe_count_enabled === true', () => {
    expect(wizard).toContain('const [safeCountEnabled, setSafeCountEnabled] = useState(false);');
    expect(wizard).toContain('setSafeCountEnabled((config as any).safe_count_enabled === true);');
    expect(wizard).not.toContain('safe_count_enabled !== false');
  });

  it('ο διακόπτης της Διαμόρφωσης δείχνει ό,τι ισχύει στην πράξη (κλειστός όταν λείπει)', () => {
    expect(configurator).toContain('aria-checked={template.safe_count_enabled === true}');
    expect(configurator).not.toContain('safe_count_enabled !== false');
    expect(configurator).not.toContain('safe_count_enabled === false');
  });

  it('με κλειστό διακόπτη, ο μετρητής δεν παίρνει στήλη χρηματοκιβωτίου και δεν μετράνε δεσμίδες', () => {
    expect(wizard).toMatch(/safe=\{\s*safeCountEnabled\s*\?\s*\{ bundles: safeBundles[^}]*\}\s*:\s*undefined\s*\}/);
    expect(wizard).toContain('const safeCount = safeCountEnabled ? buildSafeCount(safeBundles, safeBundleSizes) : null;');
    expect(wizard).toContain('const safeBundlesCash = safeCount?.total ?? 0;');
    expect(wizard).toContain('...(safeCountEnabled ? { safe_count: safeCount } : {}),');
  });
});

describe('η βάση (0093)', () => {
  const sql = read('supabase/migrations/0093_the_safe_count_is_for_play.sql');
  const code = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

  it('η προεπιλογή γίνεται FALSE', () => {
    expect(code).toContain('ALTER COLUMN safe_count_enabled SET DEFAULT FALSE;');
  });

  it('κλείνει σε κάθε κατάστημα που δεν είναι Play, και ΜΟΝΟ εκεί', () => {
    expect(code).toMatch(/SET safe_count_enabled = FALSE\s+FROM stores s/);
    expect(code).toContain("s.store_type IS DISTINCT FROM 'PLAY_STORE'");
    // Δεν υπάρχει εντολή που να κλείνει τα Play.
    expect(code).not.toMatch(/= 'PLAY_STORE'/);
  });

  it('δεν σβήνει καμία καταμέτρηση βάρδιας', () => {
    expect(code).not.toMatch(/DELETE|DROP|custom_field_values/i);
  });
});
