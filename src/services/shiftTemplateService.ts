import { supabase, unknownColumnFrom } from './supabase.ts';
import { ShiftTemplateConfig } from '../types/index.ts';
import { overridesFor } from '../lib/storeTypeDefaults.ts';

export const DEFAULT_OPAP_SHIFT_TEMPLATE: ShiftTemplateConfig = {
  id: 'template_opap_default',
  organization_id: 'default',
  name: 'Πρότυπο Αναφοράς Βάρδιας (OPAP Standard Report)',
  show_scratch: true,
  show_tora: true,
  show_clever_point: true,
  show_ippodromos: true,
  show_vlts: true,
  show_pame_stoixima: true,
  show_number_games: true,
  show_fnb: true,
  show_coins_breakdown: true,
  show_notes_breakdown: true,
  // Matching what the shift-opening screen used to default to, so no store
  // sees a different figure until an Owner changes one.
  discrepancy_threshold: 15,
  opening_float_notes: 150,
  opening_float_coins: 50,
  opening_float_employee_editable: false,
  shifts_per_day: 3,
  // The way the agency runs: the morning checks what the night left, and
  // nobody is asked to count a till in the middle of trade.
  inspection_mode: 'FIRST_SHIFT_ONLY',
  collection_summary_mode: 'LAST_SHIFT_ONLY',
  topup_employee_allowed: false,
  safedrop_employee_allowed: false,
  morning_coins_carry_over: true,
  pos_terminal_count: 2,
  // Off everywhere. A PLAY store turns these on in «Διαμόρφωση»; no existing
  // agency's closing screen changes until somebody does.
  pos_batch_close_enabled: false,
  vlt_machine_cash_enabled: false,
  // Matches today's implicit per-row inference exactly (Σκρατς: front+back,
  // Λαχεία: plain pieces) - existing orgs see zero behavior change until an
  // owner flips one of these in the Configurator.
  scratch_backside_default: true,
  lottery_bundle_default: false,
  scratch_selling_mode: 'FRONT_AND_BACK',
  show_national_lottery: true,
  special_edition_enabled: false,
  // Each on its own switch (0055). All off: a seasonal edition belongs in the
  // till list only while it is actually on the counter.
  special_edition_x5_enabled: false,
  special_edition_x10_enabled: false,
  protochroniatiko_enabled: false,
  // Πεντάδες: sold in fives far more often than singly (0056).
  special_edition_x5_bundles: true,
  special_edition_x10_bundles: true,
  protochroniatiko_bundles: true,
  laiko_selling_mode: 'PIECES_AND_BUNDLES',
  // 0 = δεν έχει οριστεί· ο διάλογος ρωτάει κανονικά, όπως σήμερα.
  laiko_standing_order_bundles: 0,
  safe_direction: 'DROP',
  // Κάθε λαχείο όπως έρχεται συσκευασμένο, μέχρι να πει αλλιώς το μαγαζί.
  lottery_units: {
    scr_laiko: 'DUAL',
    scr_ethniko_x20: 'BUNDLES',
    scr_eidiki_x5: 'BUNDLES',
    scr_eidiki_x10: 'BUNDLES',
    scr_protochroniatiko: 'BUNDLES',
  },
  custom_fields: [
    // System-Managed Calculation Fields
    {
      id: 'sys_scratch_net',
      key: 'scratch_lotto_sales',
      label: 'Καθαρό Σύνολο Σκρατς & Λαχείων',
      section: 'REPORTS',
      type: 'SYSTEM_MANAGED',
      isSystemManaged: true,
      enabled: true,
      required: false,
      description: 'Υπολογίζεται αυτόματα: Πωλήσεις - Εξαργυρώσεις Λαχείων',
      order: 1,
    },
    {
      id: 'sys_tora_total',
      key: 'tora_total',
      label: 'Σύνολο TORA DIRECT (#1 + #2)',
      section: 'REPORTS',
      type: 'SYSTEM_MANAGED',
      isSystemManaged: true,
      enabled: true,
      required: false,
      description: 'Υπολογίζεται αυτόματα: TORA DIRECT 1 + TORA DIRECT 2',
      order: 2,
    },
    {
      id: 'sys_number_games_net',
      key: 'number_games_net',
      label: 'Καθαρό Σύνολο Αριθμοπαιχνιδιών',
      section: 'REPORTS',
      type: 'SYSTEM_MANAGED',
      isSystemManaged: true,
      enabled: true,
      required: false,
      description: 'Υπολογίζεται αυτόματα: Πωλήσεις - Ακυρώσεις - Πληρωμές + Vouchers',
      order: 3,
    },
    {
      id: 'sys_fnb_total',
      key: 'fnb_total',
      label: 'Σύνολο FnB (Καφέ / Bar)',
      section: 'REPORTS',
      type: 'SYSTEM_MANAGED',
      isSystemManaged: true,
      enabled: true,
      required: false,
      description: 'Υπολογίζεται αυτόματα: Μετρητά FnB + POS FnB',
      order: 4,
    },
    {
      id: 'sys_expected_cash',
      key: 'expected_cash',
      label: 'Αναμενόμενα Μετρητά Ταμείου',
      section: 'COUNTING',
      type: 'SYSTEM_MANAGED',
      isSystemManaged: true,
      enabled: true,
      required: false,
      description: 'Υπολογίζεται αυτόματα από το σύνολο αναφορών & αρχικό ταμείο',
      order: 5,
    },
    {
      id: 'sys_discrepancy',
      key: 'discrepancy',
      label: 'Απόκλιση / Διαφορά Ταμείου',
      section: 'COUNTING',
      type: 'SYSTEM_MANAGED',
      isSystemManaged: true,
      enabled: true,
      required: false,
      description: 'Υπολογίζεται αυτόματα: Μετρητά Καταμέτρησης - Αναμενόμενα Μετρητά',
      order: 6,
    },

    // Custom Manager-Defined Fields
    {
      id: 'field_safe_drop',
      key: 'custom_safe_drop',
      label: 'Κατάθεση Χρηματοκιβωτίου (Safe Drop)',
      section: 'COUNTING',
      type: 'CURRENCY',
      isSystemManaged: false,
      enabled: true,
      required: true,
      placeholder: '0.00',
      description: 'Ποσό που τοποθετήθηκε στο χρηματοκιβώτιο ασφαλείας κατά το κλείσιμο',
      order: 7,
    },
    {
      id: 'field_cleaning',
      key: 'custom_cleaning_expense',
      label: 'Έξοδα Καθαριότητας / Αναλώσιμα',
      section: 'COUNTING',
      type: 'CURRENCY',
      isSystemManaged: false,
      enabled: true,
      required: false,
      placeholder: '0.00',
      description: 'Έκτακτες αγορές καθαριστικών ή αναλωσίμων με απόδειξη',
      order: 8,
    },
    {
      id: 'field_courier',
      key: 'custom_courier_vouchers',
      label: 'Vouchers ACS / Courier',
      section: 'REPORTS',
      type: 'NUMBER',
      isSystemManaged: false,
      enabled: true,
      required: false,
      placeholder: 'Αριθμός αποστολών',
      description: 'Πλήθος δελτίων ταχυμεταφορών που διακινήθηκαν στη βάρδια',
      order: 9,
    },
    {
      id: 'field_sanitized',
      key: 'custom_sanitization_check',
      label: 'Έλεγχος Καθαριότητας & Απολύμανσης',
      section: 'COUNTING',
      type: 'BOOLEAN',
      isSystemManaged: false,
      enabled: true,
      required: true,
      description: 'Επιβεβαίωση ότι τα τερματικά & ο χώρος καθαρίστηκαν',
      order: 10,
    },
    {
      id: 'field_note',
      key: 'custom_shift_note',
      label: 'Ειδική Παρατήρηση Βάρδιας',
      section: 'COUNTING',
      type: 'TEXT',
      isSystemManaged: false,
      enabled: true,
      required: false,
      placeholder: 'Γράψτε τυχόν συμβάντα...',
      description: 'Σημείωση προς τον διευθυντή ή την επόμενη βάρδια',
      order: 11,
    },
  ],
};

