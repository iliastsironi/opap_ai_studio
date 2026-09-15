import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { athensDateKey, daysOfMonth } from '../../lib/pnlEngine.ts';

export const shortDay = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
export const fullDay = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

export const percentLabel = (value: number | null): string =>
  value === null ? '—' : `${(value * 100).toFixed(1).replace('.', ',')}%`;

export function monthBounds(month: string): { min: string; max: string } {
  const days = daysOfMonth(month);
  return { min: days[0], max: days[days.length - 1] };
}

// Today when browsing the current month, otherwise the month's last day.
export function defaultEntryDate(month: string): string {
  const today = athensDateKey(new Date().toISOString());
  return today.slice(0, 7) === month ? today : monthBounds(month).max;
}

const actionBase =
  'px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
export const primaryAction = `${actionBase} bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs`;
export const secondaryAction = `${actionBase} border border-slate-300 bg-white hover:bg-slate-50 text-slate-700`;
export const iconAction = 'p-1.5 rounded-lg text-slate-500 transition-colors cursor-pointer';

interface PnlSectionProps {
  title: string;
  icon: LucideIcon;
  subtitle?: string;
  aside?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const PnlSection: React.FC<PnlSectionProps> = ({ title, icon: Icon, subtitle, aside, actions, children }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-2xs">
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
      <div className="flex items-start gap-2 min-w-0">
        <Icon className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {aside}
        {actions}
      </div>
    </header>
    <div className="p-5">{children}</div>
  </section>
);
