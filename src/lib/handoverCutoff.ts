/**
 * «Just before this shift», for the handover lookup.
 *
 * shift_handover_snapshot takes a cutoff and returns the latest shift at the
 * till with `opened_at <= cutoff`. The shift-opening screen passes the start
 * time of a shift that does not exist yet, so the newest match is genuinely
 * the previous one.
 *
 * A screen asking on behalf of a shift that already exists cannot pass its
 * own start: the comparison is inclusive, so the newest match is the asking
 * shift itself. It then «inherits» its own blank figures and nothing
 * happens - which is exactly how the closing screen went on showing an empty
 * αρχικό for a game whose previous shift had left it at 29.
 *
 * A millisecond is enough and is not a guess: `opened_at` is the business
 * start time, recorded to the minute, so nothing legitimate sits inside that
 * gap. The caller still checks the shift id that comes back, because a
 * cutoff cannot express «not this one» and two rows could in principle share
 * a start.
 */

export function handoverCutoffBefore(openedAt: string | null | undefined): string | undefined {
  if (!openedAt) return undefined;
  const at = new Date(openedAt).getTime();
  if (!Number.isFinite(at)) return undefined;
  return new Date(at - 1).toISOString();
}

/** The snapshot is only a handover if it belongs to a different shift. */
export function isOwnShift(
  snapshotShiftId: string | null | undefined,
  currentShiftId: string | null | undefined
): boolean {
  return !!snapshotShiftId && !!currentShiftId && snapshotShiftId === currentShiftId;
}
