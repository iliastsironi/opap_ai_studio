/**
 * Σε τι μετριέται κάθε λαχείο, όλα μαζί σε ένα σημείο.
 *
 * The unit was answered in three different places and three different
 * shapes: a boolean column per seasonal edition, laiko_selling_mode for the
 * Λαϊκό, and the Εθνικό pinned in code. A column per game does not scale -
 * the catalogue is editable, so a shop can add a lottery nobody wrote a
 * column for - and three shapes meant three screens, which is how «την έχω
 * σε πεντάδες και μετράει σε κομμάτια» survived as long as it did.
 *
 * One map, keyed by the row's own id, holding the shop's answer for every
 * lottery it sells:
 *
 *   BUNDLES  μόνο πεντάδες - one column, price per πεντάδα
 *   PIECES   μόνο κομμάτια - one column, price per κομμάτι
 *   DUAL     και τα δύο - the Λαϊκό's existing mode, kept because it is
 *            genuinely sold both ways
 *
 * Unknown ids and unknown values fall back through the legacy settings and
 * then to the game's own packaging, so a shop that has never opened this
 * screen keeps exactly what it had.
 */

export type LotteryUnit = 'BUNDLES' | 'PIECES' | 'DUAL';

export const LOTTERY_UNITS: ReadonlyArray<LotteryUnit> = ['BUNDLES', 'PIECES', 'DUAL'];

export function normalizeLotteryUnit(value: unknown): LotteryUnit | null {
  return value === 'BUNDLES' || value === 'PIECES' || value === 'DUAL' ? value : null;
}

/** The settings this replaces, for a template nobody has resaved yet. */
export interface LegacyUnitSettings {
  special_edition_x5_bundles?: unknown;
  special_edition_x10_bundles?: unknown;
  protochroniatiko_bundles?: unknown;
  laiko_selling_mode?: unknown;
}

const LEGACY_BY_ROW: Record<string, keyof LegacyUnitSettings> = {
  scr_eidiki_x5: 'special_edition_x5_bundles',
  scr_eidiki_x10: 'special_edition_x10_bundles',
  scr_protochroniatiko: 'protochroniatiko_bundles',
};

/**
 * What this shop counts this lottery in.
 *
 * The map wins; then whatever the old per-game setting said; then the row's
 * own packaging - a game that comes in fives is counted in fives until
 * somebody says otherwise, and one that does not is counted in pieces.
 */
export function unitFor(
  rowId: unknown,
  map: Record<string, unknown> | null | undefined,
  legacy?: LegacyUnitSettings | null,
  bundleSize?: unknown
): LotteryUnit {
  const id = String(rowId ?? '');

  const explicit = normalizeLotteryUnit(map?.[id]);
  if (explicit) return explicit;

  if (id === 'scr_laiko') {
    return legacy?.laiko_selling_mode === 'BUNDLES_ONLY' ? 'BUNDLES' : 'DUAL';
  }

  const legacyKey = LEGACY_BY_ROW[id];
  if (legacyKey && legacy && legacyKey in legacy) {
    // The old columns were «true = πεντάδες», and only an explicit false
    // meant pieces.
    return legacy[legacyKey] === false ? 'PIECES' : 'BUNDLES';
  }

  const packaged = Number(bundleSize);
  return Number.isFinite(packaged) && packaged > 0 ? 'DUAL' : 'PIECES';
}

/**
 * What bundleSize a unit means, for a row that genuinely comes in bundles.
 *
 * NEVER invents one. A bundleSize above zero says «this row's price is per
 * PIECE and a bundle is this many of them» - which is true of the Λαϊκό
 * (2 € × 5 = 10 €) and of nothing else in the catalogue. The Ειδικές and the
 * Πρωτοχρονιάτικο are single tickets with a single price, and the Εθνικό's
 * 20 € IS the πεντάδα.
 *
 * Defaulting to 5 here turned a 5 € ticket into a 25 € «πεντάδα» and the
 * Εθνικό's 20 € into 100 €. The unit a shop counts in is a label on the
 * price; it must never multiply it.
 */
export function bundleSizeForUnit(unit: LotteryUnit, packaged?: unknown): number {
  if (unit === 'PIECES') return 0;
  const n = Number(packaged);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** One column, price per πεντάδα. */
export function isBundlesOnly(unit: LotteryUnit): boolean {
  return unit === 'BUNDLES';
}

export function withUnit(
  map: Record<string, unknown> | null | undefined,
  rowId: string,
  unit: LotteryUnit
): Record<string, LotteryUnit> {
  const next: Record<string, LotteryUnit> = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    const u = normalizeLotteryUnit(v);
    if (u) next[k] = u;
  }
  next[rowId] = unit;
  return next;
}

export const LOTTERY_UNIT_OPTIONS: Array<{ value: LotteryUnit; label: string }> = [
  { value: 'BUNDLES', label: 'πεντάδες' },
  { value: 'PIECES', label: 'κομμάτια' },
  { value: 'DUAL', label: 'και τα δύο' },
];
