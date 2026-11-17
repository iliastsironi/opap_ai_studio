import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Κανένα αρνητικό margin-bottom στις οθόνες.
 *
 * Ο ιδιοκτήτης έστειλε το Dashboard με τη γραμμή «Τα παρακάτω σύνολα φτάνουν
 * μέχρι την τελευταία κλεισμένη βάρδια» κομμένη στη μέση από τα cards από κάτω.
 * Η γραμμή είχε `-mb-2` για να σφίξει το κενό, αλλά στο Tailwind v4 το `space-y-*`
 * γράφει το κενό ως margin-bottom του προηγούμενου στοιχείου (με μηδενική
 * ειδικότητα, `:where`). Το `-mb-2` δεν το μείωνε από τα 24px στα 16px: το
 * αντικαθιστούσε με -8px, και το επόμενο στοιχείο ανέβαινε πάνω του.
 *
 * Για πιο σφιχτό κενό: ρητό θετικό `mb-*` (`mb-4`), που κερδίζει το space-y.
 */

const root = path.join(process.cwd(), 'src');

function* files(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'tests') yield* files(full);
    } else if (e.name.endsWith('.tsx')) yield full;
  }
}

describe('αρνητικό margin-bottom', () => {
  it('δεν υπάρχει σε κανένα component (μέσα σε space-y σβήνει το κενό αντί να το μειώνει)', () => {
    const offenders: string[] = [];
    for (const file of files(root)) {
      // Τα σχόλια (που εξηγούν αυτό ακριβώς το λάθος) δεν μετράνε: σβήνονται, με
      // τις αλλαγές γραμμής να μένουν ώστε οι αριθμοί γραμμών να βγαίνουν σωστοί.
      const code = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      code.split('\n').forEach((line, i) => {
        if (/(^|[\s"'`])-(mb|my|m)-(\d|\[)/.test(line)) offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}`);
      });
    }
    // Το -m-4/-m-5 του CustomerCreditDirectoryModal και τα -my-2 του Modal είναι
    // στα άκρα ενός παραθύρου, όχι μέσα σε space-y· καταγράφονται ρητά.
    expect(offenders.filter((o) => !ALLOWED.some((a) => o.startsWith(a)))).toEqual([]);
  });

  it('η γραμμή «μέχρι την τελευταία κλεισμένη βάρδια» του Dashboard έχει θετικό κενό', () => {
    const src = fs.readFileSync(path.join(root, 'components/admin/DashboardOverview.tsx'), 'utf8');
    const at = src.indexOf('{hasRealShifts && (');
    expect(at).toBeGreaterThan(0);
    const row = src.slice(at, at + 200);
    expect(row).toContain('mb-4');
    expect(row).not.toMatch(/-mb-/);
  });
});

const ALLOWED = [
  'src/components/ui/Modal.tsx', // -my-2 -mr-2 στο κουμπί κλεισίματος της επικεφαλίδας
  'src/components/shifts/CustomerCreditDirectoryModal.tsx', // -m-4: το περιεχόμενο φτάνει στα άκρα του παραθύρου
];
