/**
 * When a shift is asked to inspect what the last one left.
 *
 * The επιθεώρηση started out as something every shift did at handover. That
 * is the right idea and the wrong shift. In the middle of a trading day there
 * is a transaction every few seconds; there is no moment when the drawer
 * holds a figure anybody could check a declaration against, and asking for
 * one produces a number typed to make the screen go away.
 *
 * The morning is the exception, and the reason is physical: the shop was
 * shut. Nothing moved between the night's count and the morning's, so the
 * two are comparable - and that is the only handover where they are.
 *
 * Hence a per-store setting rather than one rule for every shop. A quiet
 * store with a long lunch may well want it at every handover, and a store
 * that does not want it at all should not be nagged. FIRST_SHIFT_ONLY is the
 * default because it is how the agency actually runs.
 */

export type InspectionMode = 'FIRST_SHIFT_ONLY' | 'EVERY_SHIFT' | 'OFF';

export const DEFAULT_INSPECTION_MODE: InspectionMode = 'FIRST_SHIFT_ONLY';

export function normalizeInspectionMode(value: unknown): InspectionMode {
  return value === 'EVERY_SHIFT' || value === 'OFF' || value === 'FIRST_SHIFT_ONLY'
    ? value
    : DEFAULT_INSPECTION_MODE;
}

export interface InspectionOffer {
  /** The store's setting. Anything unrecognised reads as the default. */
  mode?: unknown;
  /**
   * Whether this shift is the day's first.
   *
   * Not «is it called MORNING»: a store that opens at 15:00 still has a first
   * shift, and a day with one shift has only a first. The opening screen
   * already knows this - a day opening exists only when some earlier shift
   * set it - so the same fact answers both questions.
   */
  isFirstOfDay: boolean;
}

export function shouldOfferInspection(offer: InspectionOffer): boolean {
  switch (normalizeInspectionMode(offer.mode)) {
    case 'OFF':
      return false;
    case 'EVERY_SHIFT':
      return true;
    case 'FIRST_SHIFT_ONLY':
      return offer.isFirstOfDay;
  }
}

/** For the Configurator, in the order an Owner would consider them. */
export const INSPECTION_MODE_OPTIONS: Array<{
  value: InspectionMode;
  label: string;
  hint: string;
}> = [
  {
    value: 'FIRST_SHIFT_ONLY',
    label: 'Μόνο στην πρώτη βάρδια της ημέρας',
    hint: 'Το μαγαζί ήταν κλειστό, οπότε το ταμείο είναι ακριβώς όπως το άφησε το βράδυ. Στις ενδιάμεσες παραδόσεις δεν ζητείται.',
  },
  {
    value: 'EVERY_SHIFT',
    label: 'Σε κάθε παράδοση βάρδιας',
    hint: 'Για καταστήματα που έχουν χρόνο να μετρήσουν το ταμείο σε κάθε αλλαγή.',
  },
  {
    value: 'OFF',
    label: 'Καθόλου',
    hint: 'Δεν ζητείται επιθεώρηση πουθενά.',
  },
];
