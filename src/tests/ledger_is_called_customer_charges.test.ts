/**
 * «Μετονόμασε γενικά το τεφτέρι: χρεώσεις πελατών.»
 *
 * Ό,τι διαβάζει ο χρήστης στην οθόνη λέγεται «Χρεώσεις πελατών». Το «τεφτέρι» μένει μόνο
 * σε σχόλια του κώδικα και σε ονόματα μεταβλητών (onOpenTefteri), που δεν τα βλέπει κανείς.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'tests') walk(p, out);
    } else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
};
/** Ο κώδικας χωρίς σχόλια: ό,τι μένει είναι ό,τι ζωγραφίζεται ή ονομάζεται. */
const withoutComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

describe('το τεφτέρι λέγεται «Χρεώσεις πελατών»', () => {
  const files = walk(root);

  it('καμία οθόνη δεν γράφει «τεφτέρι» (σε κείμενο που φαίνεται)', () => {
    const hits = files
      .filter((f) => /[Ττ]εφτ[έε]ρι|ΤΕΦΤΕΡΙ/.test(withoutComments(fs.readFileSync(f, 'utf-8'))))
      .map((f) => path.relative(root, f));
    expect(hits).toEqual([]);
  });

  it('το κουμπί των Βαρδιών, η καρτέλα στις λεπτομέρειες και το παράθυρο το λένε με το νέο όνομα', () => {
    const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf-8');
    expect(read('components/shifts/ShiftsManager.tsx')).toContain("toGreekUpper('Χρεωσεις πελατων')");
    expect(read('components/shifts/ShiftDetailsModal.tsx')).toContain('Χρεώσεις πελατών & εισπράξεις βάρδιας');
    expect(read('components/shifts/CustomerCreditDirectoryModal.tsx')).toContain('Χρεώσεις πελατών καταστήματος');
    expect(read('components/shifts/CustomerCreditDirectoryModal.tsx')).toContain('Συνολικές ανοιχτές χρεώσεις');
    expect(read('components/marketing/LandingPage.tsx')).toContain("title: 'Χρεώσεις πελατών',");
  });

  it('το Εθνικό Λαχείο στέλνει στις «Χρεώσεις πελατών»', () => {
    const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf-8');
    expect(read('components/national-lottery/NationalLotteryCustomerCard.tsx')).toContain('Υπάρχει οφειλή στις Χρεώσεις πελατών');
    expect(read('components/national-lottery/NationalLotteryCustomerCard.tsx')).toContain('Άνοιγμα καρτέλας στις Χρεώσεις πελατών');
    expect(read('components/national-lottery/NationalLotteryEditionRolloverModal.tsx')).toContain('Οφειλή που θα μεταφερθεί στις Χρεώσεις πελατών');
  });

  it('η διαγραφή βάρδιας λέει ότι το χρέος μένει στις χρεώσεις πελατών', () => {
    expect(fs.readFileSync(path.join(root, 'lib/shiftDeletion.ts'), 'utf-8')).toContain("' — το χρέος παραμένει στις χρεώσεις πελατών'");
  });
});
