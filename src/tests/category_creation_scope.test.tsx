import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { ELEVATED_ROLES } from '../lib/authCircles.ts';
import {
  BUILTIN_EXPENSE_CATEGORIES,
  canManageExpenseCategories,
  canRecordCompanyExpense,
} from '../lib/expenseCategories.ts';

/**
 * Ποιος φτιάχνει κατηγορία εξόδων - και ποιος βλέπει το κουμπί.
 *
 * Το «+ Νέα κατηγορία» καθόταν δίπλα στην ετικέτα «Κατηγορία» χωρίς καμία
 * συνθήκη. Ο υπάλληλος το πάταγε, έγραφε όνομα, διάλεγε πλευρά, πάταγε
 * αποθήκευση - και το RLS του 0074 απαντούσε 42501 στο τέλος, αφού είχε
 * γράψει τα πάντα. Δύο πύλες φυλάνε το ίδιο πράγμα, η οθόνη και η βάση· η
 * οθόνη έλεγε ψέματα.
 *
 * Γι' αυτό δεν αρκεί να κρίνουμε τον κανόνα: το τεστ ζωγραφίζει την ΟΘΟΝΗ
 * και κοιτάζει αν το κουμπί είναι όντως εκεί ή όχι. Ένας κανόνας σωστός
 * και ασύνδετος δεν έσωσε ποτέ κανέναν από ένα κουμπί που σκάει.
 */

/* ---------------------------------------------------------------- ο κανόνας */

describe('ποιος φτιάχνει κατηγορία εξόδων', () => {
  it('ο διευθυντής και πάνω - όχι ο υπάλληλος', () => {
    expect(canManageExpenseCategories(['STORE_MANAGER'])).toBe(true);
    expect(canManageExpenseCategories(['AREA_MANAGER'])).toBe(true);
    expect(canManageExpenseCategories(['ORG_OWNER'])).toBe(true);
    expect(canManageExpenseCategories(['ORG_ADMIN'])).toBe(true);
    expect(canManageExpenseCategories(['PLATFORM_ADMIN'])).toBe(true);
    expect(canManageExpenseCategories(['EMPLOYEE'])).toBe(false);
  });

  it('άγνωστος, κενός ή ανύπαρκτος ρόλος δεν φτιάχνει', () => {
    // Ο στενότερος κύκλος είναι η μόνη ασφαλής ανάγνωση για ό,τι δεν
    // αναγνωρίζουμε - και αυτοί οι δύο ρόλοι ΥΠΑΡΧΟΥΝ σε χειρόγραφες
    // λίστες της οθόνης, χωρίς να τους δέχεται το auth_is_elevated().
    expect(canManageExpenseCategories(['SHIFT_LEADER'])).toBe(false);
    expect(canManageExpenseCategories(['ADMIN'])).toBe(false);
    expect(canManageExpenseCategories([])).toBe(false);
    expect(canManageExpenseCategories(null)).toBe(false);
    expect(canManageExpenseCategories(undefined)).toBe(false);
  });

  it('το μπαλαντέρ δικαίωμα μετράει, ένα απλό δικαίωμα όχι', () => {
    expect(canManageExpenseCategories(['EMPLOYEE'], ['*'])).toBe(true);
    expect(canManageExpenseCategories(['EMPLOYEE'], ['expense.create'])).toBe(false);
  });

  it('είναι δύο ερωτήσεις, όχι μία - απλώς σήμερα απαντάνε ίδια', () => {
    // Το ένα ρωτάει ποιος ΓΡΑΦΕΙ έξοδο εταιρίας (0082), το άλλο ποιος
    // ΦΤΙΑΧΝΕΙ κατηγορία (0074). Αν κάποτε χωρίσουν, θα χωρίσουν εδώ.
    for (const role of [...ELEVATED_ROLES, 'EMPLOYEE', 'SHIFT_LEADER']) {
      expect(canManageExpenseCategories([role]), role).toBe(canRecordCompanyExpense([role]));
    }
  });
});

/* ------------------------------------------------- η βάση λέει το ίδιο σύνολο */

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const POLICY_MIGRATION = '0074_the_owner_names_his_own_categories.sql';
const sqlOf = (file: string) => fs.readFileSync(path.join(migrationsDir, file), 'utf8');

/** Το σώμα της πολιτικής, από το migration που την ορίζει. */
function policyBody(cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'): string {
  const re = new RegExp(
    `CREATE POLICY expense_categories_${cmd.toLowerCase()}[\\s\\S]*?FOR ${cmd}([\\s\\S]*?);`,
    'i'
  );
  const m = sqlOf(POLICY_MIGRATION).match(re);
  expect(m, `λείπει η πολιτική ${cmd}`).toBeTruthy();
  return m![1];
}

