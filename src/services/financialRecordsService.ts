import { supabase, cleanData } from './supabase.ts';
import {
  VLT_RECONCILIATIONS_SAMPLE,
  WEEKLY_ROSTER_SAMPLE,
  VltReconciliationRecord,
  WeeklyRosterStore,
} from '../data/pnlData.ts';

// Fixed costs, company costs and payroll are month-scoped P&L records -
// see pnlService.ts.

// -------------------------------------------------------------
// TABLES
// -------------------------------------------------------------
export const VLT_RECONCILIATIONS_TABLE = 'vlt_reconciliations';
export const ROSTER_SCHEDULES_TABLE = 'roster_schedules';

// -------------------------------------------------------------
// VLT RECONCILIATIONS
// -------------------------------------------------------------
export async function fetchVltReconciliations(orgId: string): Promise<VltReconciliationRecord[]> {
  try {
    const { data, error } = await supabase.from(VLT_RECONCILIATIONS_TABLE).select('*').eq('organization_id', orgId).order('date', { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) return VLT_RECONCILIATIONS_SAMPLE.map((v, i) => ({ ...v, id: `vlt_default_${i}` }));
    return data.map((r) => ({
      id: r.id, storeId: r.store_id, date: r.date,
      opapnetAmount: Number(r.opap_net_amount) || 0, countedAmount: Number(r.counted_amount) || 0,
      difference: Number(r.difference) || 0, status: r.status,
    }));
  } catch (err) {
    console.error('Error fetching VLT reconciliations:', err);
    return VLT_RECONCILIATIONS_SAMPLE.map((v, i) => ({ ...v, id: `vlt_default_${i}` }));
  }
}

export async function saveVltReconciliation(orgId: string, rec: VltReconciliationRecord): Promise<void> {
  try {
    const payload = cleanData({
      id: rec.id && !rec.id.startsWith('vlt_default') ? rec.id : undefined,
      organization_id: orgId, store_id: rec.storeId, date: rec.date,
      opap_net_amount: rec.opapnetAmount, counted_amount: rec.countedAmount,
      difference: rec.difference, status: rec.status,
      updated_at: new Date().toISOString(),
    });
    const { error } = await supabase.from(VLT_RECONCILIATIONS_TABLE).upsert(payload);
    if (error) throw error;
  } catch (err) {
    console.error('Error saving VLT reconciliation:', err);
    throw err;
  }
}

// -------------------------------------------------------------
// ROSTER SCHEDULES
// -------------------------------------------------------------
export async function fetchRosterSchedules(orgId: string): Promise<WeeklyRosterStore[]> {
  try {
    const { data, error } = await supabase.from(ROSTER_SCHEDULES_TABLE).select('*').eq('organization_id', orgId);
    if (error) throw error;
    if (!data || data.length === 0) return WEEKLY_ROSTER_SAMPLE;
    return data.map((r) => ({ storeId: r.store_id, storeName: r.store_name, schedule: r.schedule }));
  } catch (err) {
    console.error('Error fetching roster schedules:', err);
    return WEEKLY_ROSTER_SAMPLE;
  }
}

export async function saveRosterSchedule(orgId: string, roster: WeeklyRosterStore): Promise<void> {
  try {
    const payload = {
      organization_id: orgId, store_id: roster.storeId, store_name: roster.storeName,
      schedule: roster.schedule, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from(ROSTER_SCHEDULES_TABLE).upsert(payload, { onConflict: 'organization_id,store_id' });
    if (error) throw error;
  } catch (err) {
    console.error('Error saving roster schedule:', err);
    throw err;
  }
}
