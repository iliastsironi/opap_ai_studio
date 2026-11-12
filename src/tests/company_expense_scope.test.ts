import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ELEVATED_ROLES, isElevatedRole, isOwnerRole } from '../lib/authCircles.ts';
import {
  BUILTIN_EXPENSE_CATEGORIES,
  ExpenseCategoryDef,
  canRecordCompanyExpense,
  offerableCategories,
} from '../lib/expenseCategories.ts';

/**
 * Ο διευθυντής γράφει έξοδο της εταιρίας.
 *
 * Ο ιδιοκτήτης: «δεν αφήνει τον ρόλο του διευθυντή να καταχωρήσει έξοδα
 * στην εταιρεία». Δεν τον άφηνε το RLS του 0019, που έκλεισε κάθε πίνακα
 * του P&L στον ιδιοκτήτη - σωστό όσο γραφόταν μόνο από το Οικονομικό,
 * λάθος από τη στιγμή που η οθόνη των εξόδων άρχισε να γράφει στον ίδιο
 * πίνακα.
 *
 * Δύο πύλες φυλάνε το ίδιο πράγμα: η λίστα της φόρμας και η πολιτική της
 * βάσης. Αν δεν λένε το ίδιο σύνολο, η μία ψεύδεται - και ψευδόταν η
 * φόρμα, που πρόσφερε την κατηγορία σε όλους.
 */

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const sqlOf = (file: string) => fs.readFileSync(path.join(migrationsDir, file), 'utf8');
const migrationFiles = () =>
  fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const POLICY_MIGRATION = '0082_the_company_pays_and_the_manager_writes_it.sql';

/** Το σώμα της πολιτικής, από το migration που την ορίζει τελευταίο. */
function policyBody(cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'): string {
  const sql = sqlOf(POLICY_MIGRATION);
  const re = new RegExp(
    `CREATE POLICY company_daily_expenses_${cmd.toLowerCase()}[\\s\\S]*?FOR ${cmd}([\\s\\S]*?);`,
    'i'
  );
  const m = sql.match(re);
  expect(m, `λείπει η πολιτική ${cmd}`).toBeTruthy();
  return m![1];
}

describe('ποιος γράφει έξοδο της εταιρίας', () => {
  it('ο διευθυντής και πάνω - όχι ο υπάλληλος', () => {
    expect(canRecordCompanyExpense(['STORE_MANAGER'])).toBe(true);
    expect(canRecordCompanyExpense(['AREA_MANAGER'])).toBe(true);
    expect(canRecordCompanyExpense(['ORG_OWNER'])).toBe(true);
    expect(canRecordCompanyExpense(['ORG_ADMIN'])).toBe(true);
    expect(canRecordCompanyExpense(['PLATFORM_ADMIN'])).toBe(true);
    expect(canRecordCompanyExpense(['EMPLOYEE'])).toBe(false);
  });

  it('άγνωστος, κενός ή ανύπαρκτος ρόλος δεν γράφει', () => {
    // Ο στενότερος κύκλος είναι η μόνη ασφαλής ανάγνωση για ό,τι δεν
    // αναγνωρίζουμε: ένας ρόλος που δεν ξέρουμε δεν είναι διευθυντής.
    expect(canRecordCompanyExpense(['SHIFT_LEADER'])).toBe(false);
    expect(canRecordCompanyExpense(['ADMIN'])).toBe(false);
    expect(canRecordCompanyExpense([])).toBe(false);
    expect(canRecordCompanyExpense(null)).toBe(false);
    expect(canRecordCompanyExpense(undefined)).toBe(false);
  });

  it('το μπαλαντέρ δικαίωμα μετράει ως ιδιοκτησία', () => {
    expect(canRecordCompanyExpense(['EMPLOYEE'], ['*'])).toBe(true);
    expect(isOwnerRole([], ['*'])).toBe(true);
    expect(isElevatedRole([], ['expense.create'])).toBe(false);
  });

  it('ένας διευθυντής είναι διευθυντής, όχι ιδιοκτήτης', () => {
    // Η διόρθωση ποσού μένει στον ιδιοκτήτη· η καταχώρηση δεν.
    expect(isElevatedRole(['STORE_MANAGER'])).toBe(true);
    expect(isOwnerRole(['STORE_MANAGER'])).toBe(false);
  });
});

