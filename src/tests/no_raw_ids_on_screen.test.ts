/**
 * Το εσωτερικό ID μιας εγγραφής (36 χαρακτήρες, c3a465e5-7121-…) δεν λέει τίποτα
 * σε όποιον κοιτάζει τον πίνακα εξόδων ή συμβάντων: ούτε το λέει κανείς φωναχτά,
 * ούτε το ψάχνει. Έπιανε τη θέση της ημερομηνίας και έσπαζε σε τέσσερις γραμμές.
 * Ο πίνακας δείχνει την ημερομηνία, και η αναζήτηση ψάχνει ό,τι φαίνεται.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf-8');

describe.each([
  ['expenses', 'src/components/modules/ExpensesManager.tsx', 'exp'],
  ['incidents', 'src/components/modules/IncidentsManager.tsx', 'inc'],
])('the %s table', (_name, file, row) => {
  const src = read(file);

  it('has a date column, not an «ID / Ημερομηνία» one', () => {
    expect(src).not.toMatch(/ID \/ Ημερομηνια/);
    expect(src).toMatch(/toGreekUpper\('Ημερομηνια'\)/);
  });

  it('does not print the row id', () => {
    expect(src).not.toMatch(new RegExp(`>\\s*\\{${row}\\.id\\}\\s*<`));
  });

  it('does not search by the hidden id', () => {
    expect(src).not.toMatch(new RegExp(`\\b\\w+\\.id\\.toLowerCase\\(\\)\\.includes\\(searchQuery`));
  });

  it('still keys its rows by the id (React needs it, the user does not)', () => {
    expect(src).toMatch(new RegExp(`<tr key=\\{${row}\\.id\\}`));
  });
});

describe('the date cell', () => {
  it('shows the day the money was spent, not when the row was written', () => {
    const src = read('src/components/modules/ExpensesManager.tsx');
    expect(src).toMatch(/new Date\(`\$\{exp\.date\}T00:00:00`\)\.toLocaleDateString\('el-GR'\)/);
  });
});
