import { describe, it, expect } from 'vitest';
import { gameNumber, gamesMissingFrom, sameGame } from '../lib/catalogPropagation';

/** Τα δύο χριστουγεννιάτικα, όπως μπήκαν στη Λαμία. */
const DWRO_5 = { code: 'scr_custom_mwakfl3f', name: 'Δώρο 5€', gameNo: '0168' };
const DWRO_10 = { code: 'scr_custom_mwakh5bs', name: 'Δώρο 10€', gameNo: '0169' };
/** Το ίδιο παιχνίδι, γραμμένο χωριστά στα δύο μαγαζιά. */
const SEVEN_LAMIA = { code: 'scr_custom_mvfqt9yt', name: '7ΑΡΙ 50€', gameNo: '0166' };
const SEVEN_STILIDA = { code: 'scr_custom_mwafnvc3', name: '7ΑΡΙ 50€', gameNo: '0166' };
const LAIKO = { code: 'scr_laiko', name: 'Λαϊκό Λαχείο' };

describe('ποιο παιχνίδι είναι το ίδιο παιχνίδι', () => {
  it('ο 4ψήφιος κρίνει, όχι ο εσωτερικός κωδικός', () => {
    expect(sameGame(SEVEN_LAMIA, SEVEN_STILIDA)).toBe(true);
  });

  it('διαφορετικός 4ψήφιος σημαίνει άλλο παιχνίδι, ίδιο όνομα ή όχι', () => {
    expect(sameGame(DWRO_5, DWRO_10)).toBe(false);
    expect(sameGame({ name: 'ΓΑΤΑ 2€', gameNo: '0157' }, { name: 'ΓΑΤΑ 2€', gameNo: '0158' })).toBe(false);
  });

  it('χωρίς 4ψήφιο κρίνει ο κωδικός — τα λαχεία δεν έχουν αριθμό', () => {
    expect(sameGame(LAIKO, { code: 'scr_laiko', name: 'Λαϊκό' })).toBe(true);
  });

  it('τελευταίο το όνομα, χωρίς τόνους και κεφαλαία', () => {
    expect(sameGame({ name: 'Δώρο 5€' }, { name: 'ΔΩΡΟ 5€' })).toBe(true);
    expect(sameGame({ name: ' δωρο 5€ ' }, { name: 'Δώρο 5€' })).toBe(true);
  });

  it('ένας 4ψήφιος που δεν είναι τεσσάρων ψηφίων δεν μετράει ως αριθμός', () => {
    expect(gameNumber({ gameNo: '168' })).toBe('');
    expect(gameNumber({ gameNo: '0168' })).toBe('0168');
    expect(gameNumber({ gameNo: 'ΑΒΓΔ' })).toBe('');
  });
});

describe('τι λείπει από το άλλο μαγαζί', () => {
  const STILIDA = [SEVEN_STILIDA, LAIKO];

  it('ΤΑ ΧΡΙΣΤΟΥΓΕΝΝΙΑΤΙΚΑ ΛΕΙΠΟΥΝ — αυτά και μόνο αυτά', () => {
    const missing = gamesMissingFrom([SEVEN_LAMIA, LAIKO, DWRO_5, DWRO_10], STILIDA);
    expect(missing.map((g) => g.name)).toEqual(['Δώρο 5€', 'Δώρο 10€']);
  });

  /** Το λάθος που θα δημιουργούσε ακριβώς το μπέρδεμα που λύνει. */
  it('δεν ξαναγράφει παιχνίδι που υπάρχει με άλλον εσωτερικό κωδικό', () => {
    expect(gamesMissingFrom([SEVEN_LAMIA], STILIDA)).toEqual([]);
  });

  it('δεν αντιγράφει δύο φορές το ίδιο παιχνίδι της πηγής', () => {
    const missing = gamesMissingFrom([DWRO_5, { ...DWRO_5, code: 'άλλος' }], STILIDA);
    expect(missing.length).toBe(1);
  });

  it('άδειος προορισμός παίρνει τα πάντα', () => {
    expect(gamesMissingFrom([DWRO_5, LAIKO], []).length).toBe(2);
    expect(gamesMissingFrom([DWRO_5], null).length).toBe(1);
  });

  it('άδεια πηγή δεν δίνει τίποτα', () => {
    expect(gamesMissingFrom(null, STILIDA)).toEqual([]);
  });

  it('γραμμή χωρίς όνομα και χωρίς κωδικό αγνοείται', () => {
    expect(gamesMissingFrom([{ code: '', name: '' }], [])).toEqual([]);
  });

  /** Η αφαίρεση δεν ταξιδεύει: τι πουλάει κάθε μαγαζί είναι δική του απόφαση. */
  it('ό,τι έχει ο προορισμός και δεν έχει η πηγή μένει στη θέση του', () => {
    const missing = gamesMissingFrom([DWRO_5], [LAIKO]);
    expect(missing.map((g) => g.name)).toEqual(['Δώρο 5€']);
  });
});
