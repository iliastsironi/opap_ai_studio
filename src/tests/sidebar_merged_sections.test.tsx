import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Το πλευρικό μενού μετά τη συγχώνευση.
 *
 * Ο ιδιοκτήτης: «συγχώνευσε το νέο κατάστημα στο καταστήματα. Χρήστες + ρόλοι
 * μαζί. Έξοδα και προμηθευτές μαζί, όλα μαζί στα οικονομικά. Πρόγραμμα βαρδιών
 * στη διαχείριση».
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const sidebar = read('src/components/layout/Sidebar.tsx');
const app = read('src/App.tsx');

/** Τα στοιχεία κάθε ενότητας του μενού με τη σειρά, από τον κώδικα. */
function sections(): Record<string, string[]> {
  const start = sidebar.indexOf('const NAV_SECTIONS');
  const end = sidebar.indexOf('export const Sidebar');
  const body = sidebar.slice(start, end);
  const out: Record<string, string[]> = {};
  for (const block of body.split(/\n  \{\n    title: /).slice(1)) {
    const title = /^'([^']+)'/.exec(block)![1];
    out[title] = [...block.matchAll(/\{ id: '([a-z_]+)'/g)].map((m) => m[1]);
  }
  return out;
}

describe('οι ενότητες του μενού', () => {
  const s = sections();

  it('Οικονομικά: έξοδα και προμηθευτές σε ένα στοιχείο, και οι αναφορές', () => {
    expect(s['Οικονομικά']).toEqual(['expenses', 'reports']);
  });

  it('τα έξοδα δεν είναι πια στα Καθημερινά', () => {
    expect(s['Καθημερινά']).not.toContain('expenses');
    expect(s['Καθημερινά']).not.toContain('roster');
  });

  it('Διαχείριση: το πρόγραμμα βαρδιών μπήκε εδώ, χρήστες και ρόλοι είναι ένα στοιχείο', () => {
    expect(s['Διαχείριση & Ασφάλεια']).toEqual(['stores', 'users', 'roster', 'audit', 'org_settings']);
  });

  it('δεν υπάρχουν πια ξεχωριστά στοιχεία για προμηθευτές, ρόλους, νέο κατάστημα', () => {
    const all = Object.values(s).flat();
    for (const gone of ['suppliers', 'roles', 'onboarding']) expect(all).not.toContain(gone);
  });

  it('κάθε στοιχείο του μενού έχει οθόνη στο App', () => {
    for (const id of Object.values(s).flat()) {
      expect(app, id).toContain(`case '${id}':`);
    }
  });
});

describe('τα δικαιώματα των δύο συγχωνευμένων στοιχείων', () => {
  it('ανοίγουν για όποιον δικαιούται ΟΠΟΙΑΔΗΠΟΤΕ από τις δύο οθόνες', () => {
    expect(sidebar).toContain("perm: ['expenses.view', 'suppliers.view']");
    expect(sidebar).toContain("perm: ['users.view', 'roles.manage']");
  });

  it('το App ζητά τα ίδια δικαιώματα με το μενού, αλλιώς το στοιχείο θα έβγαζε «Περιορισμός Πρόσβασης»', () => {
    // Παράγονται από τις ίδιες καρτέλες που δείχνει η σελίδα: ένα σημείο αλήθειας.
    expect(app).toContain("expenses: FINANCE_TABS.map((t) => t.perm!)");
    expect(app).toContain("users: PEOPLE_TABS.map((t) => t.perm!)");
    expect(app).toContain("perm: 'expenses.view'");
    expect(app).toContain("perm: 'suppliers.view'");
    expect(app).toContain("perm: 'users.view'");
    expect(app).toContain("perm: 'roles.manage'");
  });

  it('η πύλη του App δέχεται λίστα δικαιωμάτων (any-of)', () => {
    expect(app).toContain('requiredPerm.some((perm) => hasPermission(perm))');
  });
});

