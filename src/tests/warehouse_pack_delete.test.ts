import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Μια λάθος καταχώρηση πρέπει να μπορεί να φύγει.
 *
 * Τα λόγια του ιδιοκτήτη: «υπάρχουνε πολλά σκρατς τα οποία έχουνε τους
 * τεστ κωδικούς και δεν μπορώ να τα σβήσω από την αποθήκη». Δεν μπορούσε:
 * η μόνη έξοδος ήταν η «Απόσυρση», που ανοίγει στις 90 ημέρες (EXPIRY_DAYS)
 * - κι εκείνη δεν προσφερόταν καθόλου για πακέτο «στο μαγαζί», που είναι η
 * θέση των 26 δοκιμαστικών της Λαμίας (1234567, 1111111, 0000000, 4444444).
 *
 * Η διαγραφή είναι ΑΛΛΟ γεγονός από την απόσυρση: η απόσυρση λέει «γύρισε
 * στον ΟΠΑΠ» - πράξη με ημερομηνία και αξία που φεύγει από το απόθεμα· η
 * διαγραφή λέει «αυτή η γραμμή δεν έπρεπε να γραφτεί». Αν τα δοκιμαστικά
 * «αποσυρθούν», η αποθήκη θα δείχνει για πάντα 26 επιστροφές που δεν έγιναν.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const SERVICE = 'src/services/scratchWarehouseService.ts';
const SCREEN = 'src/components/warehouse/ScratchWarehouseManager.tsx';

describe('η διαγραφή πακέτου υπάρχει και δεν είναι απόσυρση', () => {
  it('το service τη δίνει', () => {
    expect(read(SERVICE)).toContain('export async function deletePackById');
  });

  /**
   * Χωρίς φίλτρο κατάστασης, επίτηδες: τα δοκιμαστικά είναι όλα «στο
   * μαγαζί», δηλαδή ακριβώς στη θέση που δεν έχει άλλη έξοδο. Ένα
   * .in('status', UNOPENED_STATUSES) εδώ θα άφηνε άλυτο το πρόβλημα.
   */
  it('σβήνει από ΟΠΟΙΑ θέση κι αν είναι το πακέτο', () => {
    const src = read(SERVICE);
    const fn = src.slice(src.indexOf('export async function deletePackById'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    expect(body).toContain(".delete({ count: 'exact' })");
    expect(body).not.toContain('UNOPENED_STATUSES');
    expect(body).not.toContain(".eq('status'");
  });

  /**
   * Η RLS δεν σφάλλει - φιλτράρει τη γραμμή και το PostgREST απαντά 204
   * με μηδέν γραμμές. Χωρίς αυτόν τον έλεγχο, διαγραφή που δεν έγινε
   * διαβάζεται ως επιτυχία και το πακέτο ξαναφαίνεται στο επόμενο
   * φόρτωμα - το ίδιο μοτίβο που κόστισε στο lib/writeGuard.ts.
   */
  it('ελέγχει ότι ΓΡΑΦΤΗΚΕ κάτι, δεν εμπιστεύεται το 204', () => {
    const src = read(SERVICE);
    const fn = src.slice(src.indexOf('export async function deletePackById'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    expect(body).toContain('rowsWrittenProblem(count)');
  });
});

describe('η οθόνη της αποθήκης', () => {
  const screen = read(SCREEN);

  it('δίνει κουμπί Διαγραφή', () => {
    expect(screen).toContain('Διαγραφή');
    expect(screen).toContain('setToDelete(pack)');
    expect(screen).toContain('deletePackById(toDelete.id)');
  });

  /**
   * Το κουμπί μπαίνει ΕΞΩ από το ternary των καταστάσεων. Αν έμπαινε μέσα
   * στον κλάδο της αποθήκης, δεν θα έφτανε ποτέ στα πακέτα «στο μαγαζί» -
   * που είναι όλα τα δοκιμαστικά.
   */
  it('το προσφέρει και σε πακέτο που είναι στο μαγαζί', () => {
    const cell = screen.slice(screen.indexOf("{pack.status === 'WITHDRAWN' ?"));
    const del = cell.indexOf('setToDelete(pack)');
    const inStoreBranch = cell.indexOf("pack.status === 'IN_STORE'");
    expect(del).toBeGreaterThan(-1);
    // Μετά και από τον κλάδο του «στο μαγαζί» και από τον κλάδο του ράφιου:
    // δηλαδή κοινό για όλες τις θέσεις.
    expect(del).toBeGreaterThan(inStoreBranch);
    expect(del).toBeGreaterThan(cell.indexOf('Απόσυρση'));
  });

  /**
   * Ίδια αυστηρότητα με τη «Διόρθωση»: Ιδιοκτήτης / Διαχειριστής. Η βάση
   * δέχεται και τον υπεύθυνο (auth_is_elevated), άρα η οθόνη είναι πιο
   * αυστηρή από τη βάση - η ακίνδυνη κατεύθυνση. Το αντίστροφο δίνει
   * κουμπί που αποτυγχάνει πάντα.
   */
  it('το κρύβει από όποιον δεν μπορεί να διορθώσει', () => {
    const cell = screen.slice(screen.indexOf("{pack.status === 'WITHDRAWN' ?"));
    const del = cell.indexOf('setToDelete(pack)');
    const gate = cell.lastIndexOf('{canCorrect && (', del);
    expect(gate).toBeGreaterThan(-1);
    // Ο φρουρός είναι ο ΤΕΛΕΥΤΑΙΟΣ πριν το κουμπί, όχι κάποιος παλιός
    // που έκλεισε ενδιάμεσα.
    expect(cell.slice(gate, del)).not.toContain(')}');
  });

  it('λέει ότι σβήνει οριστικά και ΔΕΝ μένει ως αποσυρμένο', () => {
    expect(screen).toContain('σβήνεται οριστικά — δεν μένει ως αποσυρμένο');
  });

  /** Αν ο κωδικός έχει πωλήσεις, το λέει με νούμερο πριν σβήσει. */
  it('προειδοποιεί με νούμερο όταν ο κωδικός έχει πωλήσεις', () => {
    expect(screen).toContain('ΠΡΟΣΟΧΗ');
    expect(screen).toContain('δελτία πουλημένα σε βάρδιες');
  });
});

describe('η βάση το επιτρέπει στους ίδιους', () => {
  /**
   * Η οθόνη και η πολιτική δεσμένες: ένα κουμπί που η βάση αρνείται
   * διαβάζεται ως χαλασμένο σύστημα (0065).
   */
  it('η πολιτική warehouse_delete υπάρχει και θέλει ανεβασμένο ρόλο', () => {
    const sql = read('supabase/migrations/0065_the_scratch_warehouse.sql');
    const policy = sql.slice(sql.indexOf('CREATE POLICY warehouse_delete'));
    const stmt = policy.slice(0, policy.indexOf(';') + 1);
    expect(stmt).toContain('FOR DELETE');
    expect(stmt).toContain('belongs_to_org(organization_id)');
    expect(stmt).toContain('auth_is_elevated()');
  });

  it('το ίχνος της διαγραφής γράφεται από trigger', () => {
    const sql = read('supabase/migrations/0076_a_pack_is_handed_over_before_it_is_opened.sql');
    expect(sql).toContain("'WAREHOUSE_PACK_DELETED'");
  });
});
