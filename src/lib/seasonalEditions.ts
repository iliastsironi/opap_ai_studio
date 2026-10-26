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
  },
  {
    rowId: 'scr_eidiki_x10',
    label: 'Ειδική Έκδοση x10',
    settingKey: 'special_edition_x10_enabled',
  },
  {
    rowId: 'scr_protochroniatiko',
    label: 'Πρωτοχρονιάτικο',
    settingKey: 'protochroniatiko_enabled',
  },
] as const;

export type SeasonalEdition = (typeof SEASONAL_EDITIONS)[number];
export type SeasonalSettingKey = SeasonalEdition['settingKey'];

/** Πεντάδες. Changeable per row, per shift, by whoever is counting. */
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

/** The seasonal rows to hide, given a store's configuration. */
export function hiddenSeasonalRowIds(
  config: Record<string, unknown> | null | undefined
): string[] {
  return SEASONAL_EDITIONS.filter((e) => !isSeasonalEditionEnabled(e.rowId, config)).map(
    (e) => e.rowId
  );
}
