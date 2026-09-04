import { supabase } from './supabase.ts';
import { ShiftTemplateConfig } from '../types/index.ts';

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

    // Initialize in the DB if not already present
    const initialTemplate: ShiftTemplateConfig = {
      ...DEFAULT_OPAP_SHIFT_TEMPLATE,
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
export async function saveShiftTemplateConfig(
  templateConfig: ShiftTemplateConfig
): Promise<void> {
  const { id, ...rest } = templateConfig;
  const { error } = await supabase.from('shift_templates').upsert(
    { ...rest, updated_at: new Date().toISOString() },
    { onConflict: 'organization_id,store_id' }
  );
  if (error) throw error;
}
