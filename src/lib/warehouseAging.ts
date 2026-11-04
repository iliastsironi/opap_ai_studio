/**
 * Πόσο καιρό κάθεται ένα πακέτο, και πότε αρχίζει να καίει.
 *
 * Το ρολόι ξεκινά από την ημερομηνία παραλαβής και μετράει ημερολογιακές
 * ημέρες Αθήνας - όχι ώρες. Ένα πακέτο που παρελήφθη χθες το απόγευμα και
 * το κοιτάς σήμερα το πρωί είναι μιας ημέρας, όχι μισής, γιατί έτσι το
 * μετράει και αυτός που το έχει στο ράφι.
 *
 *    0 – 84    τίποτα
 *   85 – 89    πλησιάζει
 *   90 – 110   έντονη ειδοποίηση
 *      111+    μένει κόκκινο μέχρι να αποσυρθεί
 *
 * Το τελευταίο σκαλί δεν σβήνει μόνο του. Μια ειδοποίηση που εξαφανίζεται
 * επειδή πέρασε πολύς καιρός είναι η χειρότερη εκδοχή: το πακέτο που
 * ξεχάστηκε περισσότερο απ' όλα θα ήταν το μόνο που δεν φαίνεται.
 */

export const WARN_AFTER_DAYS = 85;
export const EXPIRY_DAYS = 90;
export const HARD_LIMIT_DAYS = 110;

export type AgingTone = 'OK' | 'WARNING' | 'CRITICAL';

const athensDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** «2026-11-04» για οποιαδήποτε στιγμή, σε ώρα Αθήνας. */
export function athensDay_(at: Date | string): string {
  return athensDay.format(typeof at === 'string' ? new Date(at) : at);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Ημερολογιακές ημέρες από την παραλαβή μέχρι σήμερα.
 *
 * Υπολογίζεται πάνω σε ημερομηνίες και όχι σε στιγμές, ώστε να μην
 * εξαρτάται από την ώρα της ημέρας· η διαφορά σε UTC midnight δεν
 * επηρεάζεται από την αλλαγή της θερινής ώρας.
 */
export function daysInWarehouse(receivedAt: string | null | undefined, now: Date = new Date()): number {
  const received = String(receivedAt ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(received)) return 0;
  const from = Date.parse(`${received}T00:00:00Z`);
  const to = Date.parse(`${athensDay_(now)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  // Ημερομηνία παραλαβής στο μέλλον: μηδέν, όχι αρνητικό. Μια
  // λανθασμένη καταχώρηση δεν πρέπει να διαβάζεται σαν φρέσκο απόθεμα
  // ούτε σαν ληγμένο.
  return Math.max(0, Math.round((to - from) / MS_PER_DAY));
}

export function agingTone(days: number): AgingTone {
  if (days >= EXPIRY_DAYS) return 'CRITICAL';
  if (days >= WARN_AFTER_DAYS) return 'WARNING';
  return 'OK';
}

/** Τι γράφει δίπλα στο πακέτο. null όταν δεν υπάρχει λόγος να γράψει κάτι. */
export function agingLabel(days: number): string | null {
  if (days > HARD_LIMIT_DAYS) return `${days} ημέρες — έπρεπε να έχει αποσυρθεί`;
  if (days >= EXPIRY_DAYS) return `${days} ημέρες — έληξε`;
  if (days >= WARN_AFTER_DAYS) return `${days} ημέρες — λήγει σε ${EXPIRY_DAYS - days}`;
  return null;
}

export interface AgingSummary {
  warning: number;
  critical: number;
  /** Πόσα ευρώ κάθονται σε ληγμένα - ο λόγος που η ειδοποίηση υπάρχει. */
  criticalValue: number;
}

/** Η σύνοψη πάνω από τη λίστα: πόσα πλησιάζουν, πόσα έληξαν, πόσα ευρώ. */
export function summariseAging(
  packs: ReadonlyArray<{ received_at?: string | null; pieces?: unknown; unit_price?: unknown }>,
  now: Date = new Date()
): AgingSummary {
  let warning = 0;
  let critical = 0;
  let criticalValue = 0;
  for (const pack of packs) {
    const tone = agingTone(daysInWarehouse(pack.received_at, now));
    if (tone === 'WARNING') warning++;
    if (tone === 'CRITICAL') {
      critical++;
      criticalValue += (Number(pack.pieces) || 0) * (Number(pack.unit_price) || 0);
    }
  }
  return { warning, critical, criticalValue: Math.round(criticalValue * 100) / 100 };
}
