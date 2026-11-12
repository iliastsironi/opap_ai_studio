import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { codesByGame, repeatedCodes, totalCodes } from '../lib/warehouseCodeList.ts';

/**
 * «Στην αποθήκη απλά να ξέρω ποιοι κωδικοί υπάρχουν.»
 *
 * Υπήρχαν ήδη όλοι στην οθόνη - αλλά ποτέ ταυτόχρονα, γιατί η λίστα
 * φιλτράρει μία θέση τη φορά. Τέσσερις καρτέλες και μνήμη, για μια
 * ερώτηση που κάνεις κρατώντας ένα πακέτο στο χέρι.
 */
const pack = (over: Record<string, unknown> = {}) => ({
  pack_code: '0040695',
  game_name: 'ΓΑΤΑ',
  game_no: '0157',
  catalog_code: 'scr_2_gata',
  unit_price: 2,
  status: 'IN_WAREHOUSE',
  ...over,
});

describe('ποιοι κωδικοί υπάρχουν', () => {
  it('τους μαζεύει ανά παιχνίδι', () => {
    const games = codesByGame([
      pack({ pack_code: '0040695', status: 'IN_STORE' }),
      pack({ pack_code: '0040696' }),
      pack({ pack_code: '0047120', catalog_code: 'scr_10_x50', game_name: 'Χ50', game_no: '0150', unit_price: 10 }),
    ]);
    expect(games.length).toBe(2);
    expect(totalCodes(games)).toBe(3);
    const gata = games.find((g) => g.key === 'scr_2_gata')!;
    expect(gata.codes.map((c) => c.code)).toEqual(['0040696', '0040695']);
  });

  /**
   * Το ίδιο όνομα σε άλλη τιμή είναι ΑΛΛΟ παιχνίδι: «ΓΑΤΑ» λέγονται
   * τέσσερα. Ομαδοποίηση με το όνομα θα τα έχωνε όλα μαζί και ο κωδικός
   * θα φαινόταν ότι ανήκει κάπου που δεν ανήκει.
   */
  it('η ΓΑΤΑ 2€ δεν μπερδεύεται με τη ΓΑΤΑ 5€', () => {
    const games = codesByGame([
      pack({ pack_code: '0040695' }),
      pack({ pack_code: '0074018', catalog_code: 'scr_5_gata', game_no: '0158', unit_price: 5 }),
    ]);
    expect(games.length).toBe(2);
    expect(games.map((g) => g.label)).toContain('ΓΑΤΑ 2€');
    expect(games.map((g) => g.label)).toContain('ΓΑΤΑ 5€');
  });

  /**
   * Μερικά ονόματα κουβαλάνε ήδη την τιμή: το «Δώρο 5€» του καταλόγου
   * γινόταν «Δώρο 5€ 5€». Η τιμή μπαίνει για να ξεχωρίζει η ΓΑΤΑ 2€ από
   * τη ΓΑΤΑ 5€, όχι για να λέγεται δύο φορές.
   */
  it('δεν λέει την τιμή δύο φορές', () => {
    const games = codesByGame([
      pack({ catalog_code: 'scr_custom_mwakfl3f', game_name: 'Δώρο 5€', game_no: '0168', unit_price: 5 }),
    ]);
    expect(games[0].label).toBe('Δώρο 5€');
  });

  it('αλλά τη βάζει όταν λείπει, γιατί εκεί ξεχωρίζει', () => {
    expect(codesByGame([pack()])[0].label).toBe('ΓΑΤΑ 2€');
  });

  /** Ο ίδιος κωδικός σε δύο παιχνίδια είναι φυσιολογικός, όχι διπλός. */
  it('ο ίδιος κωδικός σε ΑΛΛΟ παιχνίδι δεν είναι διπλός', () => {
    const games = codesByGame([
      pack({ pack_code: '1234567' }),
      pack({ pack_code: '1234567', catalog_code: 'scr_10_x50', game_name: 'Χ50', game_no: '0150', unit_price: 10 }),
    ]);
    expect(repeatedCodes(games)).toBe(0);
  });

  /**
   * Στο ΙΔΙΟ παιχνίδι όμως, δύο πακέτα με τον ίδιο κωδικό δεν ξεχωρίζουν
   * από τίποτα - ούτε από την πρόοδο πώλησης, ούτε από εκείνον που θα
   * διαλέξει ποιο να σβήσει.
   */
  it('ο ίδιος κωδικός ΔΥΟ φορές στο ίδιο παιχνίδι σημειώνεται', () => {
    const games = codesByGame([
      pack({ pack_code: '1234567', status: 'IN_STORE' }),
      pack({ pack_code: '1234567', status: 'IN_WAREHOUSE' }),
      pack({ pack_code: '0040695' }),
    ]);
    expect(repeatedCodes(games)).toBe(2);
    const marked = games[0].codes.filter((c) => c.repeated).map((c) => c.code);
    expect(marked).toEqual(['1234567', '1234567']);
    expect(games[0].codes.find((c) => c.code === '0040695')!.repeated).toBe(false);
  });

  it('η σειρά διαβάζεται σαν διαδρομή: ράφι, παράδοση, μαγαζί, αποσυρμένο', () => {
    const games = codesByGame([
      pack({ pack_code: '4', status: 'WITHDRAWN' }),
      pack({ pack_code: '3', status: 'IN_STORE' }),
      pack({ pack_code: '1', status: 'IN_WAREHOUSE' }),
      pack({ pack_code: '2', status: 'PENDING_DELIVERY' }),
    ]);
    expect(games[0].codes.map((c) => c.code)).toEqual(['1', '2', '3', '4']);
  });

  it('αντέχει άδειο, κενούς κωδικούς και ελλιπείς γραμμές', () => {
    expect(codesByGame(null)).toEqual([]);
    expect(codesByGame([])).toEqual([]);
    expect(codesByGame([pack({ pack_code: '' }), pack({ pack_code: '   ' })])).toEqual([]);
    expect(totalCodes(codesByGame([pack({ catalog_code: '', game_no: '', game_name: '' })]))).toBe(0);
  });
});

describe('η οθόνη τη δείχνει χωρίς να ρωτάει το φίλτρο', () => {
  const screen = fs.readFileSync(
    path.join(process.cwd(), 'src/components/warehouse/ScratchWarehouseManager.tsx'),
    'utf8'
  );

  /**
   * Από το `packs`, όχι από το `visible`. Μια λίστα κωδικών που ακολουθεί
   * το φίλτρο θα έλεγε «δεν υπάρχει» για κωδικό που απλώς κάθεται σε άλλη
   * καρτέλα - ακριβώς το πρόβλημα που λύνει.
   */
  it('διαβάζει ΟΛΑ τα πακέτα, όχι τα φιλτραρισμένα', () => {
    expect(screen).toContain('codesByGame(packs)');
    expect(screen).not.toContain('codesByGame(visible)');
  });

  it('είναι ανοιχτή από μόνη της', () => {
    expect(screen).toContain('useState(true)');
    expect(screen).toContain('Ολοι οι κωδικοι');
  });

  it('λέει τι σημαίνει κάθε χρώμα', () => {
    expect(screen).toContain('Γκρι στο ράφι');
    expect(screen).toContain('προς παράδοση');
    expect(screen).toContain('στο μαγαζί');
  });
});