describe('τι προσφέρει η φόρμα', () => {
  const employee = () => offerableCategories(BUILTIN_EXPENSE_CATEGORIES, ['EMPLOYEE']);
  const manager = () => offerableCategories(BUILTIN_EXPENSE_CATEGORIES, ['STORE_MANAGER']);

  it('ο υπάλληλος δεν βλέπει καν κατηγορία εταιρίας', () => {
    expect(employee().some((c) => c.side === 'COMPANY')).toBe(false);
    // Και δεν χάνει τίποτα άλλο: μία λιγότερη, όχι μισή λίστα.
    expect(employee().length).toBe(BUILTIN_EXPENSE_CATEGORIES.length - 1);
  });

  it('ο διευθυντής τη βλέπει', () => {
    expect(manager().some((c) => c.side === 'COMPANY')).toBe(true);
    expect(manager().length).toBe(BUILTIN_EXPENSE_CATEGORIES.length);
  });

  it('μια δική του κατηγορία πλευράς COMPANY κρύβεται κι αυτή', () => {
    // Η πλευρά αποφασίζει, όχι το όνομα ή το κλειδί: ένα «ΕΦΚΑ δόσεις» που
    // έφτιαξε ο ιδιοκτήτης είναι το ίδιο πράγμα με το ενσωματωμένο.
    const own: ExpenseCategoryDef = {
      key: 'CUSTOM_EFKA_DOSEIS', label: 'ΕΦΚΑ δόσεις', side: 'COMPANY',
      sortOrder: 90, isActive: true, isBuiltin: false,
    };
    const list = [...BUILTIN_EXPENSE_CATEGORIES, own];
    expect(offerableCategories(list, ['EMPLOYEE']).map((c) => c.key)).not.toContain(own.key);
    expect(offerableCategories(list, ['STORE_MANAGER']).map((c) => c.key)).toContain(own.key);
  });

  it('οι αποσυρμένες μένουν έξω και για τους δύο', () => {
    const retired: ExpenseCategoryDef = {
      key: 'CUSTOM_OLD', label: 'Παλιά', side: 'AGENCY',
      sortOrder: 5, isActive: false, isBuiltin: false,
    };
    const list = [retired, ...BUILTIN_EXPENSE_CATEGORIES];
    for (const role of ['EMPLOYEE', 'STORE_MANAGER', 'ORG_OWNER']) {
      expect(offerableCategories(list, [role]).map((c) => c.key)).not.toContain(retired.key);
    }
  });
});

describe('η οθόνη και η βάση λένε το ίδιο σύνολο', () => {
  it('η λίστα των ρόλων είναι ακριβώς η λίστα του auth_is_elevated()', () => {
    let names: string[] | null = null;
    for (const file of migrationFiles()) {
      const m = sqlOf(file).match(/FUNCTION auth_is_elevated\(\)[\s\S]*?IN\s*\(([^)]*)\)/i);
      if (m) names = Array.from(m[1].matchAll(/'([A-Z_]+)'/g)).map((x) => x[1]);
    }
    expect(names, 'δεν βρέθηκε το auth_is_elevated() σε κανένα migration').toBeTruthy();
    expect([...names!].sort()).toEqual([...ELEVATED_ROLES].sort());
  });

  it('η εγγραφή στον πίνακα της εταιρίας θέλει διευθυντή, όχι ιδιοκτήτη', () => {
    const insert = policyBody('INSERT');
    expect(insert).toMatch(/auth_is_elevated\(\)/);
    expect(insert).not.toMatch(/auth_is_owner\(\)/);
    expect(insert).toMatch(/belongs_to_org\(organization_id\)/);
  });

  it('βλέπει, διορθώνει και σβήνει ο διευθυντής ή όποιος το έγραψε', () => {
    for (const cmd of ['SELECT', 'UPDATE', 'DELETE'] as const) {
      const body = policyBody(cmd);
      expect(body, cmd).toMatch(/auth_is_elevated\(\)/);
      // Χωρίς αυτή τη ρήτρα, ένας διευθυντής που έγινε υπάλληλος χάνει από
      // την οθόνη του ό,τι καταχώρησε ο ίδιος.
      expect(body, cmd).toMatch(/created_by_user_id = auth\.uid\(\)/);
    }
  });

  it('η παλιά πολιτική μόνο-ιδιοκτήτη φεύγει ρητά', () => {
    // Οι πολιτικές του RLS ενώνονται με OR. Αν έμενε, θα ήταν αθώα - αλλά
    // δύο πολιτικές για το ίδιο πράγμα είναι δύο απαντήσεις στην ίδια
    // ερώτηση, και η επόμενη αλλαγή θα διόρθωνε τη μία.
    expect(sqlOf(POLICY_MIGRATION)).toMatch(
      /DROP POLICY IF EXISTS company_daily_expenses_owner ON company_daily_expenses;/
    );
  });

  it('κανένας άλλος πίνακας του P&L δεν ανοίγει', () => {
    // Μισθοδοσία, προμήθειες, πάγια και έσοδα κυλικείου μένουν στον
    // ιδιοκτήτη: άνοιξε ο ένας πίνακας που γράφει μια οθόνη του διευθυντή.
    const sql = sqlOf(POLICY_MIGRATION);
    for (const table of [
      'payroll_records',
      'pnl_commission_entries',
      'fixed_expenses',
      'corporate_expenses',
      'pnl_fnb_daily_income',
    ]) {
      expect(sql, table).not.toContain(table);
    }
  });
});
