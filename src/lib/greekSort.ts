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

/**
 * The part of a name that decides where it files.
 *
 * Some customers are recorded with a leading tag - «[Staff] Βάσω Ταραρά».
 * The bracket sorts before every letter, so an alphabetical list came out as
 * two: the four tagged names first, then everybody else. Both halves were in
 * order, which is why it looked almost right.
 *
 * Dropping the tag for sorting files Βάσω under Β, where somebody looking for
 * her would look. The tag is still shown - it is part of the name.
 */
export function sortableName(name: unknown): string {
  return String(name ?? '').trim().replace(/^\[[^\]]*\]\s*/, '');
}

/** A copy in alphabetical order by `name`. Never sorts in place. */
export function sortByGreekName<T extends { name?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const byName = compareGreek(sortableName(a.name), sortableName(b.name));
    // Two people whose names differ only by a tag keep a stable order.
    return byName !== 0 ? byName : compareGreek(a.name, b.name);
  });
}
