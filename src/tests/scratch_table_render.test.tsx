import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

/**
 * Ο πίνακας του ταμείου, ζωγραφισμένος.
 *
 * Τα 19 τεστ του lib/scratchOnTheCounter κρίνουν τον ΚΑΝΟΝΑ. Αυτό εδώ
 * κρίνει το ΚΑΛΩΔΙΟ: ότι ο κανόνας είναι πράγματι συνδεδεμένος με τη
 * γραμμή που ζωγραφίζεται. Ένας κανόνας σωστός και ασύνδετος είναι ένα
 * παιχνίδι που πουλιέται ενώ κάθεται στην αποθήκη.
 */
vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ roles: [{ code: 'EMPLOYEE' }], permissions: ['store.view'] }),
}));

const { ScratchCalculatorTable } = await import('../components/shifts/ScratchCalculatorTable');

/** Ο νέος κωδικός: στον κατάλογο, με τα πακέτα του ακόμα στο ράφι. */
const DWRO = {
  id: 'scr_custom_mwakfl3f',
  name: 'Δώρο 5€',
  category: 'Σκρατς 5€',
  kind: 'SCRATCH' as const,
  price: 5,
  startNo: '',
  endNo: '',
};

/** Παιχνίδι που τρέχει, με ανοιγμένο πακέτο. */
const GATA = {
  id: 'scr_2_gata',
  name: 'ΓΑΤΑ 2€',
  category: 'Σκρατς 2€',
  kind: 'SCRATCH' as const,
  price: 2,
  startNo: '0',
  endNo: '7',
  packCode: '0040695',
};

const pack = (status: string, code: string, catalog: string) => ({
  id: `p_${code}`,
  catalog_code: catalog,
  pack_code: code,
  game_name: 'Δώρο 5€',
  pieces: 60,
  unit_price: 5,
  received_at: '2026-11-10',
  status,
});

const draw = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    React.createElement(ScratchCalculatorTable as never, {
      rows: [GATA, DWRO],
      onChangeRows: () => {},
      ...props,
    } as never)
  );

describe('ο πίνακας του ταμείου', () => {
  it('ΔΕΝ δείχνει νέο κωδικό που δεν του παραδόθηκε πακέτο', () => {
    const html = draw({ warehouseInUse: true, warehousePacks: [pack('IN_WAREHOUSE', '0016881', DWRO.id)] });
    expect(html).toContain('ΓΑΤΑ 2€');
    expect(html).not.toContain('Δώρο 5€</span>');
  });

  it('λέει ΓΙΑΤΙ λείπει, με το όνομά του', () => {
    const html = draw({ warehouseInUse: true, warehousePacks: [pack('IN_WAREHOUSE', '0016881', DWRO.id)] });
    expect(html).toContain('περιμένει παράδοση');
    expect(html).toContain('Δώρο 5€');
    expect(html).toContain('δεν έχει παραδώσει πακέτο');
  });

  it('μόλις παραδοθεί το πακέτο, μπαίνει στον πάγκο', () => {
    const html = draw({ warehouseInUse: true, warehousePacks: [pack('PENDING_DELIVERY', '0016880', DWRO.id)] });
    expect(html).toContain('Δώρο 5€');
    expect(html).not.toContain('περιμένει παράδοση');
  });

  it('κατάστημα χωρίς αποθήκη δεν χάνει γραμμές', () => {
    const html = draw({ warehouseInUse: false, warehousePacks: [] });
    expect(html).toContain('Δώρο 5€');
    expect(html).not.toContain('περιμένει παράδοση');
  });

  /** Μια κλεισμένη βάρδια είναι αρχείο: κρίνεται με το ράφι της εποχής της. */
  it('σε ανάγνωση δεν κρύβει τίποτα', () => {
    const html = draw({
      readOnly: true,
      warehouseInUse: true,
      warehousePacks: [pack('IN_WAREHOUSE', '0016881', DWRO.id)],
    });
    expect(html).toContain('Δώρο 5€');
    expect(html).not.toContain('περιμένει παράδοση');
  });

  it('δείχνει τον κωδικό του πακέτου που τρέχει', () => {
    const html = draw({ warehouseInUse: true, warehousePacks: [] });
    expect(html).toContain('πακέτο 0040695');
  });
});