describe('η οθόνη και η βάση λένε το ίδιο σύνολο', () => {
  it('καμία νεότερη πολιτική δεν έχει αλλάξει την πύλη από κάτω μας', () => {
    // Αν κάποιο επόμενο migration ξαναγράψει τις πολιτικές του πίνακα, το
    // παρακάτω τεστ θα κρίνει ένα αρχείο που δεν ισχύει πια.
    const others = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f !== POLICY_MIGRATION)
      .filter((f) => /CREATE POLICY expense_categories_/i.test(sqlOf(f)));
    expect(others).toEqual([]);
  });

  it('το γράψιμο θέλει διευθυντή, και στις τρεις πόρτες', () => {
    for (const cmd of ['INSERT', 'UPDATE', 'DELETE'] as const) {
      const body = policyBody(cmd);
      expect(body, cmd).toMatch(/auth_is_elevated\(\)/);
      expect(body, cmd).toMatch(/belongs_to_org\(organization_id\)/);
    }
  });

  it('η ανάγνωση ΔΕΝ θέλει διευθυντή', () => {
    // Ο υπάλληλος πρέπει να διαβάζει τις κατηγορίες, αλλιώς το dropdown
    // του είναι κενό και δεν καταχωρεί τίποτα. Δεν του κλείνουμε τη λίστα -
    // του κρύβουμε μόνο το κουμπί που θα σκάσει.
    const select = policyBody('SELECT');
    expect(select).toMatch(/belongs_to_org\(organization_id\)/);
    expect(select).not.toMatch(/auth_is_elevated\(\)/);
  });
});

/* ------------------------------------------------------------------- η οθόνη */

let roleCodes: string[] = ['EMPLOYEE'];

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'u_1', full_name: 'Δοκιμή' },
    organization: { id: 'org_1', name: 'Πρακτορείο' },
    hasPermission: () => false,
    roles: roleCodes.map((code) => ({ code })),
    permissions: [],
  }),
}));

vi.mock('../context/TenantContext.tsx', () => ({
  useTenant: () => ({
    selectedStoreId: 'store_1',
    stores: [{ id: 'store_1', name: 'Κατάστημα 1' }],
  }),
}));

/**
 * Η φόρμα του εξόδου ζει μέσα σε κλειστό Modal, που επιστρέφει null όσο
 * είναι κλειστό - και το renderToStaticMarkup δεν πατάει κουμπιά για να το
 * ανοίξει. Ανοίγουμε αυτόν τον ΕΝΑΝ αρμό, ώστε να ζωγραφιστεί το σώμα της
 * φόρμας: το υποκείμενο του τεστ είναι το περιεχόμενο της φόρμας, όχι το
 * αν ανοίγει το παράθυρο.
 */
vi.mock('../components/ui/Modal.tsx', () => ({
  Modal: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ModalActions: () => <div />,
}));

/** Οι υπηρεσίες δεν καλούνται σε static render· δεν θέλουμε ούτε τα imports. */
vi.mock('../services/moduleServices.ts', () => ({
  fetchExpensesFromFirestore: async () => [],
  createAndSyncShiftExpense: async () => ({}),
  deleteAndSyncShiftExpense: async () => ({}),
  updateAndSyncShiftExpense: async () => ({}),
}));
vi.mock('../services/shiftService.ts', () => ({ fetchActiveShiftFromFirestore: async () => null }));
vi.mock('../services/supplierService.ts', () => ({ fetchSuppliersFromFirestore: async () => [] }));
vi.mock('../services/pnlService.ts', () => ({
  addCompanyDailyExpense: async () => ({}),
  updateCompanyDailyExpense: async () => ({}),
  deleteCompanyDailyExpense: async () => ({}),
  fetchCompanyDailyExpenses: async () => [],
  fetchExpenseCategories: async () => BUILTIN_EXPENSE_CATEGORIES,
  createExpenseCategory: async () => BUILTIN_EXPENSE_CATEGORIES[0],
}));
/**
 * Το ConfirmDestructiveModal φτιάχνει πελάτη Supabase την ώρα του import,
 * και σε τεστ δεν υπάρχει VITE_SUPABASE_URL. Δεν αφορά το κουμπί.
 */
vi.mock('../services/reauthService.ts', () => ({
  hasSudo: () => true,
  sudoGrantedAt: () => Date.now(),
  reauthenticate: async () => ({ ok: true }),
  clearSudo: () => {},
}));
vi.mock('../services/storeTransferService.ts', () => ({
  fetchStoreTransfers: async () => [],
  createStoreTransfer: async () => ({}),
  settleStoreTransfer: async () => ({}),
}));

