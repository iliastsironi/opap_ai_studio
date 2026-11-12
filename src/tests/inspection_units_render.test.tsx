import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  ShiftInspectionPanel,
  buildInspectionLines,
} from '../components/shifts/ShiftInspectionPanel';

/**
 * Η πρωινή επιθεώρηση, ζωγραφισμένη.
 *
 * «Τα λαχεία να τα εμφανίζει σαν πεντάδες και όχι σαν κομμάτια, γιατί τα
 * βλέπουν και μπερδεύονται.» Τα 14 τεστ του lib κρίνουν τη μετατροπή· αυτό
 * κρίνει ότι η οθόνη τη ΧΡΗΣΙΜΟΠΟΙΕΙ.
 */
const ROWS = [
  { id: 'scr_laiko', name: 'Λαϊκό Λαχείο', category: 'Λαχεία', kind: 'LOTTERY', price: 2, bundleSize: 5, endNo: '200' },
  { id: 'scr_ethniko_x20', name: 'Εθνικό x 20€', category: 'Λαχεία', kind: 'LOTTERY', price: 20, endNo: '80' },
  { id: 'scr_2_gata', name: 'ΓΑΤΑ 2€', category: 'Σκρατς 2€', kind: 'SCRATCH', price: 2, endNo: '118' },
];

const UNITS = { scr_laiko: 'BUNDLES', scr_ethniko_x20: 'BUNDLES' };

const draw = (units: Record<string, unknown> | null) =>
  renderToStaticMarkup(
    React.createElement(ShiftInspectionPanel as never, {
      previousOperatorName: 'τη βραδινή',
      lines: buildInspectionLines({ notes: 150, coins: 50 }, ROWS),
      onChangeFound: () => {},
      onSkip: () => {},
      lotteryUnits: units,
    } as never)
  );

describe('η πρωινή επιθεώρηση δείχνει τη μονάδα του μαγαζιού', () => {
  it('ΤΟ ΛΑΪΚΟ ΣΕ ΠΕΝΤΑΔΕΣ: 200 κομμάτια διαβάζονται 40 πεντάδες', () => {
    const html = draw(UNITS);
    expect(html).toContain('40 πεντάδες');
    expect(html).not.toContain('Δηλώθηκε: 200');
  });

  it('η τιμή είναι της πεντάδας, όχι του κομματιού', () => {
    expect(draw(UNITS)).toContain('/πεντάδα');
  });

  it('το Εθνικό μένει 80 — ο αριθμός του ΕΙΝΑΙ ήδη πεντάδες', () => {
    const html = draw(UNITS);
    expect(html).toContain('80 πεντάδες');
  });

  it('τα σκρατς μένουν σε κομμάτια', () => {
    expect(draw(UNITS)).toContain('118 κομμάτια');
  });

  /**
   * Το πλαίσιο «Παραλαμβάνετε» άθροιζε 200 κομμάτια Λαϊκού με 80 πεντάδες
   * Εθνικού και έγραφε «280 τεμάχια» - έναν αριθμό που δεν μετράει τίποτα.
   */
  it('τα παραδοτέα δεν αθροίζουν πεντάδες με κομμάτια', () => {
    const html = draw(UNITS);
    expect(html).not.toContain('τεμάχια');
    expect(html).toContain('Λαχεία:');
    // Η αξία αθροίζεται σωστά: 200 × 2 € + 80 × 20 € = 2.000 €.
    expect(html).toContain('2.000,00');
  });

  /** Ένα μαγαζί που μετράει κομμάτια δεν αλλάζει. */
  it('χωρίς δηλωμένη μονάδα, το Λαϊκό μένει σε κομμάτια', () => {
    const html = draw({});
    expect(html).toContain('200 κομμάτια');
    expect(html).not.toContain('40 πεντάδες');
  });
});
