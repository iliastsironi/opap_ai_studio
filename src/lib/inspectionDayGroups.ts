/**
 * Μία κάρτα, μία ημέρα.
 *
 * The approval queue used to put every submitted shift in its own card, so a
 * single Saturday at one shop arrived as two or three separate things to
 * look at, sitting next to two or three from Friday. Nothing on screen said
 * which ones belonged together, and the manager had to read dates off three
 * cards to work that out.
 *
 * What actually happens is this: the manager inspects the day's LAST till,
 * and if that one balances nobody opens the earlier ones - the day's cash has
 * already passed through them. So the day is the unit of work, and the last
 * shift is its head. The earlier shifts stay separately inspectable, because
 * sometimes the last one does not balance and that is exactly when somebody
 * goes looking.
 *
 * The grouping key is store + register + Athens calendar day. Register is in
 * there because two tills in the same shop are two different piles of money
 * being handed over, not one; and the day comes from `opened_at`, the
 * business-day anchor used everywhere else, so a night shift opening at 23:00
 * belongs to the day it opened rather than the one it closed in.
 */

import { athensDateKey } from './pnlEngine.ts';
import { compareGreek } from './greekSort.ts';

/** Only what the grouping needs - any Shift satisfies it. */
export interface GroupableShift {
  id: string;
  store_id: string;
  store_name?: string;
  register_id: string;
  shift_type?: string;
  opened_at: string;
  discrepancy?: number | string | null;
}

export interface InspectionDayGroup<T extends GroupableShift = GroupableShift> {
  /** store | register | day - stable, usable as a React key. */
  key: string;
  storeId: string;
  storeName: string;
  registerId: string;
  /** 'YYYY-MM-DD' as Athens saw it. */
  day: string;
  /** Latest first: the one the manager opens is at the top. */
  shifts: T[];
  /** The day's last till, the one inspection normally stops at. */
  lastShift: T;
  /** The day's net, over every shift in the group. */
  totalDiscrepancy: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

export function shiftDayKey(shift: GroupableShift): string {
  return `${shift.store_id}|${shift.register_id}|${athensDateKey(shift.opened_at)}`;
}

/**
 * Groups into day cards, most recent day first.
 *
 * Ordering is by `opened_at` throughout rather than by shift_type, because a
 * shop running CUSTOM shifts has no morning/evening to sort by, and the clock
 * is the one thing every shift has.
 */
export function groupShiftsByDay<T extends GroupableShift>(
  shifts: T[] | null | undefined
): InspectionDayGroup<T>[] {
  const buckets = new Map<string, T[]>();

  for (const shift of shifts ?? []) {
    const key = shiftDayKey(shift);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(shift);
    else buckets.set(key, [shift]);
  }

  const groups: InspectionDayGroup<T>[] = [];

  for (const [key, bucket] of buckets) {
    const ordered = [...bucket].sort(
      (a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()
    );
    const head = ordered[0];
    groups.push({
      key,
      storeId: head.store_id,
      storeName: head.store_name ?? '',
      registerId: head.register_id,
      day: athensDateKey(head.opened_at),
      shifts: ordered,
      lastShift: head,
      totalDiscrepancy: round2(
        ordered.reduce((total, s) => total + num(s.discrepancy), 0)
      ),
    });
  }

  return groups.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    // Same day, two shops or two tills: keep them in a stable, readable order
    // instead of whatever the Map happened to hold.
    return (
      compareGreek(a.storeName, b.storeName) ||
      compareGreek(a.registerId, b.registerId)
    );
  });
}

const dayFormatter = new Intl.DateTimeFormat('el-GR', {
  // The key is already an Athens date, so it is formatted as the plain date it
  // is. Reading it in the machine's zone would shift it a day west of Greece.
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** '2026-10-23' -> «Παρασκευή 23 Οκτωβρίου» */
export function dayLabel(day: string): string {
  return dayFormatter.format(new Date(`${day}T00:00:00Z`));
}

export function shiftTypeLabel(type: string | undefined): string {
  return type === 'MORNING'
    ? 'Πρωινή'
    : type === 'AFTERNOON'
    ? 'Απογευματινή'
    : type === 'NIGHT'
    ? 'Βραδινή'
    : 'Βάρδια';
}

export function registerLabel(registerId: string): string {
  return registerId === 'REG-01' ? 'Ταμείο 1' : registerId;
}
