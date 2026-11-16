import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Ο ιδιοκτήτης: «εδώ γίνεται ένας χαμός, χάνεσαι και μπερδεύεσαι, πρέπει να είναι πιο
 * απλή η διαμόρφωση». Και, ρωτημένος τι αλλάζει πραγματικά συχνά: ο κατάλογος σκρατς και
 * οι τιμές.
 *
 * Η οθόνη είχε 4 καρτέλες: 11 πεδία με 5 φίλτρα και 4 σήματα το καθένα (τα 6 είναι
 * αυτόματοι υπολογισμοί που δεν αλλάζουν), μία μακριά σελίδα με 20 διακόπτες και 17
 * τίτλους, ο κατάλογος, και μια προεπισκόπηση. Τώρα: δύο καρτέλες, ο κατάλογος πρώτος, και
 * όλα τα άλλα σε κλειστές ομάδες «Για προχωρημένους». Καμία ρύθμιση δεν αφαιρέθηκε.
 */

const src = fs.readFileSync(path.join(process.cwd(), 'src/components/shifts/ShiftTemplateConfigurator.tsx'), 'utf8');
const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');

describe('δύο καρτέλες, ο κατάλογος σκρατς πρώτος', () => {
  it('ανοίγει στον κατάλογο σκρατς και τις τιμές', () => {
    expect(code).toContain("useState<'CATALOG' | 'FORM'>('CATALOG')");
  });

  it('οι παλιές καρτέλες δεν υπάρχουν πια', () => {
    for (const gone of ["'FIELDS'", "'MODULES'", "'PREVIEW'", 'Πεδία Φόρμας', 'Ενότητες OPAP', 'Προεπισκόπηση Υπαλλήλου']) {
      expect(code, gone).not.toContain(gone);
    }
  });

  it('τα δύο κουμπιά καρτελών λένε τι κάνει η καθεμία, και η δεύτερη λέει ότι είναι για προχωρημένους', () => {
    expect(code).toContain("title: 'Κατάλογος Σκρατς & Τιμές'");
    expect(code).toContain("title: 'Ρυθμίσεις Φόρμας'");
    expect(code).toContain("hint: 'Για προχωρημένους · αλλάζουν σπάνια'");
    expect(code).toContain('aria-pressed={activeTab === tab.id}');
  });
});

