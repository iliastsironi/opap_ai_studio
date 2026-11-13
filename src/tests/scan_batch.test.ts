import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  batchTotal, registerStaged, stageScan, totalsByGame, type ScanGame, type StagedPack,
} from '../lib/scanBatch.ts';

/**
 * Παραλαβή με σκανάρισμα: πολλά πακέτα στη σειρά, ένας έλεγχος στο τέλος.
 *
 * Η παραγγελία που ήρθε στη Λαμία έγραφε «Σκρατς (153), 3 δεσμίδες, 900 €».
 * Η λίστα πρέπει να δείχνει ακριβώς αυτά τα σύνολα πριν γραφτεί οτιδήποτε,
 * ώστε ο χρήστης να τα βάλει δίπλα στο χαρτί.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const SEPT: ScanGame = { gameNo: '0153', catalogCode: 'scr_5_7ari', name: '7ΑΡΙ 5€', price: 5, pieces: 60, value: 300 };
const GATA: ScanGame = { gameNo: '0158', catalogCode: 'scr_5_gata', name: 'ΓΑΤΑ 5€', price: 5, pieces: 60, value: 300 };
const games = [SEPT, GATA];

const ctx = (over: Partial<Parameters<typeof stageScan>[1]> = {}) => ({
  games,
  staged: [] as StagedPack[],
  existing: [] as Array<{ catalog_code: string; pack_code: string }>,
  ...over,
});

describe('ένα σκανάρισμα', () => {
  it('γίνεται πακέτο με το παιχνίδι του', () => {
    const out = stageScan('0153-0067248-033-92', ctx());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.pack.packCode).toBe('0067248');
    expect(out.pack.game.name).toBe('7ΑΡΙ 5€');
    expect(out.pack.key).toBe('scr_5_7ari|0067248');
  });

  it('κάθε εισιτήριο του ίδιου πακέτου είναι το ίδιο πακέτο', () => {
    const first = stageScan('0153006724800092', ctx());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = stageScan('0153006724803392', ctx({ staged: [first.pack] }));
    expect(second.ok).toBe(false);
    if (second.ok === false) expect(second.reason).toBe('duplicate_staged');
  });

  /** Ό,τι διάβασε ο σαρωτής της Λαμίας στο πρώτο ζωντανό σκανάρισμα: 15 ψηφία. */
  it('το πραγματικό σκανάρισμα των 15 ψηφίων γίνεται πακέτο', () => {
    const MONTHS: ScanGame = { gameNo: '0162', catalogCode: 'scr_5_24m', name: '24 ΜΗΝΕΣ 5€', price: 5, pieces: 60, value: 300 };
    const out = stageScan('016200307410593', ctx({ games: [...games, MONTHS] }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.pack.packCode).toBe('0030741');
    expect(out.pack.game.name).toBe('24 ΜΗΝΕΣ 5€');

    // Το ίδιο πακέτο υπάρχει ήδη στη βάση: πρέπει να το αναγνωρίσει, όχι να το απορρίψει ως «λάθος μήκος».
    const dup = stageScan('016200307410593', ctx({
      games: [...games, MONTHS],
      existing: [{ catalog_code: 'scr_5_24m', pack_code: '0030741' }],
    }));
    expect(dup.ok).toBe(false);
    if (dup.ok === false) expect(dup.reason).toBe('already_registered');
  });

  it('παιχνίδι που δεν υπάρχει στον κατάλογο το λέει, με τον αριθμό', () => {
    const out = stageScan('0199-0067248-033', ctx());
    expect(out.ok).toBe(false);
    if (out.ok === false) {
      expect(out.reason).toBe('unknown_game');
      expect(out.message).toContain('0199');
    }
  });

  it('πακέτο που υπάρχει ήδη στην αποθήκη δεν ξαναμπαίνει', () => {
    const out = stageScan('0153-0067248-033', ctx({ existing: [{ catalog_code: 'scr_5_7ari', pack_code: '0067248' }] }));
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.reason).toBe('already_registered');
  });

  /** Ο ίδιος κωδικός σε ΑΛΛΟ παιχνίδι είναι άλλο πακέτο - ο κωδικός μόνος δεν είναι ταυτότητα. */
  it('ο ίδιος κωδικός σε άλλο παιχνίδι δεν θεωρείται διπλός', () => {
    const out = stageScan('0153-0067248-033', ctx({ existing: [{ catalog_code: 'scr_5_gata', pack_code: '0067248' }] }));
    expect(out.ok).toBe(true);
  });

  it('κείμενο που δεν είναι κωδικός γίνεται μήνυμα με ό,τι διαβάστηκε - δεν πετάει', () => {
    const out = stageScan('12345', ctx());
    expect(out.ok).toBe(false);
    if (out.ok === false) {
      expect(out.reason).toBe('format');
      expect(out.message).toContain('12345');
    }
    expect(stageScan('', ctx()).ok).toBe(false);
    expect(stageScan(undefined, ctx()).ok).toBe(false);
  });
});

