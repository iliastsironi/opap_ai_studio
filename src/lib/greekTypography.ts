/**
 * Greek Typography Utility Functions
 * Enforces modern Greek typographic standards:
 * - Capital Greek letters must never have accent marks (τόνοι) e.g., Ά->Α, Έ->Ε, Ή->Η, Ί->Ι, Ό->Ο, Ύ->Υ, Ώ->Ω.
 */

const GREEK_ACCENT_MAP: Record<string, string> = {
  'Ά': 'Α',
  'Έ': 'Ε',
  'Ή': 'Η',
  'Ί': 'Ι',
  'Ϊ': 'Ι',
  'Ό': 'Ο',
  'Ύ': 'Υ',
  'Ϋ': 'Υ',
  'Ώ': 'Ω',
  'ά': 'Α',
  'έ': 'Ε',
  'ή': 'Η',
  'ί': 'Ι',
  'ϊ': 'Ι',
  'ΐ': 'Ι',
  'ό': 'Ο',
  'ύ': 'Υ',
  'ϋ': 'Υ',
  'ΰ': 'Υ',
  'ώ': 'Ω',
};

/**
 * Converts any Greek or standard text to pure uppercase without tonos or diacritics.
 */
export function toGreekUpper(text?: string | null): string {
  if (!text) return '';
  
  // Replace known accented Greek letters first
  let result = text;
  for (const [accented, unaccented] of Object.entries(GREEK_ACCENT_MAP)) {
    result = result.replaceAll(accented, unaccented);
  }
  
  // Standard uppercase + normalize removing any remaining combining diacritical marks
  return result
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Strips accents from Greek uppercase while preserving lowercase if needed,
 * or safely normalizes text for search and badges.
 */
export function stripGreekAccents(text?: string | null): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
