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

export const AUDIT_LOGS_PAGE_SIZE = 20;

export interface PaginatedAuditLogs {
  logs: AuditLog[];
  totalCount: number;
}

// Server-side paginated: the audit trail is the one table that grows
// forever by nature (nothing ever deletes an audit log), so unlike the
// client-side-slice pattern used elsewhere, fetching the whole table on
// every load isn't viable here - each page is its own request.
export async function fetchAuditLogsFromFirestore(
  orgId: string,
  page: number = 1,
  pageSize: number = AUDIT_LOGS_PAGE_SIZE
): Promise<PaginatedAuditLogs> {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await supabase
      .from(AUDIT_LOGS_TABLE)
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    return { logs: (data ?? []) as AuditLog[], totalCount: count ?? 0 };
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, AUDIT_LOGS_TABLE).catch(() => {});
    return { logs: [], totalCount: 0 };
  }
}
