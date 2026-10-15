import { describe, expect, it } from 'vitest';
import { isDemoAccountEmail } from '../context/AuthContext.tsx';

// Which addresses count as demo accounts decides who is placed into
// org_opap_demo instead of a tenant of their own. That organisation holds live
// financial records, so this is an access-control decision wearing the clothes
// of a string comparison.
//
// It used to be email.includes('opap.gr') || email.includes('shiftledger.gr'),
// which let a stranger walk in with an address they could register in a minute.

describe('demo account matching', () => {
  it('accepts exactly the three seeded accounts', () => {
    expect(isDemoAccountEmail('owner@shiftledger.gr')).toBe(true);
    expect(isDemoAccountEmail('manager@shiftledger.gr')).toBe(true);
    expect(isDemoAccountEmail('employee@shiftledger.gr')).toBe(true);
  });

  it('ignores case and surrounding whitespace, as Supabase lowercases addresses', () => {
    expect(isDemoAccountEmail('  Owner@ShiftLedger.GR ')).toBe(true);
  });

  it('refuses an address that merely contains a demo domain', () => {
    // Every one of these passed the old substring test, and every one of them
    // is registrable by anybody.
    expect(isDemoAccountEmail('opap.gr@gmail.com')).toBe(false);
    expect(isDemoAccountEmail('attacker@opap.gr.evil.com')).toBe(false);
    expect(isDemoAccountEmail('shiftledger.gr@outlook.com')).toBe(false);
    expect(isDemoAccountEmail('x@sub.shiftledger.gr.co')).toBe(false);
  });

  it("refuses OPAP's own domain, which is not this application's demo org", () => {
    expect(isDemoAccountEmail('someone@opap.gr')).toBe(false);
  });

  it('refuses a different mailbox at a demo domain', () => {
    // Only the three seeded accounts belong to the demo organisation. A fourth
    // address there is a stranger and gets a tenant of their own.
    expect(isDemoAccountEmail('accountant@shiftledger.gr')).toBe(false);
  });

  it('refuses an empty or malformed address rather than defaulting to true', () => {
    expect(isDemoAccountEmail('')).toBe(false);
    expect(isDemoAccountEmail('not-an-email')).toBe(false);
  });

  it('cannot be fooled by a prototype key', () => {
    // The lookup is a plain object; without hasOwnProperty these would be truthy.
    expect(isDemoAccountEmail('constructor')).toBe(false);
    expect(isDemoAccountEmail('__proto__')).toBe(false);
    expect(isDemoAccountEmail('toString')).toBe(false);
  });
});
