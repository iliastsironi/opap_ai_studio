import { describe, expect, it } from 'vitest';
import {
  handoverProblem, packsForGame, warehouseGoverns, type HandoverPack,
} from '../lib/warehouseHandover.ts';

const pack = (over: Partial<HandoverPack>): HandoverPack => ({
  id: 'p1', catalog_code: 'scr_2_gata', pack_code: '3301482', game_name: 'ΓΑΤΑ',
  pieces: 150, unit_price: 2, received_at: '2026-10-01', ...over,
});

describe('πότε αναλαμβάνει η αποθήκη', () => {
  it('όχι όσο το κατάστημα δεν έχει καταχωρήσει τίποτα', () => {
    // Αλλιώς το ταμείο θα σταματούσε απόψε για μια δουλειά που θέλει μέρες.
    expect(warehouseGoverns([], false)).toBe(false);
    expect(warehouseGoverns(null, false)).toBe(false);
  });

  it('ναι από το πρώτο πακέτο και μετά', () => {
    expect(warehouseGoverns([pack({})], false)).toBe(true);
  });

  it('ποτέ για λαχείο — εκείνα έχουν παραλαβή ανά κλήρωση', () => {
    expect(warehouseGoverns([pack({})], true)).toBe(false);
  });
});

describe('ποια πακέτα προσφέρονται', () => {
  it('μόνο του ίδιου παιχνιδιού', () => {
    const packs = [pack({ id: 'a' }), pack({ id: 'b', catalog_code: 'scr_5_gata' })];
    expect(packsForGame(packs, 'scr_2_gata').map((p) => p.id)).toEqual(['a']);
  });

  it('παλαιότερο πρώτο — αυτό πλησιάζει τις 90 ημέρες', () => {
    const packs = [
      pack({ id: 'new', received_at: '2026-10-20' }),
      pack({ id: 'old', received_at: '2026-08-01' }),
      pack({ id: 'mid', received_at: '2026-09-10' }),
    ];
    expect(packsForGame(packs, 'scr_2_gata').map((p) => p.id)).toEqual(['old', 'mid', 'new']);
  });

  it('άγνωστο παιχνίδι δίνει κενό', () => {
    expect(packsForGame([pack({})], 'scr_kati_allo')).toEqual([]);
  });
});

describe('τι εμποδίζει το άνοιγμα', () => {
  it('άδεια αποθήκη λέει πού να πας', () => {
    expect(handoverProblem([], null)).toContain('Αποθήκη Σκρατς');
  });

  it('χωρίς επιλογή, ένα κλικ — όχι «συμπληρώστε τα πεδία»', () => {
    expect(handoverProblem([pack({})], null)).toBe('Διαλέξτε πακέτο από την αποθήκη.');
  });

  it('πακέτο που βγήκε αλλού όσο ήταν ανοιχτό το παράθυρο', () => {
    expect(handoverProblem([pack({ id: 'a' })], 'b')).toContain('δεν είναι πια διαθέσιμο');
  });

  it('σωστή επιλογή δεν εμποδίζεται', () => {
    expect(handoverProblem([pack({ id: 'a' })], 'a')).toBeNull();
  });
});
