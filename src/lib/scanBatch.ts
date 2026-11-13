/**
 * Παραλαβή με σκανάρισμα: πολλά πακέτα στη σειρά, ένας έλεγχος στο τέλος.
 *
 * Η παραγγελία έρχεται με δέκα πακέτα, όχι με ένα. Η φόρμα της αποθήκης
 * γράφει ένα τη φορά (σκανάρισμα, κλικ στην Καταχώρηση, και πάλι), και κάθε
 * πακέτο που μπαίνει με το χέρι είναι ευκαιρία για ένα ψηφίο λάθος. Εδώ
 * κάθε σκανάρισμα μπαίνει σε ΛΙΣΤΑ - δεν γράφεται τίποτα - και ο χρήστης
 * βλέπει ανά παιχνίδι πόσα πακέτα και πόσα ευρώ, ώστε να τα βάλει δίπλα στο
 * χαρτί της παραγγελίας πριν πατήσει την καταχώρηση.
 *
 * Καθαρή λογική: δεν ξέρει τη βάση. Η εγγραφή περνά ως συνάρτηση, και έτσι
 * ελέγχεται χωρίς δίκτυο.
 */

import { readBarcode } from './scratchBarcode.ts';
import { positionKey } from './packProgress.ts';

/** Ό,τι χρειάζεται από ένα παιχνίδι του καταλόγου (WarehouseGame, χωρίς τη βάση). */
export interface ScanGame {
  gameNo: string;
  catalogCode: string;
  name: string;
  price: number;
  pieces: number;
  value: number;
}

export interface StagedPack {
  /** Ταυτότητα πακέτου: (παιχνίδι, κωδικός) - ο κωδικός μόνος δεν είναι μοναδικός. */
  key: string;
  gameNo: string;
  packCode: string;
  game: ScanGame;
}

export type ScanOutcome =
  | { ok: true; pack: StagedPack; message: string }
  | { ok: false; reason: 'format' | 'unknown_game' | 'duplicate_staged' | 'already_registered'; message: string };

export interface ScanContext {
  games: ReadonlyArray<ScanGame>;
  staged: ReadonlyArray<StagedPack>;
  /** Ό,τι υπάρχει ήδη στην αποθήκη, σε ΟΛΕΣ τις θέσεις. */
  existing: ReadonlyArray<{ catalog_code: string; pack_code: string }>;
}

/**
 * Τι σημαίνει ένα σκανάρισμα. Ποτέ δεν πετάει: ό,τι δεν διαβάζεται γίνεται
 * μήνυμα που λέει τι διαβάστηκε, γιατί ένα σκανάρισμα που αποτυγχάνει χωρίς
 * λόγο διαβάζεται ως χαλασμένος σαρωτής.
 */
export function stageScan(raw: unknown, ctx: ScanContext): ScanOutcome {
  const reading = readBarcode(raw);
  if (!reading.parts) {
    const shown = String(raw ?? '').trim();
    return {
      ok: false,
      reason: 'format',
      message: shown ? `«${shown}»: ${reading.problem}` : (reading.problem ?? 'Άδειο σκανάρισμα.'),
    };
  }

  const { gameNo, packCode } = reading.parts;
  const game = ctx.games.find((g) => g.gameNo === gameNo);
  if (!game) {
    return {
      ok: false,
      reason: 'unknown_game',
      message: `Το παιχνίδι ${gameNo} δεν υπάρχει στον κατάλογο αυτού του καταστήματος (πακέτο ${packCode}).`,
    };
  }

  const key = positionKey(game.catalogCode, packCode);
  if (ctx.staged.some((s) => s.key === key)) {
    return {
      ok: false,
      reason: 'duplicate_staged',
      message: `${game.name} · ${packCode}: είναι ήδη στη λίστα.`,
    };
  }
  if (ctx.existing.some((p) => positionKey(p.catalog_code, p.pack_code) === key)) {
    return {
      ok: false,
      reason: 'already_registered',
      message: `${game.name} · ${packCode}: υπάρχει ήδη στην αποθήκη.`,
    };
  }

  return {
    ok: true,
    pack: { key, gameNo, packCode, game },
    message: `${game.name} · ${packCode}`,
  };
}

export interface GameTotal {
  gameNo: string;
  name: string;
  count: number;
  value: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Ανά παιχνίδι: πόσα πακέτα και πόση αξία - ό,τι γράφει και το χαρτί της παραγγελίας. */
export function totalsByGame(staged: ReadonlyArray<StagedPack>): GameTotal[] {
  const byGame = new Map<string, GameTotal>();
  for (const s of staged) {
    const existing = byGame.get(s.game.catalogCode);
    if (existing) {
      existing.count += 1;
      existing.value = cents(existing.value + s.game.value);
    } else {
      byGame.set(s.game.catalogCode, {
        gameNo: s.gameNo,
        name: s.game.name,
        count: 1,
        value: cents(s.game.value),
      });
    }
  }
  return [...byGame.values()].sort((a, b) => a.gameNo.localeCompare(b.gameNo));
}

export function batchTotal(staged: ReadonlyArray<StagedPack>): { count: number; value: number } {
  return {
    count: staged.length,
    value: cents(staged.reduce((t, s) => t + s.game.value, 0)),
  };
}

export interface RegisterResult {
  registered: StagedPack[];
  failed: Array<{ pack: StagedPack; message: string }>;
}

/**
 * Γράφει τη λίστα, ένα πακέτο τη φορά.
 *
 * Δεν σταματά στο πρώτο σφάλμα και δεν το κρύβει: ό,τι γράφτηκε γράφτηκε,
 * ό,τι απέτυχε μένει στη λίστα με τον λόγο του. Η αποτυχία ενός δεν πρέπει
 * ούτε να ακυρώνει τα άλλα ούτε να τα αφήνει να φαίνονται καταχωρημένα.
 */
export async function registerStaged(
  staged: ReadonlyArray<StagedPack>,
  receive: (pack: StagedPack) => Promise<unknown>
): Promise<RegisterResult> {
  const result: RegisterResult = { registered: [], failed: [] };
  for (const pack of staged) {
    try {
      await receive(pack);
      result.registered.push(pack);
    } catch (err: any) {
      result.failed.push({ pack, message: String(err?.message || 'Η καταχώρηση απέτυχε.') });
    }
  }
  return result;
}
