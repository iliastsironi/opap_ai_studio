import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from './Badge.tsx';

export type StatCardTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
export type StatCardSize = 'hero' | 'standard' | 'compact';

export interface StatCardTrend {
  direction: 'up' | 'down' | 'flat';
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'neutral';
}

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  icon?: LucideIcon;
  iconTone?: StatCardTone;
  iconPosition?: 'top' | 'left';
  tone?: StatCardTone;
  size?: StatCardSize;
  trend?: StatCardTrend;
  footer?: React.ReactNode;
  valueMono?: boolean;
  valueClassName?: string;
}

const CARD_TONE_CLASSES: Record<StatCardTone, string> = {
  neutral: 'bg-white border-slate-200',
  success: 'bg-emerald-50/70 border-emerald-100',
  warning: 'bg-amber-50/70 border-amber-100',
  danger: 'bg-rose-50/70 border-rose-100',
  info: 'bg-blue-50/70 border-blue-100',
  accent: 'bg-purple-50/70 border-purple-100',
};

const ICON_BOX_TONE_CLASSES: Record<StatCardTone, string> = {
  neutral: 'bg-slate-50 text-slate-600 border-slate-100',
  success: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  warning: 'bg-amber-50 text-amber-600 border-amber-100',
  danger: 'bg-rose-50 text-rose-600 border-rose-100',
  info: 'bg-blue-50 text-blue-600 border-blue-100',
  accent: 'bg-purple-50 text-purple-600 border-purple-100',
};

const TREND_TONE: Record<'up' | 'down' | 'flat', 'success' | 'danger' | 'neutral'> = {
  up: 'success',
  down: 'danger',
  flat: 'neutral',
};

const TREND_ICON: Record<'up' | 'down' | 'flat', LucideIcon> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  caption,
  icon: Icon,
  iconTone,
  iconPosition = 'top',
  tone = 'neutral',
  size = 'standard',
  trend,
  footer,
  valueMono = false,
  valueClassName = '',
}) => {
  const resolvedIconTone = iconTone ?? tone;

  if (size === 'hero') {
    return (
      <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white border border-indigo-800 shadow-md">
        <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider block">{label}</span>
        <div className={`text-3xl font-black text-emerald-400 mt-1 ${valueMono ? 'font-mono' : ''} ${valueClassName}`}>
          {value}
        </div>
        {caption && <p className="text-[10px] text-indigo-200/80 mt-1 font-medium">{caption}</p>}
      </div>
    );
  }

  if (iconPosition === 'left') {
    return (
      <div className={`p-3 border rounded-xl flex items-center justify-between ${CARD_TONE_CLASSES[tone]}`}>
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 shrink-0" />}
          <span className="text-xs font-bold truncate">{label}</span>
        </div>
        <div className={`text-xs font-mono font-black shrink-0 ${valueClassName}`}>{value}</div>
      </div>
    );
  }

  const isCompact = size === 'compact';

  return (
    <div className={`p-5 rounded-2xl border shadow-2xs ${CARD_TONE_CLASSES[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</span>
        {Icon && (
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${ICON_BOX_TONE_CLASSES[resolvedIconTone]}`}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className={`mt-2 flex items-baseline justify-between gap-2 ${isCompact ? 'text-lg' : 'text-2xl'} font-black text-slate-900`}>
        <span className={`${valueMono ? 'font-mono' : ''} ${valueClassName}`}>{value}</span>
        {trend && (
          <Badge tone={trend.tone ?? TREND_TONE[trend.direction]} size="sm">
            {React.createElement(TREND_ICON[trend.direction], { className: 'w-3 h-3' })}
            {trend.label}
          </Badge>
        )}
      </div>

      {caption && <p className="text-[11px] text-slate-500 font-medium mt-1">{caption}</p>}

      {footer && <div className="mt-3 pt-3 border-t border-slate-100 text-[11px]">{footer}</div>}
    </div>
  );
};
