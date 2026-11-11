import { describe, it, expect } from 'vitest';
import { warehouseStartState } from '../lib/warehouseHandover';

/**
 * «Φτιάξε μου την αποθήκη για το 498, δεν είναι ενεργοποιημένη.»
 *
 * Η Στυλίδα έχει 0 πακέτα και 16 παιχνίδια με 4ψήφιο: δεν είναι χαλασμένη,
 * δεν έχει ξεκινήσει - και ξεκινά με την πρώτη καταχώρηση. Η Λαμία έχει 82
 * πακέτα και έχει ξεκινήσει από μέρες.
 */
describe('σε ποια φάση είναι η αποθήκη', () => {
  it('Στυλίδα: κανένα πακέτο, 16 παιχνίδια έτοιμα', () => {
    expect(warehouseStartState({ packCount: 0, gameCount: 16 })).toBe('READY_TO_START');
  });

  it('Λαμία: 82 πακέτα, έχει ξεκινήσει', () => {
    expect(warehouseStartState({ packCount: 82, gameCount: 18 })).toBe('STARTED');
  });

  /** Ένα μόνο πακέτο αρκεί, όπως και στο storeUsesWarehouse. */
  it('ένα πακέτο αρκεί για να έχει ξεκινήσει', () => {
    expect(warehouseStartState({ packCount: 1, gameCount: 1 })).toBe('STARTED');
  });

  /** Ακόμα κι αν το μόνο πακέτο αποσύρθηκε: η αποθήκη χρησιμοποιείται. */
  it('μετράει κάθε κατάσταση πακέτου, άρα και το αποσυρμένο', () => {
    expect(warehouseStartState({ packCount: 1, gameCount: 0 })).toBe('STARTED');
  });

  it('χωρίς 4ψήφιους δεν υπάρχει τι να παραληφθεί', () => {
    expect(warehouseStartState({ packCount: 0, gameCount: 0 })).toBe('NEEDS_GAME_NUMBERS');
  });
});
