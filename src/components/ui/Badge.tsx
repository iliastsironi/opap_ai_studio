import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';
export type BadgeVariant = 'soft' | 'solid' | 'glass';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: LucideIcon;
  dot?: boolean;
  pulse?: boolean;
  mono?: boolean;
  bordered?: boolean;
  className?: string;
  children: React.ReactNode;
}

// Every value below is a complete literal string, never a template interpolation -
// Tailwind's v4 scanner only picks up class names it can see verbatim at build time.
const TONE_VARIANT_CLASSES: Record<BadgeTone, Record<BadgeVariant, string>> = {
  success: {
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    solid: 'bg-emerald-600 text-white border-transparent',
    glass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  warning: {
    soft: 'bg-amber-50 text-amber-700 border-amber-200',
    solid: 'bg-amber-600 text-white border-transparent',
    glass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  danger: {
    soft: 'bg-rose-50 text-rose-700 border-rose-200',
    solid: 'bg-rose-600 text-white border-transparent',
    glass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  info: {
    soft: 'bg-blue-50 text-blue-700 border-blue-200',
    solid: 'bg-blue-600 text-white border-transparent',
    glass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  accent: {
    soft: 'bg-purple-50 text-purple-700 border-purple-200',
    solid: 'bg-purple-600 text-white border-transparent',
    glass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  neutral: {
    soft: 'bg-slate-100 text-slate-700 border-slate-200',
    solid: 'bg-slate-600 text-white border-transparent',
    glass: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  },
};

const DOT_TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-blue-500',
  accent: 'bg-purple-500',
  neutral: 'bg-slate-500',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'text-micro px-2 py-0.5',
  md: 'text-micro px-2.5 py-1',
};

export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  icon: Icon,
  dot = false,
  pulse = false,
  mono = false,
  bordered,
  className = '',
  children,
}) => {
  const showBorder = bordered ?? variant !== 'solid';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold transition-colors ${SIZE_CLASSES[size]} ${
        TONE_VARIANT_CLASSES[tone][variant]
      } ${showBorder ? 'border' : 'border border-transparent'} ${mono ? 'font-mono' : ''} ${className}`}
    >
      {dot && (
        <span className={`relative flex h-1.5 w-1.5 shrink-0 rounded-full ${DOT_TONE_CLASSES[tone]}`}>
          {pulse && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${DOT_TONE_CLASSES[tone]}`}
            />
          )}
        </span>
      )}
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      {children}
    </span>
  );
};
