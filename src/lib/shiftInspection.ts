/**
 * Η επιθεώρηση: what the morning operator finds versus what the night
 * declared, and what that difference costs.
 *
 * Three sections, in the order the Owner described them: the cash float, the
 * coins, and the tickets. The tickets are both kinds - the ascending serial on
 * σκρατς and the remaining count on λαχεία - and they move in OPPOSITE
 * directions, which is the whole reason this is a module and not an inline
 * subtraction:
 *
 *   σκρατς  count UP through a pack. The night declared it ended at 55; the
 *           morning finds 56. One more position has been consumed than was
 *           declared, so one ticket is unaccounted for.
 *   λαχεία  count DOWN - they are a remaining stock. The night declared 20
 *           left; the morning finds 19. One fewer remains than was declared,
 *           so again one ticket is unaccounted for.
 *
 * Getting the sign backwards on either would charge somebody for a ticket they
 * sold correctly, or let a missing one through unnoticed.
 *
 * A surplus is never a credit, in any section. More cash or more tickets than
 * declared is a miscount somewhere, not money owed to the night operator -
 * the same rule the discrepancy ledger already follows.
 */

export type InspectionKind = 'CASH' | 'COINS' | 'SCRATCH' | 'LOTTERY';

export interface InspectionLine {
  key: string;
  label: string;
  kind: InspectionKind;
  /** Euro for CASH/COINS; a serial for SCRATCH; a count for LOTTERY. */
  expected: number;
  /** What the operator counted. null until they have entered it. */
  found: number | null;
  /** Ticket price, for the ticket kinds. Ignored for cash. */
  unitPrice?: number;
}

export interface LineFinding {
  /** Unaccounted-for units: euro for cash, tickets for the rest. */
  missingUnits: number;
  /** What those units cost. */
  shortfall: number;
  /** The operator entered something that differs from the declaration. */
  corrected: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

export function lineFinding(line: InspectionLine): LineFinding {
  if (line.found === null || line.found === undefined || Number.isNaN(Number(line.found))) {
    return { missingUnits: 0, shortfall: 0, corrected: false };
  }

  const expected = num(line.expected);
  const found = num(line.found);
  const corrected = round2(found) !== round2(expected);

  // Which direction means «a unit is missing» depends on what is being
  // counted. See the header.
  const missingUnits = (() => {
    switch (line.kind) {
      case 'CASH':
      case 'COINS':
      case 'LOTTERY':
        // Less than declared is missing.
        return Math.max(0, round2(expected - found));
      case 'SCRATCH':
        // Further through the pack than declared is missing.
        return Math.max(0, round2(found - expected));
    }
  })();

  const unit = line.kind === 'CASH' || line.kind === 'COINS'
    ? 1
    : Math.max(0, num(line.unitPrice));

  return { missingUnits, shortfall: round2(missingUnits * unit), corrected };
}

export interface InspectionSummary {
  shortfall: number;
  /** Lines the operator changed, whichever direction. */
  correctedKeys: string[];
  /** Lines with something actually missing. */
  shortKeys: string[];
  /** Every line has a figure entered. */
  complete: boolean;
}

export function summariseInspection(lines: InspectionLine[]): InspectionSummary {
  let shortfall = 0;
  const correctedKeys: string[] = [];
  const shortKeys: string[] = [];
  let complete = true;

  for (const line of lines) {
    if (line.found === null || line.found === undefined) complete = false;
    const f = lineFinding(line);
    shortfall = round2(shortfall + f.shortfall);
    if (f.corrected) correctedKeys.push(line.key);
    if (f.shortfall > 0) shortKeys.push(line.key);
  }

  return { shortfall, correctedKeys, shortKeys, complete };
}

/**
 * What to send as the RPC's p_status.
 *
 * FLAGGED only when money or tickets are actually missing. A correction that
 * costs nothing - the night wrote 54 where the drawer says 53, so a ticket was
 * NOT sold - is still a correction worth recording, but there is nothing to
 * charge, and raising a charge of 0 would be refused by the amount > 0 check
 * on employee_charges anyway.
 */
export function inspectionStatusFor(summary: InspectionSummary): 'OK' | 'FLAGGED' {
  return summary.shortfall > 0 ? 'FLAGGED' : 'OK';
}
