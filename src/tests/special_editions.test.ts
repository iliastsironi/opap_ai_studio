import { describe, expect, it } from 'vitest';
import {
  SPECIAL_EDITION_ROW_IDS, DEFAULT_SCRATCH_PRESETS,
} from '../components/shifts/ScratchCalculatorTable.tsx';

const visible = (enabled: boolean) =>
  (enabled ? DEFAULT_SCRATCH_PRESETS : DEFAULT_SCRATCH_PRESETS.filter(
    (r) => !SPECIAL_EDITION_ROW_IDS.includes(r.id)
  )).map((r) => r.id);

describe('the seasonal lotteries', () => {
  it('includes the New Year one, which sells for a few weeks a year', () => {
    expect(SPECIAL_EDITION_ROW_IDS).toContain('scr_protochroniatiko');
  });

  it('keeps the pair that was already there', () => {
    expect(SPECIAL_EDITION_ROW_IDS).toContain('scr_eidiki_x5');
    expect(SPECIAL_EDITION_ROW_IDS).toContain('scr_eidiki_x10');
  });

  it('hides all three until the store turns the group on', () => {
    for (const id of SPECIAL_EDITION_ROW_IDS) {
      expect(visible(false)).not.toContain(id);
      expect(visible(true)).toContain(id);
    }
  });

  it('leaves the everyday games alone either way', () => {
    for (const id of ['scr_laiko', 'scr_elaiko', 'scr_ethniko_x20', 'scr_5_gata']) {
      expect(visible(false)).toContain(id);
      expect(visible(true)).toContain(id);
    }
  });

  it('names rows that actually exist in the presets', () => {
    // A typo here would hide nothing and nobody would notice.
    const ids = DEFAULT_SCRATCH_PRESETS.map((r) => r.id);
    for (const id of SPECIAL_EDITION_ROW_IDS) expect(ids).toContain(id);
  });
});
