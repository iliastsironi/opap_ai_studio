import { supabase, handleSupabaseError, OperationType } from './supabase.ts';

const TABLE_NAME = 'notifications';

export type NotificationType =
  | 'HANDOVER_MESSAGE'
  | 'EMPLOYEE_CHARGE'
  | 'SHORTAGE_ALERT'
  | 'LOTTERY_CANCEL_REMINDER';

export interface AppNotification {
  id: string;
  organization_id: string;
  store_id: string | null;
  recipient_user_id: string;
  recipient_name: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  amount: number | null;
  shift_id: string | null;
  charge_id: string | null;
  created_by_user_id: string | null;
  expires_at: string | null;
  read_at: string | null;
  created_at: string;
  shift: {
    shift_type: string;
    store_name: string | null;
    opened_at: string;
    closed_at: string | null;
    opened_by_user_name: string | null;
    closed_by_user_name: string | null;
  } | null;
}

export interface HandoverReceipt {
  recipient_user_id: string;
  recipient_name: string | null;
  read_at: string | null;
}

export const NOTIFICATIONS_REFRESH_EVENT = 'shiftledger:notifications-refresh';

export function requestNotificationsRefresh(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
}

export async function fetchMyPendingNotifications(userId: string): Promise<AppNotification[]> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(
        '*, shift:shifts!notifications_shift_id_fkey(shift_type, store_name, opened_at, closed_at, opened_by_user_name, closed_by_user_name)'
      )
      .eq('recipient_user_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const now = Date.now();
    return ((data ?? []) as AppNotification[]).filter(
      (n) => !n.expires_at || new Date(n.expires_at).getTime() > now
    );
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, TABLE_NAME).catch(() => {});
    return [];
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: notificationId });
  if (error) await handleSupabaseError(error, OperationType.UPDATE, TABLE_NAME);
}

export async function fetchShiftHandoverReceipts(shiftId: string): Promise<HandoverReceipt[]> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('recipient_user_id, recipient_name, read_at')
      .eq('shift_id', shiftId)
      .eq('type', 'HANDOVER_MESSAGE')
      .order('recipient_name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as HandoverReceipt[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, TABLE_NAME).catch(() => {});
    return [];
  }
}