/**
 * The store's type, for seeding its first template.
 *
 * Returns undefined rather than throwing on any problem: a template that
 * cannot be created is a worse outcome than one created on the agency
 * default, which is exactly what happened before this existed.
 */
async function fetchStoreType(storeId: string): Promise<string | undefined> {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('store_type')
      .eq('id', storeId)
      .maybeSingle();
    if (error) throw error;
    return (data as { store_type?: string } | null)?.store_type;
  } catch (err) {
    console.warn('[ShiftTemplateService] could not read the store type:', err);
    return undefined;
  }
}

/**
 * Loads the customized shift template configuration for an organization or store.
 */
export async function getShiftTemplateConfig(
  orgId: string,
  storeId?: string
): Promise<ShiftTemplateConfig> {
  try {
    let q = supabase.from('shift_templates').select('*').eq('organization_id', orgId);
    q = storeId ? q.eq('store_id', storeId) : q.is('store_id', null);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;

    if (data) {
      return data as ShiftTemplateConfig;
    }

    // Initialize in the DB if not already present.
    //
    // Seeded from the store's own TYPE, not from the agency default every
    // time. A PLAY hall has no scratch, no ΤΟΡΑ, no ιππόδρομος and a card
    // terminal that closes its batch at midnight - all of which the store
    // type already says. Seeding it as an agency meant somebody who had just
    // chosen «PLAY OPAP Store» was asked to say the same thing again through
    // ten switches, and until they did, the hall's till looked exactly like
    // the agency's. See lib/storeTypeDefaults.ts.
    //
    // Only ever on CREATE. A store that already has a template keeps what is
    // in it, whatever its type: this must not reach back and overwrite a
    // choice somebody made.
    const storeType = storeId ? await fetchStoreType(storeId) : undefined;
    const initialTemplate: ShiftTemplateConfig = {
      ...DEFAULT_OPAP_SHIFT_TEMPLATE,
      ...overridesFor(storeType),
      organization_id: orgId,
      store_id: storeId,
      updated_at: new Date().toISOString(),
    };
    const { data: inserted } = await supabase.from('shift_templates').insert(initialTemplate).select().maybeSingle();
    return (inserted as ShiftTemplateConfig) || initialTemplate;
  } catch (err) {
    console.warn('[ShiftTemplateService] Could not load template, using default template:', err);
  }

  // Fallback to default
  return {
    ...DEFAULT_OPAP_SHIFT_TEMPLATE,
    organization_id: orgId,
    store_id: storeId,
  };
}

