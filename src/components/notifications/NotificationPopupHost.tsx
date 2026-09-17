import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Receipt, AlertTriangle, ArrowRight, Ticket } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Modal } from '../ui/Modal.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import {
  AppNotification,
  NotificationType,
  NOTIFICATIONS_REFRESH_EVENT,
  fetchMyPendingNotifications,
  markNotificationRead,
} from '../../services/notificationService.ts';

const POLL_INTERVAL_MS = 60_000;

const SHIFT_TYPE_LABELS: Record<string, string> = {
  MORNING: 'Πρωινή',
  AFTERNOON: 'Απογευματινή',
  NIGHT: 'Βραδινή',
  CUSTOM: 'Έκτακτη',
};

const VARIANTS: Record<NotificationType, { icon: LucideIcon; iconBox: string; shortcut?: { label: string; tab: string } }> = {
  HANDOVER_MESSAGE: { icon: MessageSquare, iconBox: 'bg-indigo-100 text-indigo-600' },
  EMPLOYEE_CHARGE: {
    icon: Receipt,
    iconBox: 'bg-rose-100 text-rose-600',
    shortcut: { label: 'Οι Χρεώσεις μου', tab: 'employee_charges' },
  },
  SHORTAGE_ALERT: {
    icon: AlertTriangle,
    iconBox: 'bg-amber-100 text-amber-600',
    shortcut: { label: 'Προβολή Βαρδιών', tab: 'shifts' },
  },
  LOTTERY_CANCEL_REMINDER: {
    icon: Ticket,
    iconBox: 'bg-violet-100 text-violet-600',
    shortcut: { label: 'Εθνικό Λαχείο', tab: 'national_lottery' },
  },
};

// The pop-up must be answered with «Το είδα» - Escape does nothing.
const ignoreClose = () => {};

function shiftTypeLabel(n: AppNotification): string | null {
  return n.shift ? SHIFT_TYPE_LABELS[n.shift.shift_type] || n.shift.shift_type : null;
}

function describeShift(n: AppNotification): string {
  if (!n.shift) return '';
  return [
    `${shiftTypeLabel(n)} βάρδια`,
    new Date(n.shift.closed_at || n.shift.opened_at).toLocaleDateString('el-GR'),
    n.shift.store_name,
  ]
    .filter(Boolean)
    .join(' · ');
}

function titleFor(n: AppNotification): string {
  if (n.type === 'HANDOVER_MESSAGE') {
    const label = shiftTypeLabel(n);
    return label ? `Μήνυμα από ${label.toLocaleLowerCase('el-GR')} βάρδια` : n.title;
  }
  return n.title;
}

interface NotificationPopupHostProps {
  onNavigate: (tab: string) => void;
}

export const NotificationPopupHost: React.FC<NotificationPopupHostProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A poll that started before «Το είδα» finished must not bring the pop-up back.
  const acknowledgedIds = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!userId) return;
    const pending = await fetchMyPendingNotifications(userId);
    setQueue(pending.filter((n) => !acknowledgedIds.current.has(n.id)));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setQueue([]);
      return;
    }
    load();
    const interval = window.setInterval(load, POLL_INTERVAL_MS);
    window.addEventListener('focus', load);
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, load);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', load);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, load);
    };
  }, [userId, load]);

  const current = queue[0];
  if (!current) return null;

  const variant = VARIANTS[current.type];
  const Icon = variant.icon;
  const shiftLine = describeShift(current);
  const amount = formatCurrency(Number(current.amount ?? 0));

  const acknowledge = async (navigateTo?: string) => {
    setIsMarking(true);
    setError(null);
    try {
      await markNotificationRead(current.id);
      acknowledgedIds.current.add(current.id);
      setQueue((q) => q.filter((n) => n.id !== current.id));
      if (navigateTo) onNavigate(navigateTo);
    } catch (e: any) {
      setError(e.message || 'Δεν αποθηκεύτηκε. Πατήστε ξανά «Το είδα».');
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={ignoreClose}
      headerStyle="none"
      size="md"
      layer="stacked"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {variant.shortcut && (
            <button
              type="button"
              disabled={isMarking}
              onClick={() => acknowledge(variant.shortcut!.tab)}
              className="px-4 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-base font-bold text-slate-800 cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <span>{variant.shortcut.label}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            autoFocus
            disabled={isMarking}
            onClick={() => acknowledge()}
            className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-black cursor-pointer disabled:opacity-60"
          >
            {isMarking ? 'Αποθήκευση...' : 'Το είδα'}
          </button>
        </div>
      }
    >
      <div className="space-y-4" role="alert">
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${variant.iconBox}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xl font-black text-slate-900 leading-snug text-balance">{titleFor(current)}</h2>
              {queue.length > 1 && (
                <span className="text-xs font-bold text-slate-500 bg-slate-100 rounded-lg px-2 py-1 shrink-0 tabular-nums">
                  1 από {queue.length}
                </span>
              )}
            </div>
            {shiftLine && <p className="text-sm text-slate-600 mt-1">{shiftLine}</p>}
          </div>
        </div>

        {current.type === 'HANDOVER_MESSAGE' && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              Από: <strong className="text-slate-900">{current.shift?.closed_by_user_name || current.shift?.opened_by_user_name || 'Συνάδελφος'}</strong>
            </p>
            <p className="text-lg text-slate-900 whitespace-pre-wrap break-words bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              {current.body}
            </p>
          </div>
        )}

        {current.type === 'EMPLOYEE_CHARGE' && (
          <div className="space-y-2">
            <p className="text-4xl font-black text-rose-600 font-mono tabular-nums">{amount}</p>
            <p className="text-base text-slate-700">
              Το ταμείο της βάρδιας έκλεισε με έλλειμμα και το ποσό καταχωρήθηκε στις χρεώσεις σας.
            </p>
          </div>
        )}

        {current.type === 'SHORTAGE_ALERT' && (
          <div className="space-y-2">
            <p className="text-base text-slate-700">
              Χειριστής: <strong className="text-slate-900">{current.shift?.opened_by_user_name || 'Υπάλληλος'}</strong>
            </p>
            <p className="text-4xl font-black text-amber-600 font-mono tabular-nums">−{amount}</p>
          </div>
        )}

        {current.type === 'LOTTERY_CANCEL_REMINDER' && (
          <p className="text-lg text-slate-900 whitespace-pre-wrap break-words bg-violet-50 border border-violet-100 rounded-xl p-4">
            {current.body}
          </p>
        )}

        {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
};
