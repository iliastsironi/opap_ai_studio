/**
 * Τι μαζεύει ο υπεύθυνος όταν περνάει.
 *
 * The approval screen says what a shift counted. It did not say what
 * somebody has to physically pick up, and those are three different piles:
 *
 *   ο φάκελος        the notes above the float, at each close
 *   safe drop        cash moved to the safe mid-shift, already there
 *   τα κέρματα       a cup of coins, travelling beside the envelope
 *
 * Whoever walked in to collect added them up in their head, across every
 * shift of the day.
 *
 * By the Owner's rule the summary belongs on the day's LAST shift, because
 * that is when somebody comes round, and it covers the WHOLE day - both
 * envelopes, every safe drop, every cup. A shop collecting at each handover
 * can have it on every shift, where it then shows the day so far.
 *
 * The envelope is recomputed here through calculateEnvelope rather than read
 * from a stored total, because no such column exists and because the figure
 * the manager collects must be the one the operator was shown. Two
 * independent calculations of the same money is how they come to disagree.
 */

import { calculateEnvelope } from './shiftEnvelope.ts';

export type CollectionMode = 'LAST_SHIFT_ONLY' | 'EVERY_SHIFT';

export const DEFAULT_COLLECTION_MODE: CollectionMode = 'LAST_SHIFT_ONLY';

export function normalizeCollectionMode(value: unknown): CollectionMode {
  return value === 'EVERY_SHIFT' || value === 'LAST_SHIFT_ONLY'
    ? value
    : DEFAULT_COLLECTION_MODE;
}

export interface ShowCollection {
  mode?: unknown;
  /** Whether this shift is the last the day has on record. */
  isLastOfDay: boolean;
}

export function shouldShowCollection(input: ShowCollection): boolean {
  return normalizeCollectionMode(input.mode) === 'EVERY_SHIFT' || input.isLastOfDay;
}

/** One shift's raw figures, as shift_day_collection returns them. */
export interface CollectableShift {
  shift_id?: string;
  shift_type?: string;
  opened_at?: string;
  opened_by_user_name?: string | null;
  /** Counted notes and coins, already split. */
  notes?: number;
  coins?: number;
  /** The note portion of the float that stays behind, top-ups included. */
  floatNotes?: number;
  safe_drop?: number | string | null;
  coin_handover?: number | string | null;
}

export interface CollectionLine {
  shiftId: string;
  label: string;
  envelope: number;
  safeDrop: number;
  coins: number;
  total: number;
}

export interface CollectionSummary {
  lines: CollectionLine[];
  envelopes: number;
  safeDrops: number;
  coins: number;
  /** Everything to be picked up. */
  total: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

const shiftLabel = (s: CollectableShift): string => {
  const type = s.shift_type === 'MORNING' ? 'Πρωινή'
    : s.shift_type === 'AFTERNOON' ? 'Απογευματινή'
    : s.shift_type === 'NIGHT' ? 'Βραδινή'
    : 'Βάρδια';
  return s.opened_by_user_name ? `${type} — ${s.opened_by_user_name}` : type;
};

export function collectionSummary(
  shifts: CollectableShift[] | null | undefined
): CollectionSummary {
  const lines: CollectionLine[] = (shifts ?? []).map((s) => {
    const env = calculateEnvelope({
      countedNotes: num(s.notes),
      countedCoins: num(s.coins),
      floatNotes: num(s.floatNotes),
      coinHandover: s.coin_handover,
      safeDrops: s.safe_drop,
    });
    const safeDrop = round2(Math.max(0, num(s.safe_drop)));
    const coins = env.coinHandover;
    return {
      shiftId: String(s.shift_id ?? ''),
      label: shiftLabel(s),
      envelope: env.amount,
      safeDrop,
      coins,
      total: round2(env.amount + safeDrop + coins),
    };
  });

  const sum = (pick: (l: CollectionLine) => number) =>
    round2(lines.reduce((t, l) => t + pick(l), 0));

  return {
    lines,
    envelopes: sum((l) => l.envelope),
    safeDrops: sum((l) => l.safeDrop),
    coins: sum((l) => l.coins),
    total: sum((l) => l.total),
  };
}

/** For the Configurator, in the order an Owner would consider them. */
export const COLLECTION_MODE_OPTIONS: Array<{
  value: CollectionMode;
  label: string;
  hint: string;
}> = [
  {
    value: 'LAST_SHIFT_ONLY',
    label: 'Μόνο στην τελευταία βάρδια της ημέρας',
    hint: 'Εκεί που περνάει ο υπεύθυνος. Δείχνει τα ποσά όλης της ημέρας μαζί.',
  },
  {
    value: 'EVERY_SHIFT',
    label: 'Σε κάθε βάρδια',
    hint: 'Για κατάστημα που παραδίδει σε κάθε αλλαγή. Δείχνει την ημέρα μέχρι εκείνη τη βάρδια.',
  },
];