/**
 * Saves a customized shift template configuration for an organization or store.
 */
/**
 * PostgREST answers PGRST204 when the payload names something that is not a
 * column, and it refuses the whole statement rather than the one key - so a
 * single unknown field loses every setting on the screen.
 *
 * That happens whenever a deploy lands before its migration, which is the
 * normal order here: the code ships on push and the SQL is run by hand. It
 * has now cost the configuration screen twice, once for a users table and
 * once for morning_coins_carry_over, both times reading as «δεν με αφήνει να
 * αποθηκεύσω» with nothing saying which field was at fault.
 *
 * The message names the column. Drop it, try again, and say so - the setting
 * that could not be stored simply has no column yet, and the other twenty
 * have no reason to go down with it.
 */
export async function saveShiftTemplateConfig(
  templateConfig: ShiftTemplateConfig
): Promise<void> {
  const { id, ...rest } = templateConfig;
  let payload: Record<string, any> = { ...rest, updated_at: new Date().toISOString() };
  const dropped: string[] = [];

  // Bounded: each attempt removes one column, and the payload is finite.
  for (let attempt = 0; attempt < Object.keys(payload).length; attempt += 1) {
    const { error } = await supabase
      .from('shift_templates')
      .upsert(payload, { onConflict: 'organization_id,store_id' });
    if (!error) {
      if (dropped.length > 0) {
        console.warn(
          `[shiftTemplate] saved without ${dropped.join(', ')} - no such column yet. ` +
            'Run the pending migration to store these.'
        );
      }
      return;
    }

    const missing = unknownColumnFrom(error.message);
    if (!missing || !(missing in payload)) throw error;

    const { [missing]: _removed, ...remaining } = payload;
    payload = remaining;
    dropped.push(missing);
  }

  throw new Error('Η αποθήκευση της διαμόρφωσης απέτυχε.');
}
