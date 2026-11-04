import { describe, expect, it } from 'vitest';
import {
  isSudoValid, SUDO_WINDOW_MS, sudoRemainingLabel, sudoRemainingMs,
} from '../lib/sudoWindow.ts';

const T0 = 1_700_000_000_000;

describe('το παράθυρο μετά τον κωδικό', () => {
  it('ανοίγει μόλις δοθεί', () => {
    expect(isSudoValid(T0, T0)).toBe(true);
  });

  it('κλείνει στα πέντε λεπτά ακριβώς', () => {
    expect(isSudoValid(T0, T0 + SUDO_WINDOW_MS - 1)).toBe(true);
    expect(isSudoValid(T0, T0 + SUDO_WINDOW_MS)).toBe(false);
    expect(isSudoValid(T0, T0 + SUDO_WINDOW_MS + 1)).toBe(false);
  });

  it('κλειστό όταν δεν έχει δοθεί ποτέ', () => {
    expect(isSudoValid(null, T0)).toBe(false);
    expect(isSudoValid(NaN, T0)).toBe(false);
  });

  it('κλειστό αν η στιγμή είναι στο μέλλον', () => {
    // Γυρισμένο ρολόι ή γραμμένη τιμή: η μόνη ασφαλής ανάγνωση είναι «όχι».
    expect(isSudoValid(T0 + 1000, T0)).toBe(false);
  });
});

describe('η αντίστροφη μέτρηση', () => {
  it('δείχνει πόσο μένει', () => {
    expect(sudoRemainingMs(T0, T0)).toBe(SUDO_WINDOW_MS);
    expect(sudoRemainingMs(T0, T0 + 60_000)).toBe(SUDO_WINDOW_MS - 60_000);
  });

  it('μηδέν όταν έχει κλείσει', () => {
    expect(sudoRemainingMs(T0, T0 + SUDO_WINDOW_MS)).toBe(0);
    expect(sudoRemainingMs(null, T0)).toBe(0);
  });

  it('γράφεται λεπτά:δευτερόλεπτα', () => {
    expect(sudoRemainingLabel(T0, T0)).toBe('5:00');
    expect(sudoRemainingLabel(T0, T0 + 48_000)).toBe('4:12');
    expect(sudoRemainingLabel(T0, T0 + SUDO_WINDOW_MS - 1_000)).toBe('0:01');
    expect(sudoRemainingLabel(T0, T0 + SUDO_WINDOW_MS)).toBe('');
  });
});
