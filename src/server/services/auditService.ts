import crypto from 'crypto';
import { execute, query } from '../../db/index.js';
import { AuditLog } from '../../types/index.js';

export interface CreateAuditLogParams {
  organizationId?: string;
  userId?: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAuditEvent(params: CreateAuditLogParams): Promise<void> {
  try {
    const id = 'audit_' + crypto.randomUUID();
    await execute(
      `INSERT INTO audit_logs 
       (id, organization_id, user_id, user_email, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
      [
        id,
        params.organizationId || null,
        params.userId || null,
        params.userEmail || null,
        params.action,
        params.entityType,
        params.entityId || null,
        params.beforeState ? JSON.stringify(params.beforeState) : null,
        params.afterState ? JSON.stringify(params.afterState) : null,
        params.ipAddress || null,
        params.userAgent || null,
      ]
    );
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}

export async function getAuditLogs(
  organizationId: string,
  limit: number = 100,
  offset: number = 0
): Promise<AuditLog[]> {
  const rows = await query<AuditLog>(
    `SELECT * FROM audit_logs 
     WHERE organization_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2 OFFSET $3`,
    [organizationId, limit, offset]
  );
  return rows;
}
