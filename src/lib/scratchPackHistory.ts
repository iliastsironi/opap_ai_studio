/**
 * Opening a scratch pack, and taking it back.
 *
 * Opening one rewrites most of a row at once: the tail of the finished pack
 * becomes sales, the serial numbers restart, the sale boxes clear and the new
 * code is stamped on. A wrong code or a mis-click therefore cannot be undone
 * by retyping - by then the row no longer holds what it had.
 *
 * So each opening records what it overwrote, and undoing restores that
 * snapshot exactly. A stack rather than a single step, because somebody who
 * opened the wrong pack twice should not be stuck after the first undo.
 *
 * The snapshot is small and bounded - a handful of short strings per pack
 * opened in one shift - and travels with the row into the shift's saved
 * figures, so an undo still works after the draft is reloaded.
 */

export interface PackSnapshot {
  startNo: string;
  endNo: string;
  backStartNo: string;
  backEndNo: string;
  saleBundles: string;
  salePieces: string;
  packCode: string;
  isNewPack: boolean;
  closedPackQty: number;
  closedPackCodes: string[];
}

export interface PackHistoryEntry {
  /** The code entered when this pack was opened. */
  code: string;
  /** Tickets the finished pack contributed, for the message before undoing. */
  addedQty: number;
  /** The row as it stood immediately before. */
  previous: PackSnapshot;
}

export interface PackRow {
  startNo?: string;
  endNo?: string;
  backStartNo?: string;
  backEndNo?: string;
  saleBundles?: string;
  salePieces?: string;
  packCode?: string;
  isNewPack?: boolean;
  closedPackQty?: number;
  closedPackCodes?: string[];
  packHistory?: PackHistoryEntry[];
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
const qty = (v: unknown): number => Math.max(0, Number(v) || 0);

function snapshot(row: PackRow): PackSnapshot {
  return {
    startNo: str(row.startNo),
    endNo: str(row.endNo),
    backStartNo: str(row.backStartNo),
    backEndNo: str(row.backEndNo),
    saleBundles: str(row.saleBundles),
    salePieces: str(row.salePieces),
    packCode: str(row.packCode),
    isNewPack: !!row.isNewPack,
    closedPackQty: qty(row.closedPackQty),
    closedPackCodes: [...(row.closedPackCodes ?? [])],
  };
}

export interface OpenPackInput {
  /** The code of the pack being opened. */
  code: string;
  /** Tickets the finished pack still owed, all of them sold. */
  soldOut: number;
  /** Where the new pack's numbering begins. */
  startNo: string;
  /** The new pack's back-side baseline, when the row has one. */
  backEndNo?: string;
}

export function openPack<T extends PackRow>(row: T, input: OpenPackInput): T {
  const before = snapshot(row);
  const added = qty(input.soldOut);

  return {
    ...row,
    closedPackQty: before.closedPackQty + added,
    // The code of the pack just finished, so the chain of packs survives
    // until there is a warehouse to join it to. A row opened for the first
    // time has no previous code and contributes nothing.
    closedPackCodes: [...before.closedPackCodes, before.packCode].filter((c) => c !== ''),
    packCode: input.code.trim(),
    startNo: input.startNo,
    endNo: '',
    backEndNo: str(input.backEndNo),
    backStartNo: '',
    saleBundles: '',
    salePieces: '',
    isNewPack: true,
    packHistory: [...(row.packHistory ?? []), { code: input.code.trim(), addedQty: added, previous: before }],
  };
}

/** What undoing would take back, for saying so before it happens. */
export function lastPackOpened(row: PackRow): PackHistoryEntry | null {
  const history = row.packHistory ?? [];
  return history.length === 0 ? null : history[history.length - 1];
}

export function canUndoPack(row: PackRow): boolean {
  return (row.packHistory ?? []).length > 0;
}

/**
 * The row exactly as it stood before the last pack was opened.
 *
 * Restores from the snapshot rather than recomputing: subtracting the added
 * quantity back out would leave the serial numbers wherever the new pack had
 * reached, which is not where the row was.
 */
export function undoLastPack<T extends PackRow>(row: T): T {
  const history = row.packHistory ?? [];
  if (history.length === 0) return row;

  const { previous } = history[history.length - 1];
  return {
    ...row,
    startNo: previous.startNo,
    endNo: previous.endNo,
    backStartNo: previous.backStartNo,
    backEndNo: previous.backEndNo,
    saleBundles: previous.saleBundles,
    salePieces: previous.salePieces,
    packCode: previous.packCode,
    isNewPack: previous.isNewPack,
    closedPackQty: previous.closedPackQty,
    closedPackCodes: [...previous.closedPackCodes],
    packHistory: history.slice(0, -1),
  };
}
