import { describe, expect, it } from 'vitest';
import { lockScratchRowsForSave, ScratchTicketRow } from '../components/shifts/ScratchCalculatorTable.tsx';

// trg_enforce_scratch_field_locks (0006/0007/0008) refuses the WHOLE shift
// update with 42501 when a non-elevated user sends a startNo/backEndNo that
// differs from the stored one for an existing row (matched by id). The wizard
// used to send whatever its mount-time merge produced, so an employee could be
// blocked - silently - without ever touching a locked field.

const row = (fields: Partial<ScratchTicketRow> & { id: string }): ScratchTicketRow => ({
  name: `Παιχνίδι ${fields.id}`,
  price: 2,
  startNo: '',
  endNo: '',
  ...fields,
});

describe('lockScratchRowsForSave', () => {
  it('restores a stored numeric 0 that the merge turned into an empty string', () => {
    const stored = [{ id: 'scr_1', startNo: 0, backEndNo: 199 }];
    const [saved] = lockScratchRowsForSave([row({ id: 'scr_1', startNo: '', backEndNo: '' })], stored, false);

    expect(saved.startNo).toBe('0');
    expect(saved.backEndNo).toBe('199');
  });

  it('restores locked values the local catalog overwrote', () => {
    const stored = [{ id: 'scr_1', startNo: '045', backEndNo: '150' }];
    const [saved] = lockScratchRowsForSave([row({ id: 'scr_1', startNo: '000', backEndNo: '200' })], stored, false);

    expect(saved.startNo).toBe('045');
    expect(saved.backEndNo).toBe('150');
  });

  it('keeps every editable field exactly as the user entered it', () => {
    const stored = [{ id: 'scr_1', startNo: '010', backEndNo: '150' }];
    const [saved] = lockScratchRowsForSave(
      [row({ id: 'scr_1', startNo: '999', endNo: '042', backStartNo: '120', backEndNo: '999', manualQty: '7' })],
      stored,
      false
    );

    expect(saved.endNo).toBe('042');
    expect(saved.backStartNo).toBe('120');
    expect(saved.manualQty).toBe('7');
    expect(saved.startNo).toBe('010');
    expect(saved.backEndNo).toBe('150');
  });

  it('leaves a brand new row alone - the trigger does not lock rows it has never seen', () => {
    const stored = [{ id: 'scr_1', startNo: '010' }];
    const saved = lockScratchRowsForSave(
      [row({ id: 'scr_1', startNo: '' }), row({ id: 'scr_new', startNo: '500', backEndNo: '600' })],
      stored,
      false
    );

    expect(saved[0].startNo).toBe('010');
    expect(saved[1].startNo).toBe('500');
    expect(saved[1].backEndNo).toBe('600');
  });

  it('lets an elevated user change locked fields, which is the whole point of the lock', () => {
    const stored = [{ id: 'scr_1', startNo: '010', backEndNo: '150' }];
    const [saved] = lockScratchRowsForSave([row({ id: 'scr_1', startNo: '000', backEndNo: '200' })], stored, true);

    expect(saved.startNo).toBe('000');
    expect(saved.backEndNo).toBe('200');
  });

  it('passes rows through untouched when the shift has no stored scratch items yet', () => {
    const rows = [row({ id: 'scr_1', startNo: '010' })];

    expect(lockScratchRowsForSave(rows, undefined, false)).toEqual(rows);
    expect(lockScratchRowsForSave(rows, [], false)).toEqual(rows);
    expect(lockScratchRowsForSave(rows, 'not-an-array', false)).toEqual(rows);
  });

  // AuthContext seeds roles with ORG_OWNER and permissions with '*' before the
  // real profile loads, so an employee briefly looks elevated. The wizard gates
  // on !isAuthLoading for that reason; this pins the helper's half of the
  // contract - "not elevated" must always mean "echo the stored value".
  it('protects the save whenever the caller cannot prove elevation yet', () => {
    const stored = [{ id: 'scr_1', startNo: 0, backEndNo: '199' }];
    const drifted = [row({ id: 'scr_1', startNo: '', backEndNo: '', endNo: '042' })];

    const [pending] = lockScratchRowsForSave(drifted, stored, false);
    expect(pending.startNo).toBe('0');
    expect(pending.backEndNo).toBe('199');
    expect(pending.endNo).toBe('042');
  });

  it('leaves a stored null alone so 0007 null-vs-empty handling still applies', () => {
    const stored = [{ id: 'scr_1', startNo: null, backEndNo: null }];
    const [saved] = lockScratchRowsForSave([row({ id: 'scr_1', startNo: '', backEndNo: '' })], stored, false);

    expect(saved.startNo).toBe('');
    expect(saved.backEndNo).toBe('');
  });
});
