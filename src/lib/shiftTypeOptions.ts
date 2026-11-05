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

/**
 * Ποια βάρδια ανοίγει τώρα, με βάση όσες έχει ήδη η μέρα.
 *
 * Η οθόνη ξεκινούσε πάντα στο «Πρωινή» και έμενε εκεί. Στην παράδοση κανείς
 * δεν το άλλαζε, οπότε η μέρα έγραφε δύο πρωινές - και τότε κάθε αναφορά που
 * ομαδοποιεί ανά βάρδια βλέπει μια πρωινή με διπλάσιο τζίρο και μια βραδινή
 * που δεν υπάρχει. Το λάθος δεν χαλάει κανένα σύνολο· χαλάει το ΠΟΙΑΣ, και
 * γι' αυτό περνάει απαρατήρητο.
 *
 * Ο κανόνας είναι «πρώτη της μέρας -> πρωινή, μετά -> βραδινή»:
 *
 *   -                      -> Πρωινή
 *   Πρωινή                 -> Βραδινή
 *   Πρωινή + Απογευματινή  -> Βραδινή
 *   Πρωινή + Βραδινή       -> Ειδική / Έκτακτη
 *
 * Η Απογευματινή ΔΕΝ προτείνεται ποτέ, παρόλο που τα τρία καταστήματα είναι
 * ρυθμισμένα σε τρεις βάρδιες. Στα πραγματικά δεδομένα δεν υπάρχει καμία:
 * 55 βάρδιες, 28 πρωινές, 27 βραδινές, μηδέν απογευματινές - και οι 24
 * δεύτερες βάρδιες της μέρας είναι όλες βραδινές. Το shifts_per_day = 3 δεν
 * είναι δήλωση πρόθεσης, είναι μια ρύθμιση που δεν άλλαξε κανείς· μια
 * πρόταση χτισμένη πάνω του θα ήταν το ίδιο λάθος που διορθώνει αυτή η
 * συνάρτηση - μια προεπιλογή που κανείς δεν προσέχει. Μένει στη λίστα για
 * όποιον όντως δουλέψει απογευματινή, και τη διαλέγει με το χέρι.
 *
 * Η CUSTOM δεν πιάνει θέση η ίδια: μια έκτακτη βάρδια στις 08:00 δεν
 * σημαίνει ότι η μέρα έκανε το πρωινό της.
 *
 * Προτείνει, δεν αποφασίζει: το πεδίο μένει επιλογή, και μόλις το αγγίξει
 * κάποιος με το χέρι η πρόταση παύει - δες ShiftOpeningModal.
 */
export function nextShiftType(
  typesToday: readonly (string | null | undefined)[] | null | undefined,
  shiftsPerDay: number | null | undefined
): ShiftTypeValue {
  const regular = (typesToday ?? [])
    .map((t) => String(t ?? '').trim().toUpperCase())
    .filter((t) => t && t !== 'CUSTOM');

  const suggested: ShiftTypeValue =
    regular.length === 0 ? 'MORNING' : !regular.includes('NIGHT') ? 'NIGHT' : 'CUSTOM';

  // Και τα τρία τα προσφέρει κάθε κατάστημα, οπότε αυτό δεν αλλάζει τίποτα
  // σήμερα. Μένει γιατί μια πρόταση που το κατάστημα δεν τρέχει θα άφηνε το
  // select κενό και θα έγραφε τύπο που οι αναφορές του δεν περιμένουν.
  return resolveShiftType(suggested, shiftsPerDay);
}