describe('οι ρυθμίσεις φόρμας είναι κλειστές ομάδες', () => {
  const sections = [...code.matchAll(/<AdvancedSection\s+title="([^"]+)"/g)].map((m) => m[1]);

  it('έξι ομάδες, με απλά ελληνικά ονόματα, με αυτή τη σειρά', () => {
    expect(sections).toEqual([
      'Ενότητες που βλέπει η βάρδια',
      'Κανόνες ταμείου & βάρδιας',
      'Καταμέτρηση σκρατς & λαχείων',
      'Λειτουργία πώλησης σκρατς',
      'Λοιπές ρυθμίσεις καταστήματος',
    ].flatMap((t, i) => (i === 0 ? [t, 'Επιπλέον πεδία'] : [t])));
  });

  it('κάθε ομάδα φαίνεται μόνο στην καρτέλα των ρυθμίσεων', () => {
    const count = (code.match(/\{activeTab === 'FORM' && \(\s*<AdvancedSection/g) ?? []).length;
    expect(count).toBe(6);
    expect(code).not.toContain("activeTab === 'MODULES'");
  });

  it('η ομάδα είναι <details> χωρίς το attribute open: κλειστή από προεπιλογή', () => {
    const comp = code.slice(code.indexOf('const AdvancedSection'), code.indexOf('export const ShiftTemplateConfigurator'));
    expect(comp).toContain('<details');
    expect(comp).not.toMatch(/<details[^>]*\bopen\b/);
    expect(comp).toContain('<summary');
  });

  it('το περιεχόμενο μένει στη σελίδα όταν η ομάδα είναι κλειστή, ώστε να μη χάνονται ανασφράγιστες αλλαγές', () => {
    // <details> δεν ξεστήνει τα παιδιά του· κανένας όρος στην AdvancedSection δεν τα κρύβει από το React.
    const comp = code.slice(code.indexOf('const AdvancedSection'), code.indexOf('export const ShiftTemplateConfigurator'));
    expect(comp).toContain('{children}');
    expect(comp).not.toMatch(/open\s*&&\s*children|isOpen\s*&&|useState/);
  });

  it('καμία από τις πέντε παλιές ομάδες ρυθμίσεων δεν χάθηκε', () => {
    for (const heading of ['Ενότητες & Υποσυστήματα OPAP Report', 'Κανόνες Ταμείου & Βάρδιας', 'Καταμέτρηση Σκρατς & Λαχείων', 'Λειτουργία Πώλησης Σκρατς', 'Λοιπές Ρυθμίσεις Καταστήματος']) {
      expect(code, heading).toContain(heading);
    }
  });
});

describe('τα πεδία της φόρμας', () => {
  it('δείχνει μόνο όσα αλλάζει ο ιδιοκτήτης· τα αυτόματα είναι μία γραμμή', () => {
    expect(code).toContain('const extraFields = customFieldsList.filter((f) => !isAutoField(f));');
    expect(code).toContain('const autoFields = customFieldsList.filter(isAutoField);');
    expect(code).toContain('{extraFields.map((field) => (');
    expect(code).toContain('Αυτόματα ({autoFields.length}):');
    expect(code).toContain('δεν αλλάζουν');
  });

  it('έφυγαν τα φίλτρα, τα σήματα τύπου και τα βελάκια αναδιάταξης', () => {
    for (const gone of ['setFieldFilter', 'fieldFilter', 'renderTypeBadge', 'handleMoveField', 'ArrowUp', 'ArrowDown',
                        'Συστημικό - Αυτόματος Υπολογισμός', 'Προστατευμένο', 'Μετακίνηση Πάνω', 'Ενότητα: ']) {
      expect(code, gone).not.toContain(gone);
    }
  });

  it('κάθε επιπλέον πεδίο έχει διακόπτη ενεργό/ανενεργό, μολύβι και διαγραφή· η προσθήκη είναι μέσα στην ομάδα', () => {
    const group = code.slice(code.indexOf('title="Επιπλέον πεδία"'), code.indexOf('title="Κανόνες ταμείου & βάρδιας"'));
    expect(group).toContain('role="switch"');
    expect(group).toContain('handleToggleFieldEnabled(field.id)');
    expect(group).toContain('handleOpenEditField(field)');
    expect(group).toContain('handleRemoveCustomField(field.id)');
    expect(group).toContain('onClick={handleOpenAddField}');
  });

  it('το «Υποχρεωτικό» αλλάζει ακόμα, από τη φόρμα επεξεργασίας του πεδίου', () => {
    expect(code).toContain('setFieldRequired');
    expect(code).toContain('fieldRequired');
  });
});

describe('η κεφαλίδα και η προεπισκόπηση', () => {
  it('Επαναφορά και Αποθήκευση εμφανίζονται μόνο στις ρυθμίσεις φόρμας, όχι πάνω από τον κατάλογο που σώζεται μόνος του', () => {
    const header = code.slice(code.indexOf('Δες πώς το βλέπει ο υπάλληλος'), code.indexOf('{successMsg && ('));
    const gate = header.indexOf("{activeTab === 'FORM' && (");
    expect(gate).toBeGreaterThan(0);
    expect(header.indexOf('setShowResetConfirm(true)')).toBeGreaterThan(gate);
    expect(header.indexOf('onClick={handleSave}')).toBeGreaterThan(gate);
    expect(header.indexOf('setShowPreview(true)')).toBeLessThan(gate);   // η προεπισκόπηση φαίνεται πάντα
  });

  it('η προεπισκόπηση υπαλλήλου είναι παράθυρο που ανοίγει από κουμπί, όχι καρτέλα', () => {
    expect(code).toContain('isOpen={showPreview}');
    expect(code).toContain('title="Πώς το βλέπει ο υπάλληλος"');
    const modal = code.slice(code.indexOf('isOpen={showPreview}'));
    expect(modal).toContain('ΑΝΑΦΟΡΕΣ & ΠΩΛΗΣΕΙΣ');
    expect(modal).toContain('ΚΑΤΑΜΕΤΡΗΣΗ & ΕΞΟΔΑ');
  });

  it('ο μακρύς πλαίσιο «Σταθεροί & Αυτόματοι Υπολογισμοί» έφυγε από την κορυφή', () => {
    expect(code).not.toContain('Σταθεροί & Αυτόματοι Υπολογισμοί');
  });

  it('κανένα πεδίο του προτύπου δεν έμεινε χωρίς θέση: ο κατάλογος και οι έξι ομάδες φορτώνουν τα ίδια δεδομένα', () => {
    expect(code).toContain('<ScratchCatalogEditor');
    for (const handler of ['handleSave', 'handleResetDefaults', 'handleOpenAddField', 'handleOpenEditField', 'handleRemoveCustomField', 'handleToggleFieldEnabled', 'handleSaveFieldFromModal']) {
      expect(code, handler).toContain(handler);
    }
  });
});
