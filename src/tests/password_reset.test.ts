import { describe, expect, it } from 'vitest';
import { resetProblemText, resetTargetFor } from '../lib/passwordReset.ts';

describe('where a reset email can actually go', () => {
  it('accepts a real address', () => {
    expect(resetTargetFor('someone@example.com')).toEqual({
      email: 'someone@example.com',
      problem: null,
    });
  });

  // Supabase answers «sent» for an address it has never seen, so a typed
  // address that does not match the stored row produces a confirmation and no
  // email. Auth stores what toAuthEmail writes: trimmed and lower-cased.
  it('sends to the address Auth stores, not the one as typed', () => {
    expect(resetTargetFor('  Someone@Example.COM  ')).toEqual({
      email: 'someone@example.com',
      problem: null,
    });
  });

  it('refuses a staff handle, which has no mailbox behind it', () => {
    expect(resetTargetFor('γιώργος')).toEqual({ email: null, problem: 'STAFF_HANDLE' });
  });

  it('refuses a handle already written out at the staff domain', () => {
    expect(resetTargetFor('giorgos@staff.shiftledger.local').problem).toBe('STAFF_HANDLE');
  });

  it('refuses an empty box rather than asking Supabase about it', () => {
    expect(resetTargetFor('')).toEqual({ email: null, problem: 'EMPTY' });
    expect(resetTargetFor('   ')).toEqual({ email: null, problem: 'EMPTY' });
    expect(resetTargetFor(null)).toEqual({ email: null, problem: 'EMPTY' });
  });

  it('tells a handle holder who can help instead', () => {
    expect(resetProblemText('STAFF_HANDLE')).toContain('υπεύθυνο');
    expect(resetProblemText('EMPTY')).toContain('email');
  });
});
