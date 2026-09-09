import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '4xl' | '5xl' | '6xl';
export type ModalHeaderStyle = 'dark' | 'bordered' | 'none';
export type ModalLayer = 'base' | 'stacked';

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
};

const LAYER_CLASSES: Record<ModalLayer, string> = {
  base: 'z-50',
  stacked: 'z-60',
};

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  icon?: LucideIcon;
  badge?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerStyle?: ModalHeaderStyle;
  size?: ModalSize;
  layer?: ModalLayer;
  bodyAsForm?: boolean;
  onSubmit?: (e: React.FormEvent) => void;
  footer?: React.ReactNode;
  closeOnBackdropClick?: boolean;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  icon: Icon,
  badge,
  subtitle,
  headerStyle = 'dark',
  size = 'md',
  layer = 'base',
  bodyAsForm = false,
  onSubmit,
  footer,
  closeOnBackdropClick = false,
  children,
}) => {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const bodyContent = (
    <>
      <div className={headerStyle === 'none' ? 'p-6' : 'p-4 sm:p-5'}>{children}</div>
      {footer && (
        <div className={headerStyle === 'none' ? 'px-6 pb-6 pt-4 border-t border-slate-100' : 'px-4 sm:px-5 pb-4 sm:pb-5 pt-2 flex justify-end space-x-2'}>
          {footer}
        </div>
      )}
    </>
  );

  return (
    <div
      className={`fixed inset-0 ${LAYER_CLASSES[layer]} bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4`}
      onClick={closeOnBackdropClick ? onClose : undefined}
      role="presentation"
    >
      <div
        ref={cardRef}
        className={`bg-white rounded-2xl shadow-xl w-full ${SIZE_CLASSES[size]} overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {headerStyle === 'dark' && (
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {Icon && <Icon className="w-4 h-4 text-indigo-400 shrink-0" />}
              <div className="min-w-0">
                <h3 id={titleId} className="font-bold text-sm truncate">
                  {title}
                </h3>
                {subtitle && <p className="text-micro text-slate-400 truncate">{subtitle}</p>}
              </div>
              {badge}
            </div>
            <button
              onClick={onClose}
              aria-label="Κλείσιμο"
              className="text-slate-400 hover:text-white cursor-pointer shrink-0 ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {headerStyle === 'bordered' && (
          <div className="flex items-center justify-between border-b border-slate-100 px-6 pt-6 pb-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {Icon && <Icon className="w-5 h-5 text-indigo-600 shrink-0" />}
              <div className="min-w-0">
                <h3 id={titleId} className="font-bold text-base text-slate-900 truncate">
                  {title}
                </h3>
                {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
              </div>
              {badge}
            </div>
            <button
              onClick={onClose}
              aria-label="Κλείσιμο"
              className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0 ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {headerStyle === 'none' && title && (
          <h2 id={titleId} className="text-lg font-bold text-slate-900 px-6 pt-6">
            {title}
          </h2>
        )}

        <div className="overflow-y-auto flex-1 min-h-0">
          {bodyAsForm ? (
            <form onSubmit={onSubmit} className="flex flex-col">
              {bodyContent}
            </form>
          ) : (
            bodyContent
          )}
        </div>
      </div>
    </div>
  );
};

export interface ModalActionsProps {
  onCancel: () => void;
  cancelLabel?: string;
  onSave?: () => void;
  saveLabel?: string;
  saveTone?: 'primary' | 'destructive';
  isSaving?: boolean;
  savingLabel?: string;
  disabled?: boolean;
}

const SAVE_TONE_CLASSES: Record<'primary' | 'destructive', string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-700',
  destructive: 'bg-rose-600 hover:bg-rose-700',
};

export const ModalActions: React.FC<ModalActionsProps> = ({
  onCancel,
  cancelLabel = 'Ακύρωση',
  onSave,
  saveLabel = 'Αποθήκευση',
  saveTone = 'primary',
  isSaving = false,
  savingLabel,
  disabled = false,
}) => (
  <>
    <button
      type="button"
      onClick={onCancel}
      className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer text-sm font-bold"
    >
      {cancelLabel}
    </button>
    <button
      type={onSave ? 'button' : 'submit'}
      onClick={onSave}
      disabled={isSaving || disabled}
      className={`px-5 py-2 text-white rounded-xl font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed text-sm ${SAVE_TONE_CLASSES[saveTone]}`}
    >
      {isSaving ? savingLabel ?? 'Αποθήκευση...' : saveLabel}
    </button>
  </>
);
