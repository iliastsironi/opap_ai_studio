import { describe, expect, it } from 'vitest';
import {
  canReturnUnsold, deliveryFor, deliveryIdLabel, hasStandingQuantity,
  isValidDeliveryId, LOTTERY_DELIVERIES, normalizeDeliveryId, standingQuantityFor,
} from '../lib/lotteryDelivery.ts';

// Οι απαντήσεις του Owner, μία προς μία.
describe('πώς έρχεται κάθε λαχείο', () => {
  it('πάγια ποσότητα έχουν μόνο το Εθνικό και το Λαϊκό', () => {
    expect(hasStandingQuantity('scr_ethniko_x20')).toBe(true);
    expect(hasStandingQuantity('scr_laiko')).toBe(true);
    expect(hasStandingQuantity('scr_protochroniatiko')).toBe(false);
    expect(hasStandingQuantity('scr_eidiki_x5')).toBe(false);
    expect(hasStandingQuantity('scr_eidiki_x10')).toBe(false);
  });

  it('αδιάθετα επιστρέφουν το Λαϊκό και οι Ειδικές', () => {
    expect(canReturnUnsold('scr_laiko')).toBe(true);
    expect(canReturnUnsold('scr_eidiki_x5')).toBe(true);
    expect(canReturnUnsold('scr_eidiki_x10')).toBe(true);
  });

  it('Εθνικό και Πρωτοχρονιάτικο τα χρεώνονται, άρα δεν δηλώνουν επιστροφή', () => {
    expect(canReturnUnsold('scr_ethniko_x20')).toBe(false);
    expect(canReturnUnsold('scr_protochroniatiko')).toBe(false);
  });

  it('πάγια ποσότητα και επιστροφή είναι ανεξάρτητα - το Εθνικό το δείχνει', () => {
    const ethniko = deliveryFor('scr_ethniko_x20')!;
    expect(ethniko.standingKey).not.toBeNull();
    expect(ethniko.unsold).toBe('CHARGED');
  });

  it('ένα λαχείο που δεν ξέρουμε κρατά το κουμπί των αδιάθετων', () => {
    // Το να μην μπορείς να δηλώσεις επιστροφή που έγινε χρεώνει τον
    // υπάλληλο· το αντίστροφο απλώς δεν πατιέται.
    expect(canReturnUnsold('scr_kati_allo')).toBe(true);
    expect(hasStandingQuantity('scr_kati_allo')).toBe(false);
  });
});

describe('η πάγια ποσότητα του καταστήματος', () => {
  it('διαβάζεται από το πρότυπο', () => {
    expect(standingQuantityFor('scr_laiko', { laiko_standing_order_bundles: 40 })).toBe(40);
    expect(standingQuantityFor('scr_ethniko_x20', { ethniko_standing_order_bundles: 12 })).toBe(12);
  });

  it('το μηδέν σημαίνει «δεν παίρνουμε», όχι «δεν ορίστηκε»', () => {
    expect(standingQuantityFor('scr_ethniko_x20', { ethniko_standing_order_bundles: 0 })).toBe(0);
  });

  it('null όταν δεν έχει οριστεί ή δεν υπάρχει πάγια', () => {
    expect(standingQuantityFor('scr_ethniko_x20', {})).toBeNull();
    expect(standingQuantityFor('scr_ethniko_x20', { ethniko_standing_order_bundles: null })).toBeNull();
    expect(standingQuantityFor('scr_protochroniatiko', { whatever: 5 })).toBeNull();
    expect(standingQuantityFor('scr_laiko', null)).toBeNull();
  });
});

describe('ο αριθμός της παραλαβής', () => {
  it('τα λαχεία έχουν αριθμό κλήρωσης, τα σκρατς κωδικό πακέτου', () => {
    expect(deliveryIdLabel(true)).toBe('Αριθμός κλήρωσης');
    expect(deliveryIdLabel(false)).toBe('Κωδικός πακέτου');
  });

  it('ο επταψήφιος κανόνας ισχύει μόνο στα σκρατς', () => {
    expect(isValidDeliveryId(false, '1234567')).toBe(true);
    expect(isValidDeliveryId(false, '123456')).toBe(false);
    // Μια κλήρωση δεν ξέρουμε πόσα ψηφία έχει - δεν επινοούμε κανόνα.
    expect(isValidDeliveryId(true, '2451')).toBe(true);
    expect(isValidDeliveryId(true, '1234567')).toBe(true);
  });

  it('κενό δεν περνάει πουθενά', () => {
    expect(isValidDeliveryId(true, '')).toBe(false);
    expect(isValidDeliveryId(true, '   ')).toBe(false);
    expect(isValidDeliveryId(true, 'κλήρωση')).toBe(false);
    expect(isValidDeliveryId(false, '')).toBe(false);
  });
});

describe('ο κατάλογος', () => {
  it('καλύπτει και τα πέντε λαχεία, χωρίς διπλά', () => {
    const ids = LOTTERY_DELIVERIES.map((d) => d.rowId);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toContain('scr_ethniko_x20');
    expect(ids).toContain('scr_protochroniatiko');
  });
});

describe('ο αριθμός καθώς γράφεται', () => {
  it('κρατά μόνο ψηφία', () => {
    expect(normalizeDeliveryId(true, '24-51 α')).toBe('2451');
    expect(normalizeDeliveryId(false, 'AB123 4567')).toBe('1234567');
  });

  it('τα 7 ψηφία είναι κανόνας του πακέτου, όχι της κλήρωσης', () => {
    // Κόβοντας στα 7 παντού θα ακρωτηρίαζε σιωπηλά μια μεγαλύτερη κλήρωση.
    expect(normalizeDeliveryId(false, '123456789')).toBe('1234567');
    expect(normalizeDeliveryId(true, '123456789')).toBe('123456789');
  });
});

describe('πεντάδες ↔ κομμάτια, όταν δεν υπάρχει πεντάδα από πίσω', () => {
  it('bundleSize 0 δεν σημαίνει «δεν ορίστηκε»', async () => {
    const { bundlesToPieces, piecesToBundles, standingOrderPieces } =
      await import('../lib/laikoCancellation.ts');

    // Λαϊκό: 2 €/κομμάτι, πεντάδα 5. 40 πεντάδες = 200 κομμάτια στο ράφι.
    expect(bundlesToPieces(40, 5)).toBe(200);
    expect(standingOrderPieces(40, 5)).toBe(200);
    expect(piecesToBundles(200, 5)).toBe(40);

    // Εθνικό: η μονάδα ΕΙΝΑΙ η πεντάδα. 40 πεντάδες = 40 στο ράφι, όχι 200.
    expect(bundlesToPieces(40, 0)).toBe(40);
    expect(standingOrderPieces(40, 0)).toBe(40);
    expect(piecesToBundles(40, 0)).toBe(40);
  });
});
