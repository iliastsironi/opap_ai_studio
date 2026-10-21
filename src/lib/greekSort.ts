/**
 * Sorting names the way a Greek reader expects.
 *
 * The customer lists came back in whatever order the database handed them
 * over - creation order, in practice - so finding somebody in the charge
 * dropdown meant reading the whole list. Alphabetical is the only order
 * anybody can search by eye.
 *
 * `localeCompare` with 'el' rather than a plain `<`, which compares UTF-16
 * code units: that puts every capital before every small letter (Ω before α)
 * and files accented letters after the whole alphabet, so «Άννα» would sort
 * after «Ωμέγα». It also folds ς and σ together, which matters for a name
 * typed either way.
 */

const collator = new Intl.Collator('el', { sensitivity: 'base', numeric: true });

export function compareGreek(a: unknown, b: unknown): number {
  return collator.compare(String(a ?? '').trim(), String(b ?? '').trim());
}

/** A copy in alphabetical order by `name`. Never sorts in place. */
export function sortByGreekName<T extends { name?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareGreek(a.name, b.name));
}
