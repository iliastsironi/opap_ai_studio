/**
 * «Βάλτο το Εθνικό από κάτω, όπως τα υπόλοιπα.»
 *
 * Ο διακόπτης «Εμφάνιση Εθνικού Λαχείου» ήταν ξεχωριστό κουτί πάνω από τη λίστα των λαχείων.
 * Τώρα είναι στη γραμμή του Εθνικού, στο τέλος της λίστας, όπως οι εποχικές εκδόσεις έχουν
 * τον δικό τους διακόπτη στη γραμμή τους.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/shifts/ShiftTemplateConfigurator.tsx'), 'utf-8');

describe('ο διακόπτης του Εθνικού Λαχείου', () => {
  it('δεν υπάρχει πια ως ξεχωριστό κουτί πάνω από τη λίστα', () => {
    expect(src).not.toContain('<h4 className="text-xs font-bold text-slate-900">Εμφάνιση Εθνικού Λαχείου</h4>');
    expect(src.match(/aria-label="Εμφάνιση Εθνικού Λαχείου"/g)?.length).toBe(1);
  });

  it('είναι στη γραμμή του Εθνικού μέσα στη λίστα των λαχείων', () => {
    const list = src.indexOf('Λαχεία — εμφάνιση & μονάδα μέτρησης');
    const sw = src.indexOf('aria-label="Εμφάνιση Εθνικού Λαχείου"');
    expect(list).toBeGreaterThan(0);
    expect(sw).toBeGreaterThan(list);
    expect(src).toContain('const isNational = row.id === ETHNIKO_ROW_ID;');
  });

  it('δουλεύει πάνω στην ίδια ρύθμιση, και ανοιχτό είναι η προεπιλογή', () => {
    expect(src).toContain('template.show_national_lottery !== false');
    expect(src).toMatch(/show_national_lottery: prev\.show_national_lottery === false/);
  });

  it('μόνο ο ιδιοκτήτης το αλλάζει, όπως πριν', () => {
    const at = src.indexOf('aria-label="Εμφάνιση Εθνικού Λαχείου"');
    expect(src.slice(at, at + 400)).toContain('disabled={!canManageScratchMode}');
  });

  it('το Εθνικό παραμένει μόνο σε πεντάδες: δεν προσφέρεται επιλογή μονάδας', () => {
    expect(src).toContain('μόνο πεντάδες');
  });
});