const { ExpensesManager } = await import('../components/modules/ExpensesManager.tsx');
const { NewExpenseCategoryModal } = await import('../components/modules/NewExpenseCategoryModal.tsx');

const screenAs = (...codes: string[]) => {
  roleCodes = codes;
  return renderToStaticMarkup(<ExpensesManager />);
};

const BUTTON = '+ Νέα κατηγορία';

describe('το κουμπί «+ Νέα κατηγορία» στη φόρμα του εξόδου', () => {
  it('ο υπάλληλος δεν το βλέπει καθόλου', () => {
    const html = screenAs('EMPLOYEE');
    expect(html).not.toContain(BUTTON);
    // Και δεν του πήραμε τη φόρμα: η ετικέτα δίπλα στην οποία καθόταν
    // είναι εκεί, άρα κρίναμε όντως τη σωστή οθόνη.
    expect(html).toContain('Κατηγορία');
  });

  it('ο διευθυντής και ο ιδιοκτήτης το βλέπουν', () => {
    expect(screenAs('STORE_MANAGER')).toContain(BUTTON);
    expect(screenAs('AREA_MANAGER')).toContain(BUTTON);
    expect(screenAs('ORG_OWNER')).toContain(BUTTON);
  });

  it('ένας ρόλος που δεν δέχεται η βάση δεν το βλέπει', () => {
    // SHIFT_LEADER και ADMIN υπάρχουν σε χειρόγραφες λίστες της οθόνης,
    // αλλά όχι στο auth_is_elevated(). Η πρόβλεψη της οθόνης ακολουθεί τη
    // βάση, όχι τις λίστες.
    expect(screenAs('SHIFT_LEADER')).not.toContain(BUTTON);
    expect(screenAs('ADMIN')).not.toContain(BUTTON);
  });

  it('ο έλεγχος είναι και στην πόρτα, όχι μόνο στο κουμπί', () => {
    /**
     * Το παράθυρο δεν κρέμεται μόνο από το κουμπί: ανοίγει από μια
     * κατάσταση, και το επόμενο σημείο που θα την ανοίξει - ένα
     * συντόμευση πληκτρολογίου, ένα deep link - δεν θα θυμάται τον
     * έλεγχο. Γι' αυτό ο έλεγχος κάθεται στο σημείο που ζωγραφίζει.
     *
     * Αυτό διαβάζει την ΠΗΓΗ, γιατί η κατάσταση ξεκινάει κλειστή και ένα
     * static render δεν πατάει κουμπιά για να την ανοίξει. Κρίνει δηλαδή
     * ότι ο έλεγχος είναι γραμμένος εκεί - όχι ότι εκτελείται· αυτό το
     * κρίνουν τα τεστ του κουμπιού παραπάνω.
     */
    const screen = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'modules', 'ExpensesManager.tsx'),
      'utf8'
    );
    const at = screen.indexOf('<NewExpenseCategoryModal');
    expect(at, 'δεν βρέθηκε το παράθυρο στην οθόνη').toBeGreaterThan(0);
    // Η συνθήκη που το φυλάει, όπως κι αν γραφτεί η σειρά των όρων.
    expect(screen.slice(Math.max(0, at - 200), at)).toContain('canManageCategories');
  });
});

describe('η πλευρά «Εταιρία» μέσα στη φόρμα της κατηγορίας', () => {
  const html = () =>
    renderToStaticMarkup(
      <NewExpenseCategoryModal orgId="org_1" existing={BUILTIN_EXPENSE_CATEGORIES} onClose={() => {}} onCreated={() => {}} />
    );

  it('προσφέρει και τις τρεις πλευρές', () => {
    // Η «Εταιρία» μένει στη φόρμα: όποιος φτάνει εδώ είναι ήδη διευθυντής
    // ή πάνω, δηλαδή ο ίδιος κύκλος που γράφει και έξοδο εταιρίας (0082).
    // Αν η πόρτα ξανανοίξει σε όλους, αυτή η επιλογή γίνεται πάλι ψέμα.
    const markup = html();
    for (const side of ['AGENCY', 'FNB', 'COMPANY']) {
      expect(markup, side).toContain(`value="${side}"`);
    }
    expect(markup).toContain('Εταιρία');
    expect(markup).toContain('Πρακτορείο');
  });

  it('η πλευρά ξεκινάει στο πρακτορείο, δηλωμένη', () => {
    // Καμία κατηγορία δεν γεννιέται «χωρίς πλευρά»: το P&L δεν έχει τρίτο
    // κουβά για να βάλει ένα έξοδο που δεν ξέρει σε ποια δουλειά ανήκει.
    expect(html()).toMatch(/checked=""\s*value="AGENCY"/);
  });
});