describe('τα σύνολα που έρχονται δίπλα στο χαρτί', () => {
  const pack = (game: ScanGame, code: string): StagedPack => ({
    key: `${game.catalogCode}|${code}`, gameNo: game.gameNo, packCode: code, game,
  });

  it('τρία πακέτα 5 € = 900 € όπως γράφει η παραγγελία', () => {
    // Το χαρτί: 3 δεσμίδες · 180 κομμάτια · 900 € (δεσμίδες 71698-71700)
    const staged = ['0071698', '0071699', '0071700'].map((c) => pack(SEPT, c));
    expect(totalsByGame(staged)).toEqual([{ gameNo: '0153', name: '7ΑΡΙ 5€', count: 3, value: 900 }]);
    expect(batchTotal(staged)).toEqual({ count: 3, value: 900 });
    expect(staged.reduce((t, s) => t + s.game.pieces, 0)).toBe(180);
  });

  it('ομαδοποιεί ανά παιχνίδι, με τη σειρά του αριθμού', () => {
    const staged = [pack(GATA, '0000001'), pack(SEPT, '0000002'), pack(GATA, '0000003')];
    expect(totalsByGame(staged).map((g) => `${g.gameNo}:${g.count}`)).toEqual(['0153:1', '0158:2']);
  });

  it('κενή λίστα δίνει μηδέν, όχι σφάλμα', () => {
    expect(totalsByGame([])).toEqual([]);
    expect(batchTotal([])).toEqual({ count: 0, value: 0 });
  });
});

describe('η καταχώρηση', () => {
  const pack = (code: string): StagedPack => ({
    key: `scr_5_7ari|${code}`, gameNo: '0153', packCode: code, game: SEPT,
  });

  it('γράφει όλα όσα πέρασαν, με τη σειρά που σκαναρίστηκαν', async () => {
    const written: string[] = [];
    const out = await registerStaged([pack('0000001'), pack('0000002')], async (p) => { written.push(p.packCode); });
    expect(written).toEqual(['0000001', '0000002']);
    expect(out.registered.length).toBe(2);
    expect(out.failed).toEqual([]);
  });

  /**
   * Το ένα που αποτυγχάνει δεν ακυρώνει τα άλλα και δεν φαίνεται
   * καταχωρημένο: μένει στη λίστα με τον λόγο του.
   */
  it('ό,τι αποτύχει μένει με τον λόγο του και δεν σταματά τα υπόλοιπα', async () => {
    const out = await registerStaged(
      [pack('0000001'), pack('0000002'), pack('0000003')],
      async (p) => { if (p.packCode === '0000002') throw new Error('Το πακέτο 0000002 έχει ήδη καταχωρηθεί.'); }
    );
    expect(out.registered.map((p) => p.packCode)).toEqual(['0000001', '0000003']);
    expect(out.failed.length).toBe(1);
    expect(out.failed[0].pack.packCode).toBe('0000002');
    expect(out.failed[0].message).toContain('έχει ήδη καταχωρηθεί');
  });

  it('σφάλμα χωρίς μήνυμα δίνει γενικό μήνυμα, όχι κενό', async () => {
    const out = await registerStaged([pack('0000001')], async () => { throw {}; });
    expect(out.failed[0].message.length).toBeGreaterThan(0);
  });
});

