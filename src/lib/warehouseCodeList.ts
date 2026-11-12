/**
 * Ποιοι κωδικοί υπάρχουν - όλοι, μαζί, σε μια ματιά.
 *
 * Τα λόγια του ιδιοκτήτη: «στην αποθήκη απλά να ξέρω ποιοι κωδικοί
 * υπάρχουν». Υπήρχαν ήδη όλοι στην οθόνη, αλλά ποτέ ταυτόχρονα: η λίστα
 * φιλτράρει ΜΙΑ θέση τη φορά (στην αποθήκη / προς παράδοση / στο μαγαζί /
 * αποσυρμένα), οπότε για να απαντήσει κανείς «τον έχω ήδη περάσει αυτόν
 * τον κωδικό;» έπρεπε να γυρίσει τέσσερις καρτέλες και να θυμάται.
 *
 * Η ομαδοποίηση γίνεται ανά ΠΑΙΧΝΙΔΙ και όχι ανά κωδικό, γιατί ο κωδικός
 * δεν είναι ταυτότητα: το 1234567 υπάρχει σε δέκα παιχνίδια. Ανά παιχνίδι
 * είναι και ο τρόπος που ρωτιέται στην πράξη - κρατάς ένα πακέτο ΓΑΤΑ στο
 * χέρι και θέλεις να ξέρεις τι ΓΑΤΑ υπάρχουν ήδη.
 */

export interface CodePack {
  pack_code?: unknown;
  game_name?: unknown;
  game_no?: unknown;
  catalog_code?: unknown;
  status?: unknown;
  unit_price?: unknown;
}

export interface GameCodes {
  /** Ο κωδικός καταλόγου - η πραγματική ταυτότητα του παιχνιδιού. */
  key: string;
  gameNo: string;
  /** «ΓΑΤΑ 2€», όπως διαβάζεται. */
  label: string;
  codes: CodeEntry[];
}

export interface CodeEntry {
  code: string;
  status: string;
  /**
   * Ο ίδιος κωδικός δύο φορές στο ΙΔΙΟ παιχνίδι.
   *
   * Δύο πακέτα του ίδιου παιχνιδιού με τον ίδιο κωδικό δεν ξεχωρίζουν από
   * τίποτα - ούτε από την οθόνη, ούτε από την πρόοδο πώλησης, ούτε από
   * εκείνον που θα διαλέξει ποιο να σβήσει. Σημειώνεται γιατί είναι το
   * μόνο σημείο όπου η λίστα μπορεί να το πει.
   */
  repeated: boolean;
}

const str = (v: unknown): string => String(v ?? '').trim();

/** Η σειρά που περπατάει ένα πακέτο, ώστε η λίστα να διαβάζεται σαν διαδρομή. */
const ORDER: Record<string, number> = {
  IN_WAREHOUSE: 0,
  PENDING_DELIVERY: 1,
  IN_STORE: 2,
  WITHDRAWN: 3,
};

export function codesByGame(packs: ReadonlyArray<CodePack> | null | undefined): GameCodes[] {
  const games = new Map<string, GameCodes>();

  for (const pack of packs ?? []) {
    const code = str(pack?.pack_code);
    if (code === '') continue;
    // Το παιχνίδι ξεχωρίζει από τον κωδικό καταλόγου· το όνομα μόνο δεν
    // αρκεί, γιατί «ΓΑΤΑ» λέγονται τέσσερα παιχνίδια με άλλη τιμή.
    const key = str(pack?.catalog_code) || str(pack?.game_no) || str(pack?.game_name);
    if (key === '') continue;

    const price = Number(pack?.unit_price);
    const name = str(pack?.game_name) || key;
    // Η τιμή μπαίνει για να ξεχωρίζει η ΓΑΤΑ 2€ από τη ΓΑΤΑ 5€ - αλλά
    // μερικά ονόματα την κουβαλάνε ήδη («Δώρο 5€»), και η προσθήκη έβγαζε
    // «Δώρο 5€ 5€». Μπαίνει μόνο όταν λείπει.
    const hasPrice = Number.isFinite(price) && price > 0;
    const label =
      hasPrice && !name.includes(`${price}€`) ? `${name} ${price}€` : name;

    if (!games.has(key)) {
      games.set(key, { key, gameNo: str(pack?.game_no), label, codes: [] });
    }
    games.get(key)!.codes.push({ code, status: str(pack?.status), repeated: false });
  }

  const out = [...games.values()];
  for (const game of out) {
    const seen = new Map<string, number>();
    for (const entry of game.codes) seen.set(entry.code, (seen.get(entry.code) ?? 0) + 1);
    for (const entry of game.codes) entry.repeated = (seen.get(entry.code) ?? 0) > 1;
    game.codes.sort(
      (a, b) =>
        (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.code.localeCompare(b.code)
    );
  }
  // Ανά αριθμό παιχνιδιού: η ίδια σειρά που έχει και ο κατάλογος, ώστε το
  // μάτι να ξέρει πού να πάει.
  out.sort((a, b) => a.gameNo.localeCompare(b.gameNo) || a.label.localeCompare(b.label));
  return out;
}

/** Πόσοι κωδικοί υπάρχουν συνολικά - ο αριθμός που μπαίνει στον τίτλο. */
export function totalCodes(games: ReadonlyArray<GameCodes>): number {
  return games.reduce((acc, g) => acc + g.codes.length, 0);
}

/** Ο ίδιος κωδικός δύο φορές στο ίδιο παιχνίδι, οπουδήποτε στη λίστα. */
export function repeatedCodes(games: ReadonlyArray<GameCodes>): number {
  return games.reduce((acc, g) => acc + g.codes.filter((c) => c.repeated).length, 0);
}