describe('το νέο κατάστημα μένει στα Καταστήματα', () => {
  it('ο οδηγός «Νέο Κατάστημα / Οργανισμός» δεν υπάρχει πια', () => {
    expect(fs.existsSync(path.join(root, 'src/components/onboarding/OnboardingWizard.tsx'))).toBe(false);
    expect(app).not.toContain('OnboardingWizard');
    expect(sidebar).not.toContain('Νέο Κατάστημα / Οργανισμός');
  });

  it('η σελίδα Καταστημάτων έχει το κουμπί «Νέο Κατάστημα», με το δικαίωμα δημιουργίας', () => {
    const stores = read('src/components/admin/StoresManager.tsx');
    expect(stores).toContain("hasPermission('store.manage')");
    expect(stores).toContain('<span>Νέο Κατάστημα</span>');
  });
});

// ── η μπάρα καρτελών, πραγματικά αποδομένη ───────────────────────────────────

const auth = vi.hoisted(() => ({ perms: new Set<string>() }));
vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ hasPermission: (p: string) => auth.perms.has(p) }),
}));

import { TabbedSection, visibleTabs, type SectionTab } from '../components/layout/TabbedSection.tsx';
import { Receipt, Truck } from 'lucide-react';

const A: React.FC = () => <p>ΟΘΟΝΗ-ΕΞΟΔΑ</p>;
const B: React.FC = () => <p>ΟΘΟΝΗ-ΠΡΟΜΗΘΕΥΤΕΣ</p>;
const TABS: SectionTab[] = [
  { id: 'expenses', label: 'Έξοδα & Δαπάνες', icon: Receipt, perm: 'expenses.view', Component: A },
  { id: 'suppliers', label: 'Προμηθευτές', icon: Truck, perm: 'suppliers.view', Component: B },
];

describe('TabbedSection', () => {
  const render = (perms: string[]) => {
    auth.perms = new Set(perms);
    return renderToStaticMarkup(<TabbedSection label="Έξοδα & Προμηθευτές" tabs={TABS} />);
  };

  it('με δικαίωμα και στα δύο: μπάρα με δύο καρτέλες, ανοιχτή η πρώτη', () => {
    const html = render(['expenses.view', 'suppliers.view']);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Έξοδα &amp; Δαπάνες');
    expect(html).toContain('Προμηθευτές');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('ΟΘΟΝΗ-ΕΞΟΔΑ');
    expect(html).not.toContain('ΟΘΟΝΗ-ΠΡΟΜΗΘΕΥΤΕΣ');
  });

  it('μόνο προμηθευτές: ανοίγει κατευθείαν η οθόνη τους, χωρίς μπάρα με μία καρτέλα', () => {
    const html = render(['suppliers.view']);
    expect(html).toContain('ΟΘΟΝΗ-ΠΡΟΜΗΘΕΥΤΕΣ');
    expect(html).not.toContain('ΟΘΟΝΗ-ΕΞΟΔΑ');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tabpanel"');
  });

  it('κανένα δικαίωμα: δεν βγάζει τίποτα', () => {
    expect(render([])).toBe('');
  });

  it('visibleTabs κρατά τη σειρά και φιλτράρει', () => {
    expect(visibleTabs(TABS, (p) => p === 'suppliers.view').map((t) => t.id)).toEqual(['suppliers']);
    expect(visibleTabs(TABS, () => true).map((t) => t.id)).toEqual(['expenses', 'suppliers']);
  });
});

describe('οι οδηγίες χρήσης δείχνουν τη νέα διαδρομή', () => {
  const instructions = read('src/data/instructionsContent.ts');
  it('για έξοδα, προμηθευτές, χρήστες και ρόλους', () => {
    expect(instructions).toContain('"Έξοδα & Προμηθευτές"');
    expect(instructions).toContain('"Χρήστες & Ρόλοι"');
    expect(instructions).not.toContain("'Επιλέξτε \"Προμηθευτές\" από το πλευρικό μενού.'");
    expect(instructions).not.toContain("'Μεταβείτε στους \"Ρόλους & Δικαιώματα\".'");
  });
});
