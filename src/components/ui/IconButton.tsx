import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type IconButtonTone = 'neutral' | 'primary' | 'danger' | 'success';
export type IconButtonSize = 'md' | 'sm';

// 'md' is the default 40px target. 'sm' (32px) exists for grids whose rows are
// already fixed height - the Scratch table's rows are 49px with 32px inputs, so
// a 40px button would grow every row instead of just the tap area.
const SIZE_CLASSES: Record<IconButtonSize, string> = {
  md: 'w-10 h-10',
  sm: 'w-8 h-8',
};

const ICON_SIZE_CLASSES: Record<IconButtonSize, string> = {
  md: 'w-4 h-4',
  sm: 'w-3.5 h-3.5',
};

const TONE_CLASSES: Record<IconButtonTone, string> = {
  neutral: 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:ring-slate-400',
  primary: 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 focus-visible:ring-indigo-500',
  danger: 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 focus-visible:ring-rose-500',
  success: 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 focus-visible:ring-emerald-500',
};

export interface IconButtonProps {
  icon: LucideIcon;
  /** Accessible name and tooltip - icon-only buttons have no visible label. */
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  tone?: IconButtonTone;
  size?: IconButtonSize;
  disabled?: boolean;
  className?: string;
}

// Row actions in dense tables: the icon stays small, the tap target does not.
// 40px square keeps a finger (or an older user's thumb on a tablet) from
// hitting the neighbouring row, which p-1/p-1.5 buttons (~28px) did not.
export const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  label,
  onClick,
  tone = 'neutral',
  size = 'md',
  disabled = false,
  className = '',
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`inline-flex items-center justify-center ${SIZE_CLASSES[size]} shrink-0 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-1 ${TONE_CLASSES[tone]} ${className}`}
  >
    <Icon className={ICON_SIZE_CLASSES[size]} />
  </button>
);
