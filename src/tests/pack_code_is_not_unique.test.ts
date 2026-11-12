import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { packProgress, positionKey, type ProgressRow } from '../lib/packProgress.ts';

/**
 * Ο κωδικός πακέτου ΔΕΝ είναι μοναδικός.
 *
 * Στη Λαμία ο κωδικός 1234567 υπάρχει σε δέκα διαφορετικά παιχνίδια: όσο
 * γραφόταν στο χέρι, ο ίδιος αριθμός μπήκε παντού. Η αποθήκη κρατούσε την
 * πρόοδο των πακέτων σε χάρτη κλειδωμένο με ΣΚΕΤΟ τον κωδικό, οπότε η
 * πρώτη γραμμή που συναντούσε απαντούσε και για τα δέκα - το πακέτο του
 * Χ50 έδειχνε την πρόοδο του ΓΑΤΑ.
 *
 * Το ίδιο λάθος έκανα και στη μέτρηση με την οποία θα αποφασιζόταν ποια
 * πακέτα είναι δοκιμαστικά και σβήνονται: έβγαζε «έχει πουλήσει» για κάθε
 * 1234567, επειδή είχε πουλήσει ένα από αυτά. Με σωστό κλειδί, 31 από τα
 * 37 ύποπτα αποδείχθηκαν πραγματικά μετρημένα - και 6 όχι.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** Η ίδια βάρδια, δύο παιχνίδια, ο ΙΔΙΟΣ κωδικός πακέτου. */
const GATA: ProgressRow = { startNo: '134', endNo: '143' };
const X50: ProgressRow = { startNo: '5', endNo: '23' };

describe('η ταυτότητα ενός πακέτου', () => {
  it('ίδιος κωδικός σε άλλο παιχνίδι είναι ΑΛΛΟ πακέτο', () => {
    expect(positionKey('scr_2_gata', '1234567')).not.toBe(positionKey('scr_10_x50', '1234567'));
  });

  it('ίδιο παιχνίδι και ίδιος κωδικός είναι το ίδιο πακέτο', () => {
    expect(positionKey('scr_2_gata', '1234567')).toBe(positionKey('scr_2_gata', '1234567'));
  });

  it('τα κενά γύρω από τον κωδικό δεν φτιάχνουν δεύτερο πακέτο', () => {
    expect(positionKey(' scr_2_gata ', ' 1234567 ')).toBe(positionKey('scr_2_gata', '1234567'));
  });

  /**
   * Το ίδιο το λάθος, σε αριθμούς: με κλειδί τον σκέτο κωδικό, το δεύτερο
   * παιχνίδι διαβάζει τη θέση του πρώτου.
   */
  it('ΜΕ ΣΚΕΤΟ ΚΩΔΙΚΟ τα δύο παιχνίδια μπερδεύονται· με το σωστό κλειδί όχι', () => {
    const wrong: Record<string, ProgressRow> = {};
    const right: Record<string, ProgressRow> = {};
    for (const [game, row] of [['scr_2_gata', GATA], ['scr_10_x50', X50]] as const) {
      if (!wrong['1234567']) wrong['1234567'] = row;
      right[positionKey(game, '1234567')] = row;
    }
    // Το Χ50 έχει 30 δελτία· το ΓΑΤΑ 2€ έχει 150.
    expect(packProgress(wrong['1234567'], 30).position).toBe(143); // η θέση του ΓΑΤΑ
    expect(packProgress(right[positionKey('scr_10_x50', '1234567')], 30).position).toBe(23);
    expect(packProgress(right[positionKey('scr_2_gata', '1234567')], 150).position).toBe(143);
  });
});

describe('ο χάρτης της αποθήκης κλειδώνει με το σωστό', () => {
  it('το service δεν δεικτοδοτεί με σκέτο κωδικό', () => {
    const src = read('src/services/scratchWarehouseService.ts');
    const fn = src.slice(src.indexOf('export async function fetchPackPositions'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    expect(body).toContain('positionKey(');
    expect(body).not.toMatch(/byCode\[code\]/);
  });

  /**
   * Και τα ΕΠΤΑ σημεία της οθόνης, όχι έξι. Ένα ξεχασμένο θα έδειχνε
   * πρόοδο άλλου παιχνιδιού ακριβώς εκεί που κρίνεται μια διαγραφή.
   */
  it('η οθόνη δεν διαβάζει πουθενά με σκέτο κωδικό', () => {
    const screen = read('src/components/warehouse/ScratchWarehouseManager.tsx');
    expect(screen).not.toMatch(/positions\[\s*\w+\.pack_code\s*\]/);
    const uses = screen.match(/positions\[positionKey\(/g) ?? [];
    expect(uses.length).toBe(7);
  });
});

describe('ένα πακέτο που δεν μετρήθηκε ποτέ το λέει', () => {
  /**
   * Χωρίς αυτό, η αποθήκη έδειχνε «#0 / 60 · 0%» - ίδιο νούμερο για
   * «κανείς δεν το άγγιξε ποτέ» και για «μόλις ξεκίνησε». Αυτή ακριβώς η
   * διάκριση λείπει όταν ψάχνεις ποιο πακέτο μπήκε λάθος.
   */
  it('η οθόνη ξεχωρίζει το άγγιχτο από το μόλις ανοιγμένο', () => {
    const screen = read('src/components/warehouse/ScratchWarehouseManager.tsx');
    expect(screen).toContain('δεν μετρήθηκε ποτέ');
    expect(screen).toContain('καμία βάρδια δεν έγραψε αυτόν τον κωδικό');
  });

  it('και τα δύο δίνουν τα ίδια μηδενικά, γι΄ αυτό χρειάζεται λόγια', () => {
    const justOpened: ProgressRow = { startNo: '0', endNo: '' };
    expect(packProgress(justOpened, 60).sold).toBe(packProgress(undefined, 60).sold);
    expect(packProgress(justOpened, 60).percent).toBe(packProgress(undefined, 60).percent);
  });
});
