import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

/**
 * Ο πίνακας της βραδινής, ζωγραφισμένος με την πρωινή δίπλα του.
 *
 * Το lib κρίνεται στο earlier_shift_floor.test.ts. Εδώ κρίνεται το καλώδιο:
 * ότι ο κανόνας φτάνει στη γραμμή που βλέπει ο υπάλληλος, ως μήνυμα πάνω
 * στη γραμμή και ως ειδοποίηση πάνω από τον πίνακα.
 */
vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ roles: [{ code: 'EMPLOYEE' }], permissions: ['store.view'] }),
}));

const { ScratchCalculatorTable } = await import('../components/shifts/ScratchCalculatorTable');

const SEPTARI = { id: 'scr_7ari_5', name: '7ΑΡΙ 5€', category: 'Σκρατς 5€', kind: 'SCRATCH' as const, price: 5, startNo: '1' };
const GATA = { id: 'scr_gata_2', name: 'ΓΑΤΑ 2€', category: 'Σκρατς 2€', kind: 'SCRATCH' as const, price: 2, startNo: '10' };

const draw = (rows: unknown[], earlierShiftRows: unknown) =>
  renderToStaticMarkup(
    React.createElement(ScratchCalculatorTable as never, {
      rows, onChangeRows: () => {}, sellingMode: 'FRONT_ONLY', earlierShiftRows,
    } as never)
  );

describe('η βραδινή με την πρωινή δίπλα', () => {
  const morning = [{ ...SEPTARI, endNo: '5' }, { ...GATA, endNo: '14' }];

  it('δείχνει το μήνυμα στη γραμμή και την ειδοποίηση πάνω από τον πίνακα', () => {
    const html = draw([{ ...SEPTARI, endNo: '3' }, { ...GATA, endNo: '16' }], morning);
    expect(html).toContain('Λιγότερες πωλήσεις από την προηγούμενη βάρδια (1 παιχνίδι)');
    expect(html).toContain('Δεν γίνεται: γράφεις 2 τεμ.');          // η βραδινή: 3 − 1
    expect(html).toContain('η προηγούμενη βάρδια έχει ήδη πουλήσει περισσότερα');
  });

  /** Ο υπάλληλος δεν βλέπει τι πούλησε ο προηγούμενος: ούτε στη γραμμή, ούτε στην ειδοποίηση. */
  it('πουθενά στην οθόνη δεν γράφεται η ποσότητα της πρωινής', () => {
    const html = draw([{ ...SEPTARI, endNo: '3' }, { ...GATA, endNo: '16' }], [{ ...SEPTARI, endNo: '27' }, { ...GATA, endNo: '14' }]);   // πρωί: 26
    expect(html).toContain('Δεν γίνεται');
    expect(html).not.toContain('26 τεμ.');
  });

  it('η ειδοποίηση ονομάζει το παιχνίδι που φταίει και ΜΟΝΟ αυτό', () => {
    const html = draw([{ ...SEPTARI, endNo: '3' }, { ...GATA, endNo: '16' }], morning);
    const banner = html.slice(html.indexOf('Λιγότερες πωλήσεις από την προηγούμενη βάρδια'));
    expect(banner.slice(0, 400)).toContain('7ΑΡΙ 5€');
    expect(banner.slice(0, 400)).not.toContain('ΓΑΤΑ 2€');
  });

  it('ίδια ή περισσότερα πουλημένα: καμία ειδοποίηση', () => {
    const html = draw([{ ...SEPTARI, endNo: '5' }, { ...GATA, endNo: '20' }], morning);
    expect(html).not.toContain('Λιγότερες πωλήσεις από την προηγούμενη βάρδια');
    expect(html).not.toContain('Δεν γίνεται');
  });

  it('βραδινή που μόλις άνοιξε (κενά τελικά): καμία ειδοποίηση', () => {
    const html = draw([{ ...SEPTARI, endNo: '' }, { ...GATA, endNo: '' }], morning);
    expect(html).not.toContain('Λιγότερες πωλήσεις από την προηγούμενη βάρδια');
  });

  it('χωρίς προηγούμενη βάρδια ο πίνακας δουλεύει όπως πάντα', () => {
    const html = draw([{ ...SEPTARI, endNo: '3' }], null);
    expect(html).toContain('7ΑΡΙ 5€');
    expect(html).not.toContain('Λιγότερες πωλήσεις από την προηγούμενη βάρδια');
  });
});
