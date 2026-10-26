import { describe, expect, it } from 'vitest';
import {
  PLAY_DISABLED_MODULES,
  PLAY_TEMPLATE_OVERRIDES,
  overridesFor,
  templateShapeFor,
} from '../lib/storeTypeDefaults.ts';

describe('the store type decides the shape of its till', () => {
  it('reads a PLAY hall as a PLAY hall', () => {
    expect(templateShapeFor('PLAY_STORE')).toBe('PLAY');
  });

  it('leaves every other kind of shop on the agency shape', () => {
    for (const t of ['OPAP_AGENCY', 'OPAP_FNB', 'GAMING_HALL', 'RETAIL']) {
      expect(templateShapeFor(t)).toBe('OPAP');
    }
  });

  // A store row with no type, or one from a database that predates the
  // column, must not silently become a PLAY hall and lose its scratch rows.
  it('treats an unknown or missing type as an agency', () => {
    expect(templateShapeFor(undefined)).toBe('OPAP');
    expect(templateShapeFor(null)).toBe('OPAP');
    expect(templateShapeFor('')).toBe('OPAP');
    expect(templateShapeFor('SOMETHING_NEW')).toBe('OPAP');
  });
});

describe('what a PLAY hall changes', () => {
  it('turns off every game an agency sells and a hall does not', () => {
    for (const key of PLAY_DISABLED_MODULES) {
      expect(PLAY_TEMPLATE_OVERRIDES[key as keyof typeof PLAY_TEMPLATE_OVERRIDES]).toBe(false);
    }
  });

  it('keeps the machines, which are the whole point', () => {
    expect(PLAY_TEMPLATE_OVERRIDES.show_vlts).toBe(true);
    expect(PLAY_TEMPLATE_OVERRIDES.vlt_machine_cash_enabled).toBe(true);
  });

  it('turns on the midnight batch arithmetic', () => {
    expect(PLAY_TEMPLATE_OVERRIDES.pos_batch_close_enabled).toBe(true);
  });

  // Spread over the OPAP default, so anything the two shops share keeps
  // following one definition instead of being copied and left to drift.
  it('says nothing about settings the two shops share', () => {
    for (const shared of [
      'discrepancy_threshold', 'opening_float_notes', 'opening_float_coins',
      'shifts_per_day', 'inspection_mode', 'collection_summary_mode',
    ]) {
      expect(shared in PLAY_TEMPLATE_OVERRIDES).toBe(false);
    }
  });

  it('changes nothing at all for an agency', () => {
    expect(overridesFor('OPAP_AGENCY')).toEqual({});
    expect(overridesFor(undefined)).toEqual({});
  });

  it('hands a PLAY hall its own copy, not the shared constant', () => {
    const a = overridesFor('PLAY_STORE');
    const b = overridesFor('PLAY_STORE');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
