import { describe, expect, it } from 'vitest';
import { VARIANTS, variantFor } from '../components/notifications/NotificationPopupHost.tsx';

// The database decides which notification types exist - its CHECK constraint
// has allowed INSPECTION_FLAG since 0036 - while this table is a separate list
// kept in step by hand. It was not, and the first INSPECTION_FLAG ever raised
// made the lookup undefined; reading .icon off it threw during render, above
// the error boundary, and every page went white for the person it was
// addressed to. They could not clear it either, because clearing it meant
// opening the app.
describe('a notification type the client does not know', () => {
  it('still resolves to something renderable', () => {
    const v = variantFor('SOMETHING_THE_DATABASE_ADDED_LATER');
    expect(v).toBeDefined();
    expect(v.icon).toBeDefined();
    expect(v.iconBox).toBeTruthy();
  });

  it('never returns undefined, whatever it is handed', () => {
    for (const type of ['', 'null', 'undefined', '0', 'constructor', '__proto__']) {
      expect(variantFor(type)?.icon).toBeDefined();
    }
  });

  it('knows the one that caused the outage', () => {
    expect(VARIANTS.INSPECTION_FLAG).toBeDefined();
    expect(variantFor('INSPECTION_FLAG')).toBe(VARIANTS.INSPECTION_FLAG);
  });

  it('still returns the real variant for a known type', () => {
    expect(variantFor('HANDOVER_MESSAGE')).toBe(VARIANTS.HANDOVER_MESSAGE);
    expect(variantFor('EMPLOYEE_CHARGE')).toBe(VARIANTS.EMPLOYEE_CHARGE);
  });

  it('gives every type the database allows an icon', () => {
    // The CHECK constraint in 0036, plus LOTTERY_CANCEL_REMINDER.
    for (const type of [
      'HANDOVER_MESSAGE', 'EMPLOYEE_CHARGE', 'SHORTAGE_ALERT',
      'INSPECTION_FLAG', 'LOTTERY_CANCEL_REMINDER',
    ]) {
      expect(VARIANTS[type as keyof typeof VARIANTS]).toBeDefined();
    }
  });
});
