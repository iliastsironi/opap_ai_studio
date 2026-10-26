/**
 * Ο τύπος του καταστήματος ορίζει πώς κλείνει το ταμείο του.
 *
 * A PLAY hall and an OPAP agency are not the same shop. The hall has no
 * scratch cards, no ΤΟΡΑ, no ιππόδρομος, no Πάμε Στοίχημα, no αριθμολαχεία -
 * it has machines, and a card terminal that closes its batch at midnight
 * while the hall stays open until four.
 *
 * All of that was already expressible: every one of these is a switch in
 * «Διαμόρφωση». But a new store's template was seeded from the OPAP default
 * whatever its type, so somebody who had just told the system «this is a PLAY
 * OPAP Store» was then asked to say the same thing again through ten
 * switches - and until they did, the hall's till looked exactly like the
 * agency's. The store type is the answer; it should not have to be given
 * twice.
 *
 * These are DEFAULTS for a store that has no template of its own yet. A shop
 * that has already configured itself keeps whatever it configured - this
 * never reaches back and overwrites a choice somebody made.
 */

import type { StoreType } from '../types/index.ts';

export type TemplateShape = 'OPAP' | 'PLAY';

export function templateShapeFor(storeType: unknown): TemplateShape {
  return storeType === 'PLAY_STORE' ? 'PLAY' : 'OPAP';
}

/**
 * What a PLAY hall's template differs on, and nothing else.
 *
 * Spread over the OPAP default rather than written out in full, so every
 * setting the two shops genuinely share - tolerances, float, shifts per day,
 * inspection - keeps following the one default and cannot drift.
 */
export const PLAY_TEMPLATE_OVERRIDES = {
  name: 'Πρότυπο Αναφοράς Βάρδιας (PLAY Store)',
  // The games an agency sells and a hall does not.
  show_scratch: false,
  show_national_lottery: false,
  show_tora: false,
  show_clever_point: false,
  show_ippodromos: false,
  show_pame_stoixima: false,
  show_number_games: false,
  // A hall that also runs a bar turns this back on; the Owner's own sheet
  // has no FnB section at all.
  show_fnb: false,
  // What the hall DOES have.
  show_vlts: true,
  // The terminal sends its batch at midnight and the hall shuts at four, so
  // the till is measured on the arithmetic rather than on one reading (0051).
  pos_batch_close_enabled: true,
  vlt_machine_cash_enabled: true,
  // The machines pay out more than they take, so the safe feeds the drawer
  // rather than the other way round (0058).
  safe_direction: 'WITHDRAW',
} as const;

/** The switches a PLAY hall turns off, for telling somebody what changed. */
export const PLAY_DISABLED_MODULES: ReadonlyArray<string> = [
  'show_scratch',
  'show_national_lottery',
  'show_tora',
  'show_clever_point',
  'show_ippodromos',
  'show_pame_stoixima',
  'show_number_games',
  'show_fnb',
];

export function overridesFor(storeType: StoreType | unknown): Record<string, unknown> {
  return templateShapeFor(storeType) === 'PLAY' ? { ...PLAY_TEMPLATE_OVERRIDES } : {};
}
