import { describe, expect, it } from 'vitest';
import { bundleBoxFactor } from '../components/shifts/ScratchCalculatorTable.tsx';

// Το κουτί του αρχικού δέχεται πεντάδες και η γραμμή κρατάει κομμάτια -
// αλλά μόνο όπου υπάρχουν κομμάτια.
describe('τι πολλαπλασιάζει το κουτί του αρχικού', () => {
  it('Λαϊκό σε πεντάδες: ×5, γιατί η γραμμή κρατάει κομμάτια', () => {
    expect(bundleBoxFactor(5, true)).toBe(5);
  });

  it('Εθνικό: ×1, γιατί η γραμμή κρατάει ήδη πεντάδες', () => {
    // 84 πεντάδες γράφονταν 420 και η εμφάνιση τις ξαναδιαιρούσε, οπότε το
    // κουτί ξανάδειχνε 84 και η αλλοίωση ήταν αόρατη. Το τελικό κουτί δεν
    // μετέφραζε: 420 − 83 = 337 αντί για 1.
    expect(bundleBoxFactor(0, true)).toBe(1);
    expect(bundleBoxFactor(undefined, true)).toBe(1);
  });

  it('χωρίς πεντάδες στη μονάδα, καμία μετάφραση', () => {
    expect(bundleBoxFactor(5, false)).toBe(1);
    expect(bundleBoxFactor(0, false)).toBe(1);
  });

  it('σκουπίδια δεν γίνονται πολλαπλασιαστής', () => {
    expect(bundleBoxFactor('πέντε', true)).toBe(1);
    expect(bundleBoxFactor(-5, true)).toBe(1);
    expect(bundleBoxFactor(null, true)).toBe(1);
  });

  it('ό,τι μπαίνει βγαίνει — για κάθε λαχείο', () => {
    for (const [bundleSize, typed] of [[5, 40], [0, 84], [5, 1], [0, 1]] as Array<[number, number]>) {
      const f = bundleBoxFactor(bundleSize, true);
      const stored = typed * f;
      expect(Math.floor(stored / f)).toBe(typed);
    }
  });
});
