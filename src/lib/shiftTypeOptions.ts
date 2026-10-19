/**
 * Which shifts a store actually runs.
 *
 * The opening screen offered Πρωινή / Απογευματινή / Βραδινή to everybody,
 * regardless of how the store is configured. A shop on two shifts had no
 * afternoon to pick, and picking one anyway produced a shift type its own
 * reports do not expect.
 *
 * shift_templates.shifts_per_day is the Owner's setting, so it decides:
 *
 *   2 -> Πρωινή, Βραδινή
 *   3 -> Πρωινή, Απογευματινή, Βραδινή
 *
 * «Ειδική / Έκτακτη» stays on every store on purpose. It is not one of the
 * day's regular shifts - it is the escape hatch for one that was not planned,
 * and a shop that works an extra till at the weekend needs somewhere to put
 * it. Removing it would leave them choosing a wrong label instead.
 */

export type ShiftTypeValue = 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'CUSTOM';

export interface ShiftTypeOption {
  value: ShiftTypeValue;
  label: string;
}

const MORNING: ShiftTypeOption = { value: 'MORNING', label: '☀️ Πρωινή' };
const AFTERNOON: ShiftTypeOption = { value: 'AFTERNOON', label: '🌤️ Απογευματινή' };
const NIGHT: ShiftTypeOption = { value: 'NIGHT', label: '🌙 Βραδινή' };
const CUSTOM: ShiftTypeOption = { value: 'CUSTOM', label: '⚡ Ειδική / Έκτακτη' };

export function shiftTypeOptions(shiftsPerDay: number | null | undefined): ShiftTypeOption[] {
  // Anything that is not an explicit 2 behaves as 3, which is what the screen
  // did before this existed - a store with no template yet is no worse off.
  return Number(shiftsPerDay) === 2
    ? [MORNING, NIGHT, CUSTOM]
    : [MORNING, AFTERNOON, NIGHT, CUSTOM];
}

/**
 * The selection to keep when the options change.
 *
 * Switching to a two-shift store while «Απογευματινή» is selected would
 * otherwise leave a value no option carries: the select renders blank and the
 * shift is written with a type the store does not run.
 */
export function resolveShiftType(
  current: ShiftTypeValue,
  shiftsPerDay: number | null | undefined
): ShiftTypeValue {
  const options = shiftTypeOptions(shiftsPerDay);
  return options.some((o) => o.value === current) ? current : 'MORNING';
}
