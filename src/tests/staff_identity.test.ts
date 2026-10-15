import { describe, expect, it } from 'vitest';
import { STAFF_EMAIL_DOMAIN, displayIdentifier, isStaffHandle, toAuthEmail } from '../lib/staffIdentity.ts';

// Staff sign in with a username; Supabase Auth wants an email. This mapping is
// the whole bridge, so a mistake here locks every employee out at once.

describe('toAuthEmail', () => {
  it('turns a username into its staff handle', () => {
    expect(toAuthEmail('giorgos')).toBe(`giorgos@${STAFF_EMAIL_DOMAIN}`);
  });

  it('leaves a real email alone, so Owners and managers still sign in', () => {
    expect(toAuthEmail('owner@shiftledger.gr')).toBe('owner@shiftledger.gr');
  });

  it('is case- and whitespace-insensitive', () => {
    // Someone typing on a phone keyboard gets a capital first letter and a
    // trailing space for free; neither should be a failed login.
    expect(toAuthEmail('  Giorgos ')).toBe(`giorgos@${STAFF_EMAIL_DOMAIN}`);
    expect(toAuthEmail(' Owner@ShiftLedger.GR ')).toBe('owner@shiftledger.gr');
  });

  it('does not double up the domain if a handle is pasted back in', () => {
    const handle = `giorgos@${STAFF_EMAIL_DOMAIN}`;
    expect(toAuthEmail(handle)).toBe(handle);
  });
});

describe('isStaffHandle', () => {
  it('separates a login handle from a real mailbox', () => {
    expect(isStaffHandle(`giorgos@${STAFF_EMAIL_DOMAIN}`)).toBe(true);
    expect(isStaffHandle('owner@shiftledger.gr')).toBe(false);
    expect(isStaffHandle(null)).toBe(false);
  });

  it('ignores case, since Supabase lowercases addresses on its own', () => {
    expect(isStaffHandle(`Giorgos@${STAFF_EMAIL_DOMAIN.toUpperCase()}`)).toBe(true);
  });
});

describe('displayIdentifier', () => {
  it('shows staff their username, never the invented domain', () => {
    expect(displayIdentifier(`giorgos@${STAFF_EMAIL_DOMAIN}`)).toBe('giorgos');
  });

  it('shows everyone else their actual address', () => {
    expect(displayIdentifier('owner@shiftledger.gr')).toBe('owner@shiftledger.gr');
  });

  it('survives a missing address', () => {
    expect(displayIdentifier(undefined)).toBe('');
  });
});