describe('η οθόνη', () => {
  const panel = read('src/components/warehouse/ScanReceivePanel.tsx');
  const camera = read('src/components/warehouse/BarcodeCameraModal.tsx');
  const manager = read('src/components/warehouse/ScratchWarehouseManager.tsx');

  /**
   * Ο σαρωτής USB πληκτρολογεί ψηφίο-ψηφίο. Ένα πεδίο που κόβει ή ξαναγράφει
   * την τιμή του σε κάθε πλήκτρο (όπως το πεδίο του αριθμού παιχνιδιού,
   * που κρατά 4 ψηφία) θα έχανε ψηφία στη μέση.
   */
  it('το πεδίο σάρωσης δεν κόβει ούτε ξαναγράφει την τιμή του', () => {
    expect(panel).toContain('onChange={(e) => setBuffer(e.target.value)}');
    expect(panel).not.toMatch(/setBuffer\([^)]*(slice|substring|digitsOnly)/);
  });

  it('διαβάζει με Enter ΚΑΙ όταν σταματήσει η ροή (σαρωτής χωρίς Enter)', () => {
    expect(panel).toContain("e.key !== 'Enter'");
    expect(panel).toContain('SCAN_IDLE_MS');
    expect(panel).toContain('BARCODE_LENGTH');
  });

  /**
   * Ο σαρωτής στέλνει Enter μετά από κάθε barcode. Ο κανόνας της εφαρμογής
   * «Enter → επόμενο πεδίο» έπαιρνε την εστίαση μετά το ΠΡΩΤΟ πακέτο, και το
   * δεύτερο έπεφτε στην αναζήτηση της λίστας. Βρέθηκε μόνο δοκιμάζοντας ζωντανά.
   */
  it('το πεδίο σάρωσης κρατά το Enter για τον εαυτό του', () => {
    expect(panel).toContain('data-enter-advance="off"');
  });

  it('τίποτα δεν γράφεται πριν πατηθεί η Καταχώρηση', () => {
    const consume = panel.slice(panel.indexOf('const consume = useCallback'), panel.indexOf('const consumeForCamera'));
    expect(consume).not.toContain('receivePack');
    expect(panel.match(/receivePack\(/g)?.length).toBe(1);
  });

  it('η αποτυχημένη καταχώρηση αφήνει τα πακέτα στη λίστα', () => {
    expect(panel).toContain('setBoth(failed.map((f) => f.pack));');
  });

  it('η ημερομηνία παραλαβής είναι αυτή της φόρμας, όχι η σημερινή', () => {
    expect(panel).toContain('receivedAt,');
    expect(manager).toContain('receivedAt={receivedAt}');
  });

  it('η αποθήκη τη δείχνει και της δίνει ΟΛΑ τα πακέτα για τα διπλά', () => {
    expect(manager).toContain('<ScanReceivePanel');
    expect(manager).toContain('existing={packs}');
  });

  /** Η βιβλιοθήκη της κάμερας δεν μπαίνει στο βασικό bundle. */
  it('η κάμερα φορτώνει τη βιβλιοθήκη μόνο όταν ανοίξει', () => {
    expect(camera).toContain("import('@zxing/browser')");
    expect(camera).toContain("import('@zxing/library')");
    expect(camera).not.toMatch(/^import [^\n]*from '@zxing\//m);
  });

  it('η κάμερα σταματά όταν κλείσει το παράθυρο', () => {
    expect(camera).toContain('controls.stop()');
    expect(camera).toContain('cancelled = true;');
  });

  it('το ίδιο barcode μπροστά στην κάμερα δεν μετριέται ξανά και ξανά', () => {
    expect(camera).toContain('SAME_READING_MS');
  });
});
