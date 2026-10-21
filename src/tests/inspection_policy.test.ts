import { describe, expect, it } from 'vitest';
import {
  shouldOfferInspection, normalizeInspectionMode, DEFAULT_INSPECTION_MODE,
} from '../lib/inspectionPolicy.ts';

describe('who is asked to inspect', () => {
  it('asks the day’s first shift and nobody else, by default', () => {
    expect(shouldOfferInspection({ mode: 'FIRST_SHIFT_ONLY', isFirstOfDay: true })).toBe(true);
    expect(shouldOfferInspection({ mode: 'FIRST_SHIFT_ONLY', isFirstOfDay: false })).toBe(false);
  });

  it('spares the afternoon, which cannot count a till that never stops', () => {
    // The whole point of the change: the afternoon took over mid-trade.
    expect(shouldOfferInspection({ mode: undefined, isFirstOfDay: false })).toBe(false);
  });

  it('asks every shift where the store chose that', () => {
    expect(shouldOfferInspection({ mode: 'EVERY_SHIFT', isFirstOfDay: false })).toBe(true);
    expect(shouldOfferInspection({ mode: 'EVERY_SHIFT', isFirstOfDay: true })).toBe(true);
  });

  it('asks nobody where the store turned it off', () => {
    expect(shouldOfferInspection({ mode: 'OFF', isFirstOfDay: true })).toBe(false);
    expect(shouldOfferInspection({ mode: 'OFF', isFirstOfDay: false })).toBe(false);
  });

  it('treats a store that has never chosen as the default', () => {
    // Which matters before 0046 runs: the column is simply not there yet.
    expect(normalizeInspectionMode(undefined)).toBe(DEFAULT_INSPECTION_MODE);
    expect(normalizeInspectionMode(null)).toBe('FIRST_SHIFT_ONLY');
    expect(normalizeInspectionMode('ΝΑΙ ΠΑΝΤΑ')).toBe('FIRST_SHIFT_ONLY');
    expect(shouldOfferInspection({ isFirstOfDay: true })).toBe(true);
  });
});
