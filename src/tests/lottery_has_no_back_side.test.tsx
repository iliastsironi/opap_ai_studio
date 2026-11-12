import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

/**
 * «Στα σκρατς έχει νόημα, στα λαχεία όχι.»
 *
 * Ένα πακέτο σκρατς είναι σειρά δελτίων με δύο άκρα και πουλάς από όποιο
 * βολεύει. Ένα λαχείο είναι απόθεμα μιας κλήρωσης - δεν έχει δεύτερο άκρο.
 * Το ταμείο όμως ζωγράφιζε Πίσω-Αρχικό και Πίσω-Τελικό στα λαχεία της
 * Στυλίδας, γιατί και τα 6 είχαν back_side_enabled = true γραμμένο στον
 * κατάλογο και η σημαία νικούσε το είδος.
 *
 * Ο κανόνας κρίνεται στο scratch_bundle.test.ts. Αυτό εδώ κρίνει το
 * ΚΑΛΩΔΙΟ: ότι η γραμμή που ζωγραφίζεται τον υπακούει. Μια σημαία
 * αγνοημένη στον υπολογισμό και τιμημένη στην οθόνη είναι δύο απαντήσεις.
 */
vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ roles: [{ code: 'EMPLOYEE' }], permissions: ['store.view'] }),
}));

const { ScratchCalculatorTable } = await import('../components/shifts/ScratchCalculatorTable');

/** Το Λαϊκό της Στυλίδας, όπως είναι ΤΩΡΑ στη βάση: σημαία true. */
const LAIKO = {
  id: 'scr_laiko',
  name: 'Λαϊκό Λαχείο',
  category: 'Λαχεία',
  kind: 'LOTTERY' as const,
  price: 2,
  bundleSize: 5,
  startNo: '200',
  endNo: '',
  backSideEnabled: true,
  backEndNo: '149',
};

/** Σκρατς με τη ΔΙΚΗ του πίσω πλευρά ανοιχτή - δεν τον αγγίζει ο κανόνας. */
const GATA = {
  id: 'scr_2_gata',
  name: 'ΓΑΤΑ 2€',
  category: 'Σκρατς 2€',
  kind: 'SCRATCH' as const,
  price: 2,
  startNo: '0',
  endNo: '',
  backSideEnabled: true,
  backEndNo: '299',
};

const draw = (rows: unknown[]) =>
  renderToStaticMarkup(
    React.createElement(ScratchCalculatorTable as never, {
      rows,
      onChangeRows: () => {},
    } as never)
  );

describe('η πίσω πλευρά στο ταμείο', () => {
  it('ΤΟ ΛΑΪΚΟ ΔΕΝ ΕΧΕΙ ΠΙΣΩ: το 149 δεν ζωγραφίζεται πουθενά', () => {
    const html = draw([LAIKO]);
    expect(html).toContain('Λαϊκό Λαχείο');
    // Η σημαία λέει true· το είδος απαντά πρώτο, οπότε το κλειδωμένο
    // Πίσω-Τελικό δεν φτάνει σε κουτί.
    expect(html).not.toContain('value="149"');
  });

  it('το σκρατς κρατάει τη δική του πίσω πλευρά', () => {
    const html = draw([GATA]);
    expect(html).toContain('ΓΑΤΑ 2€');
    expect(html).toContain('value="299"');
  });

  /**
   * Το ένα δεν κρύβει το άλλο: στον ίδιο πίνακα, μαζί, κάθε γραμμή
   * απαντά για τον εαυτό της. Αυτό ήταν το σενάριο στη Στυλίδα - λαχεία
   * και σκρατς στην ίδια οθόνη, όλα με σημαία true.
   */
  it('μαζί στον ίδιο πίνακα, καθένα με την απάντησή του', () => {
    const html = draw([GATA, LAIKO]);
    expect(html).toContain('value="299"');
    expect(html).not.toContain('value="149"');
  });

  it('και με τη σημαία σβηστή, το λαχείο μένει χωρίς πίσω', () => {
    const html = draw([{ ...LAIKO, backSideEnabled: false }]);
    expect(html).not.toContain('value="149"');
  });
});
