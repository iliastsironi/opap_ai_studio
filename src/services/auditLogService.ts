import { supabase, handleSupabaseError, OperationType, cleanData } from './supabase.ts';
import { AuditLog } from '../types/index.ts';

const AUDIT_LOGS_TABLE = 'audit_logs';

export async function writeAuditLog(params: {
  organizationId: string;
  userId?: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await supabase.from(AUDIT_LOGS_TABLE).insert(cleanData({
      organization_id: params.organizationId,
      user_id: params.userId,
      user_email: params.userEmail,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      before_state: params.beforeState,
      after_state: params.afterState,
      created_at: new Date().toISOString(),
    }));
    if (error) throw error;
  } catch (error) {
    // Best-effort, matching the rest of the app's convention for secondary
    // writes: never let an audit-log failure block the action it's logging.
    await handleSupabaseError(error, OperationType.CREATE, AUDIT_LOGS_TABLE).catch(() => {});
  }
}

export async function fetchAuditLogsFromFirestore(orgId: string): Promise<AuditLog[]> {
  try {
    const { data, error } = await supabase
      .from(AUDIT_LOGS_TABLE)
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AuditLog[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, AUDIT_LOGS_TABLE).catch(() => {});
    return [];
  }
}
