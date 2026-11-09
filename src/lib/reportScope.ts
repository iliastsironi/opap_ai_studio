// Τι μετράει σε κάθε εύρος της Επισκόπησης - μία απάντηση, εδώ.
//
// Τρεις κάρτες ρωτούν το ίδιο πράγμα με άλλα λόγια: τα πλακίδια («πόσος
// τζίρος, πόσα έξοδα»), το Cost Mix («τι είδους έξοδα») και οι Προμηθευτές
// («σε ποιον»). Όσο η απάντηση ζούσε σε τρία σημεία, έδιναν τρία διαφορετικά
// νούμερα στην ίδια οθόνη: με εύρος ένα κατάστημα, το πλακίδιο «Έξοδα»
// έδειχνε του μαγαζιού και το Cost Mix δίπλα του όλης της εταιρίας.

import { MonthlyPnlResult, PnlUnit, PnlUnitRow } from './pnlEngine.ts';

export const SCOPE_ALL = 'ALL';
export const SCOPE_AGENCY = 'AGENCY';
export const SCOPE_FNB = 'FNB';

/** Εύρος ενός συγκεκριμένου καταστήματος - ό,τι δεν είναι μία από τις τρεις όψεις. */
export const isStoreScope = (scope: string): boolean =>
  scope !== SCOPE_ALL && scope !== SCOPE_AGENCY && scope !== SCOPE_FNB;

const round2 = (value: number): number => Math.round(value * 100) / 100;
const sumOf = (values: number[]): number => round2(values.reduce((acc, value) => acc + value, 0));

export interface ScopeRule {
  /** Ποιο κατάστημα· null σημαίνει όλα. */
  storeId: string | null;
  /** Ποιες πλευρές μετρούν - το πρακτορείο, ο καφές, ή και τα δύο. */
  sides: PnlUnit[];
  /**
   * Αν το εύρος σηκώνει τα έξοδα εταιρίας και τα δάνεια. Τα σηκώνει μόνο το
   * πρακτορείο ως σύνολο: δεν ανήκουν σε ένα μαγαζί, και ο καφές δεν τα
   * πληρώνει.
   */
  carriesCompany: boolean;
}

/**
 * ΕΝΑ ΚΑΤΑΣΤΗΜΑ ΣΗΜΑΙΝΕΙ ΤΟ ΠΡΑΚΤΟΡΕΙΟ ΤΟΥ, ΟΧΙ ΚΑΙ ΤΟΝ ΚΑΦΕ ΤΟΥ.
 *
 * Μέχρι εδώ άθροιζε ΟΛΕΣ τις μονάδες του μαγαζιού, με το σκεπτικό ότι ο καφές
 * του 101499 κουβαλάει κέρδος και πετώντας τον το μαγαζί δείχνει φτωχότερο.
 * Ο owner το γύρισε, και έχει δίκιο: «στα έξοδα του μαγαζιού, πχ το ΟΠΑΠ, δεν
 * πρέπει να φαίνονται τα έξοδα/έσοδα καφέ, αλλά μόνο στο FnB». Ο καφές είναι
 * άλλη επιχείρηση που τυχαίνει να κάθεται στον ίδιο χώρο, και έχει τη δική του
 * όψη. Αν μπαίνει και στου μαγαζιού, η ερώτηση «πόσο βγάζει το πρακτορείο»
 * δεν απαντιέται πουθενά - που ήταν ακριβώς ο λόγος που χωρίσαμε τις δύο
 * πλευρές.
 */
export function scopeRule(scope: string): ScopeRule {
  if (scope === SCOPE_ALL) return { storeId: null, sides: ['STORE', 'FNB'], carriesCompany: true };
  if (scope === SCOPE_AGENCY) return { storeId: null, sides: ['STORE'], carriesCompany: true };
  if (scope === SCOPE_FNB) return { storeId: null, sides: ['FNB'], carriesCompany: false };
  return { storeId: scope, sides: ['STORE'], carriesCompany: false };
}

/** Οι μονάδες του μήνα που πέφτουν μέσα στο εύρος. */
export function scopedUnits(pnl: MonthlyPnlResult, rule: ScopeRule): PnlUnitRow[] {
  return pnl.units.filter(
    (u) => (rule.storeId === null || u.storeId === rule.storeId) && rule.sides.includes(u.unit)
  );
}

export interface ScopeFigures {
  revenue: number;
  costs: number;
  result: number;
}

/**
 * Τζίρος, κόστος και αποτέλεσμα για ένα εύρος.
 *
 * Ίδιος κανόνας με τη Σύνοψη του P&L, ώστε «πόσο βγάζει το πρακτορείο» να μη
 * δίνει δύο διαφορετικά νούμερα σε δύο οθόνες.
 */
export function scopedFigures(pnl: MonthlyPnlResult | null, scope: string): ScopeFigures {
  if (!pnl) return { revenue: 0, costs: 0, result: 0 };
  const rule = scopeRule(scope);
  const units = scopedUnits(pnl, rule);
  const company = rule.carriesCompany ? round2(pnl.companyExpenses + pnl.loans) : 0;
  return {
    revenue: sumOf(units.map((u) => u.revenue)),
    costs: round2(sumOf(units.map((u) => u.dailyExpenses + u.fixedCosts + u.payroll)) + company),
    result: round2(sumOf(units.map((u) => u.result)) - company),
  };
}

export type CostMixKey = 'AGENCY_DAILY' | 'FNB_DAILY' | 'FIXED' | 'PAYROLL' | 'COMPANY' | 'LOANS';

export interface CostMixSlice {
  key: CostMixKey;
  value: number;
}

/**
 * Οι γραμμές του Cost Mix για το εύρος, στη σειρά που εμφανίζονται.
 *
 * Το άθροισμά τους είναι ΤΟ ΙΔΙΟ νούμερο με το `costs` παραπάνω - το πλακίδιο
 * «Έξοδα» και το ντόνατ δίπλα του δεν επιτρέπεται να διαφωνούν.
 *
 * Γραμμή που δεν ισχύει για το εύρος λείπει, δεν γράφεται 0,00. Ένα «Αγορές
 * Καφέ 0,00» κάτω από ένα κατάστημα διαβάζεται «ο καφές μου δεν ξόδεψε
 * τίποτα», ενώ η αλήθεια είναι ότι ο καφές δεν μετράει εδώ.
 */
export function scopedCostMix(pnl: MonthlyPnlResult, scope: string): CostMixSlice[] {
  const rule = scopeRule(scope);
  const units = scopedUnits(pnl, rule);
  const dailyOf = (side: PnlUnit) => sumOf(units.filter((u) => u.unit === side).map((u) => u.dailyExpenses));
  const rows: CostMixSlice[] = [];
  if (rule.sides.includes('STORE')) rows.push({ key: 'AGENCY_DAILY', value: dailyOf('STORE') });
  if (rule.sides.includes('FNB')) rows.push({ key: 'FNB_DAILY', value: dailyOf('FNB') });
  rows.push({ key: 'FIXED', value: sumOf(units.map((u) => u.fixedCosts)) });
  rows.push({ key: 'PAYROLL', value: sumOf(units.map((u) => u.payroll)) });
  if (rule.carriesCompany) {
    rows.push({ key: 'COMPANY', value: pnl.companyExpenses });
    rows.push({ key: 'LOANS', value: pnl.loans });
  }
  return rows;
}
