/**
 * Οι εποχικές εκδόσεις λαχείων, η καθεμία χωριστά.
 *
 * Ειδική Έκδοση x5, Ειδική Έκδοση x10 and Πρωτοχρονιάτικο were one switch
 * between them. They do not arrive together and they do not stop selling
 * together: the Πρωτοχρονιάτικο is on the counter for a few weeks around the
 * new year while the Ειδικές come and go on their own schedule. One switch
 * meant turning on the one you are selling also put the two you are not into
 * every operator's till list, which is the clutter the switch existed to
 * prevent.
 *
 * Counting defaults to πεντάδες. These are sold in fives far more often than
 * singly, and the operator can still change any row to pieces from its own
 * counting settings - the default is where a row starts, not where it has to
 * stay.
 */

export const SEASONAL_EDITIONS = [
  {
    rowId: 'scr_eidiki_x5',
    label: 'Ειδική Έκδοση x5',
    settingKey: 'special_edition_x5_enabled',
    unitKey: 'special_edition_x5_bundles',
  },
  {
    rowId: 'scr_eidiki_x10',
    label: 'Ειδική Έκδοση x10',
    settingKey: 'special_edition_x10_enabled',
    unitKey: 'special_edition_x10_bundles',
  },
  {
    rowId: 'scr_protochroniatiko',
    label: 'Πρωτοχρονιάτικο',
    settingKey: 'protochroniatiko_enabled',
    unitKey: 'protochroniatiko_bundles',
  },
] as const;

export type SeasonalEdition = (typeof SEASONAL_EDITIONS)[number];
export type SeasonalSettingKey = SeasonalEdition['settingKey'];
export type SeasonalUnitKey = SeasonalEdition['unitKey'];

/** Πεντάδες. The unit is the shop's own setting, made once in «Διαμόρφωση». */
export const SEASONAL_DEFAULT_BUNDLE_SIZE = 5;

const BY_ROW_ID = new Map<string, SeasonalEdition>(
  SEASONAL_EDITIONS.map((e) => [e.rowId, e])
);

export function isSeasonalEditionRow(rowId: unknown): boolean {
  return BY_ROW_ID.has(String(rowId ?? ''));
}

export function seasonalEditionFor(rowId: unknown): SeasonalEdition | undefined {
  return BY_ROW_ID.get(String(rowId ?? ''));
}

/**
 * Whether this particular edition is on the counter.
 *
 * Reads the row's OWN switch, then falls back to the single switch that used
 * to govern all three - so a store configured before they were split keeps
 * seeing exactly what it saw, until somebody sets one of the new ones.
 */
export function isSeasonalEditionEnabled(
  rowId: unknown,
  config: Record<string, unknown> | null | undefined
): boolean {
  const edition = seasonalEditionFor(rowId);
  if (!edition) return true; // not seasonal: this rule has nothing to say
  const own = config?.[edition.settingKey];
  if (typeof own === 'boolean') return own;
  return config?.special_edition_enabled === true;
}

/**
 * How this edition is counted: πεντάδες (5) or μεμονωμένα κομμάτια (0).
 *
 * The shop's own setting, one per edition, made once in «Διαμόρφωση» rather
 * than on the till row. It briefly lived on the row as a badge the operator
 * could press, which put a third control into a line that already carries
 * two numbers and two buttons - the Owner asked for it back where the rest
 * of the lottery settings are.
 *
 * Πεντάδες when nothing says otherwise: these are sold in fives far more
 * often than singly.
 */
export function seasonalBundleSizeFor(
  rowId: unknown,
  config: Record<string, unknown> | null | undefined
): number {
  const edition = seasonalEditionFor(rowId);
  if (!edition) return SEASONAL_DEFAULT_BUNDLE_SIZE;
  return config?.[edition.unitKey] === false ? 0 : SEASONAL_DEFAULT_BUNDLE_SIZE;
}

/** The seasonal rows to hide, given a store's configuration. */
export function hiddenSeasonalRowIds(
  config: Record<string, unknown> | null | undefined
): string[] {
  return SEASONAL_EDITIONS.filter((e) => !isSeasonalEditionEnabled(e.rowId, config)).map(
    (e) => e.rowId
  );
}
