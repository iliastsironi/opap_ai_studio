import React from 'react';
import { Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Modal, ModalLayer } from './Modal.tsx';

export type ConfirmTone = 'destructive' | 'positive' | 'neutral';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: ConfirmTone;
  icon?: LucideIcon;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  isLoading?: boolean;
  loadingLabel?: string;
  closeOnBackdropClick?: boolean;
  layer?: ModalLayer;
}

const TONE_ICON: Record<ConfirmTone, LucideIcon> = {
  destructive: Trash2,
  positive: CheckCircle2,
  neutral: AlertTriangle,
};

const TONE_ICONBOX: Record<ConfirmTone, string> = {
  destructive: 'bg-rose-100 text-rose-600',
  positive: 'bg-emerald-100 text-emerald-600',
  neutral: 'bg-amber-100 text-amber-600',
};

const TONE_HEADING: Record<ConfirmTone, string> = {
  destructive: 'text-rose-600',
  positive: 'text-emerald-600',
  neutral: 'text-amber-600',
};

const TONE_BUTTON: Record<ConfirmTone, string> = {
  destructive: 'bg-rose-600 hover:bg-rose-700',
  positive: 'bg-emerald-600 hover:bg-emerald-700',
  neutral: 'bg-amber-600 hover:bg-amber-700',
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  tone = 'destructive',
  icon,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Ακύρωση',
  isLoading = false,
  loadingLabel,
  closeOnBackdropClick = true,
  layer,
}) => {
  const Icon = icon ?? TONE_ICON[tone];

  return (
    <Modal isOpen={isOpen} onClose={onCancel} headerStyle="none" size="md" layer={layer} closeOnBackdropClick={closeOnBackdropClick}>
      <div className="space-y-4">
        <div className={`flex items-center space-x-3 ${TONE_HEADING[tone]}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONE_ICONBOX[tone]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-base text-slate-900">{title}</h4>
        </div>
        <div className="text-sm text-slate-600">{message}</div>
        <div className="pt-2 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer text-sm font-bold"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2 text-white rounded-xl font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed text-sm flex items-center gap-2 ${TONE_BUTTON[tone]}`}
          >
            {isLoading && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {isLoading ? loadingLabel ?? `${confirmLabel}...` : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};
