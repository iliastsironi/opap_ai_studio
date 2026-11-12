import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Μία λίστα παιχνιδιών για όλα τα μαγαζιά.
 *
 * «Εμείς που προσφέρουμε την εφαρμογή θα βάζουμε και θα βγάζουμε κωδικούς
 * και θα ενημερώνονται όλοι ταυτόχρονα.»
 *
 * Η κοινή λίστα υπήρχε ΗΔΗ στα δεδομένα από το 0030: μια γραμμή με
 * store_id NULL ισχύει για κάθε κατάστημα, και το κατάστημα μπορεί να την
 * παρακάμψει με δική του γραμμή του ίδιου κωδικού. Έλειπε ο δρόμος να τη
 * φτάσει κανείς - η οθόνη περνούσε πάντα το τρέχον κατάστημα, οπότε κάθε
 * νέος κωδικός έπρεπε να περαστεί χωριστά σε κάθε μαγαζί.
 *
 * Στα δεδομένα τη στιγμή της αλλαγής: 22 κωδικοί συντηρούνταν ξεχωριστά σε
 * δύο καταστήματα, το τρίτο δεν είχε κατάλογο καθόλου, και η κοινή λίστα
 * ήταν άδεια.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const SCREEN = 'src/components/shifts/ShiftTemplateConfigurator.tsx';
const SERVICE = 'src/services/scratchCatalogService.ts';

describe('η καρτέλα του καταλόγου διαλέγει εμβέλεια', () => {
  const screen = read(SCREEN);

  it('δίνει τις δύο επιλογές', () => {
    expect(screen).toContain('Όλα τα καταστήματα');
    expect(screen).toContain("catalogScope");
  });

  /**
   * Ξεκινάει από την ΚΟΙΝΗ. Ένας νέος κωδικός του ΟΠΑΠ είναι ο ίδιος για
   * όλα τα μαγαζιά, και το να περνιέται χωριστά σε καθένα είναι ακριβώς ο
   * τρόπος που ξεχνιέται σε ένα.
   */
  it('ξεκινάει από την κοινή λίστα, όχι από το μαγαζί', () => {
    expect(screen).toContain("useState<'ORG' | 'STORE'>('ORG')");
  });

  /**
   * ORG σημαίνει null, όχι «το τρέχον κατάστημα». Αν περνούσε το κατάστημα,
   * ο διακόπτης θα άλλαζε ετικέτα και τίποτα άλλο - η χειρότερη εκδοχή,
   * γιατί θα έδειχνε ότι ενημερώθηκαν όλοι ενώ δεν ενημερώθηκε κανείς.
   */
  it('η κοινή λίστα περνάει null στον επεξεργαστή', () => {
    expect(screen).toContain("storeId={catalogScope === 'ORG' ? null : storeId}");
  });

  it('λέει τι σημαίνει η κάθε επιλογή πριν πατηθεί', () => {
    expect(screen).toContain('ισχύει αμέσως σε ΚΑΘΕ κατάστημα');
    expect(screen).toContain('παρακάμπτει την κοινή λίστα');
  });

  /** Χωρίς επιλεγμένο κατάστημα η κοινή λίστα πρέπει να παραμένει προσιτή. */
  it('η κοινή λίστα δεν απαιτεί επιλεγμένο κατάστημα', () => {
    expect(screen).toContain("catalogScope === 'ORG' || storeId ?");
  });
});

describe('ο κανόνας κληρονομιάς στη βάση', () => {
  const service = read(SERVICE);

  it('το ταμείο διαβάζει ΚΑΙ την κοινή ΚΑΙ του μαγαζιού', () => {
    const fn = service.slice(service.indexOf('export async function fetchScratchCatalog'));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
    expect(body).toContain('store_id.eq.${storeId},store_id.is.null');
  });

  /**
   * Η σειρά προτεραιότητας είναι όλη η ασφάλεια της κοινής λίστας: ένα
   * μαγαζί που έχει δική του τιμή για έναν κωδικό δεν τη χάνει επειδή
   * κάποιος πείραξε την κοινή.
   */
  it('η γραμμή του μαγαζιού νικάει την κοινή στον ίδιο κωδικό', () => {
    expect(service).toContain('if (!existing || (r.store_id && !existing.store_id)) byCode.set(r.code, r);');
  });

  /** Η αποθήκευση ξέρει να γράψει στην κοινή θέση, όχι μόνο σε μαγαζί. */
  it('η αποθήκευση καθαρίζει τη σωστή θέση ανάλογα με την εμβέλεια', () => {
    const fn = service.slice(service.indexOf('export async function saveScratchCatalog'));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
    expect(body).toContain("wipe.eq('store_id', storeId)");
    expect(body).toContain("wipe.is('store_id', null)");
  });
});
