import { describe, expect, it } from 'vitest';
import {
  canDeleteShift, closedShiftWarning, deleteShiftLabel, isDraftStatus,
} from '../lib/shiftDeletePermission.ts';

describe('ποιος σβήνει πρόχειρη βάρδια', () => {
  it('όποιος μπορεί και στη βάση', () => {
    for (const role of ['ORG_OWNER', 'PLATFORM_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER', 'ORG_ADMIN']) {
      expect(canDeleteShift([role], 'OPEN')).toBe(true);
    }
  });

  it('ο SHIFT_LEADER όχι — η βάση τον αρνείται', () => {
    // Το κουμπί του εμφανιζόταν και απέτυχε κάθε φορά.
    expect(canDeleteShift(['SHIFT_LEADER'], 'OPEN')).toBe(false);
    expect(canDeleteShift(['EMPLOYEE'], 'DRAFT_CLOSING')).toBe(false);
  });
});

describe('ποιος σβήνει κλεισμένη βάρδια', () => {
  it('μόνο ιδιοκτησία και διοίκηση', () => {
    for (const status of ['SUBMITTED', 'APPROVED']) {
      expect(canDeleteShift(['ORG_OWNER'], status)).toBe(true);
      expect(canDeleteShift(['ORG_ADMIN'], status)).toBe(true);
      expect(canDeleteShift(['PLATFORM_ADMIN'], status)).toBe(true);
    }
  });

  it('ο υπεύθυνος καταστήματος καθαρίζει πρόχειρα, δεν σβήνει εγκεκριμένα', () => {
    expect(canDeleteShift(['STORE_MANAGER'], 'OPEN')).toBe(true);
    expect(canDeleteShift(['STORE_MANAGER'], 'APPROVED')).toBe(false);
    expect(canDeleteShift(['AREA_MANAGER'], 'SUBMITTED')).toBe(false);
  });

  it('άγνωστη κατάσταση μετριέται ως κλεισμένη', () => {
    expect(canDeleteShift(['STORE_MANAGER'], 'ΚΑΤΙ_ΑΛΛΟ')).toBe(false);
    expect(canDeleteShift(['ORG_OWNER'], undefined)).toBe(true);
  });

  it('χωρίς ρόλο, τίποτα', () => {
    expect(canDeleteShift([], 'OPEN')).toBe(false);
    expect(canDeleteShift(null, 'OPEN')).toBe(false);
  });
});

describe('τι λέει το κουμπί και η προειδοποίηση', () => {
  it('«Προχείρου» μόνο όταν είναι πρόχειρη', () => {
    expect(deleteShiftLabel('OPEN')).toBe('Διαγραφή Προχείρου');
    expect(deleteShiftLabel('APPROVED')).toBe('Διαγραφή Βάρδιας');
  });

  it('καμία προειδοποίηση σε πρόχειρη — αλλιώς δεν διαβάζεται ποτέ', () => {
    expect(closedShiftWarning('OPEN')).toBeNull();
    expect(isDraftStatus('REOPENED')).toBe(true);
  });

  it('η εγκεκριμένη λέει ότι τα ποσά έχουν περάσει σε αναφορές', () => {
    expect(closedShiftWarning('APPROVED')).toContain('αναφορές');
    expect(closedShiftWarning('SUBMITTED')).toContain('υποβληθεί');
  });
});
