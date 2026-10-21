import { describe, expect, it } from 'vitest';
import { compareGreek, sortByGreekName } from '../lib/greekSort.ts';

const names = (rows: Array<{ name: string }>) => rows.map((r) => r.name);

describe('customers in alphabetical order', () => {
  it('sorts the Greek alphabet', () => {
    const rows = [{ name: 'Ωμέγα' }, { name: 'Βέττας' }, { name: 'Αλέξης' }, { name: 'Κώστας' }];
    expect(names(sortByGreekName(rows))).toEqual(['Αλέξης', 'Βέττας', 'Κώστας', 'Ωμέγα']);
  });

  it('files an accented first letter with its letter, not after the alphabet', () => {
    // A plain string compare puts «Άννα» after «Ωμέγα» - accented capitals
    // sit past Ω in UTF-16.
    const rows = [{ name: 'Ωμέγα' }, { name: 'Άννα' }];
    expect(names(sortByGreekName(rows))).toEqual(['Άννα', 'Ωμέγα']);
  });

  it('does not put every capital before every small letter', () => {
    const rows = [{ name: 'ωμέγα' }, { name: 'Βέττας' }];
    expect(names(sortByGreekName(rows))).toEqual(['Βέττας', 'ωμέγα']);
  });

  it('treats a final sigma as a sigma', () => {
    expect(compareGreek('Γιώργος', 'Γιώργοσ')).toBe(0);
  });

  it('orders a name with a number the way a person reads it', () => {
    const rows = [{ name: 'Πελάτης 10' }, { name: 'Πελάτης 2' }];
    expect(names(sortByGreekName(rows))).toEqual(['Πελάτης 2', 'Πελάτης 10']);
  });

  it('survives a missing or blank name', () => {
    const rows = [{ name: 'Βέττας' }, {} as any, { name: '' }];
    expect(() => sortByGreekName(rows)).not.toThrow();
    expect(names(sortByGreekName(rows))[2]).toBe('Βέττας');
  });

  it('leaves the caller’s array alone', () => {
    const rows = [{ name: 'Ωμέγα' }, { name: 'Αλέξης' }];
    sortByGreekName(rows);
    expect(names(rows)).toEqual(['Ωμέγα', 'Αλέξης']);
  });
});
