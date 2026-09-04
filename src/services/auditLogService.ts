import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from './firebase.ts';
import { AuditLog } from '../types/index.ts';

const AUDIT_LOGS_COLLECTION = 'auditLogs';

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
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const entry: AuditLog = {
      id,
      organization_id: params.organizationId,
      user_id: params.userId,
      user_email: params.userEmail,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      before_state: params.beforeState,
      after_state: params.afterState,
      created_at: new Date().toISOString(),
    };
    await setDoc(doc(db, AUDIT_LOGS_COLLECTION, id), cleanFirestoreData(entry));
  } catch (error) {
    // Best-effort, matching the rest of the app's convention for secondary
    // writes: never let an audit-log failure block the action it's logging.
    handleFirestoreError(error, OperationType.CREATE, AUDIT_LOGS_COLLECTION);
  }
}

export async function fetchAuditLogsFromFirestore(orgId: string): Promise<AuditLog[]> {
  try {
    const q = query(collection(db, AUDIT_LOGS_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    const logs: AuditLog[] = [];
    snap.forEach((d) => logs.push(d.data() as AuditLog));
    logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return logs;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, AUDIT_LOGS_COLLECTION);
    return [];
  }
}
