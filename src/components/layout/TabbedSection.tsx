import React, { Suspense, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

/**
 * Μία θέση στο πλευρικό μενού, δύο οθόνες από κάτω.
 *
 * Ο ιδιοκτήτης: «Έξοδα και προμηθευτές μαζί», «Χρήστες + ρόλοι μαζί». Κάθε
 * οθόνη μένει ακριβώς όπως ήταν, με τα δικά της δικαιώματα· εδώ μπαίνει μόνο η
 * μπάρα καρτελών από πάνω. Μια καρτέλα που ο χρήστης δεν δικαιούται δεν
 * εμφανίζεται, και αν του μένει μία, δεν εμφανίζεται καθόλου μπάρα: ένας
 * υπάλληλος που δεν βλέπει τους ρόλους δεν πρέπει να βλέπει ούτε μια μπάρα
 * με μία καρτέλα.
 */
export interface SectionTab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Ο κωδικός δικαιώματος που ζητά η οθόνη· χωρίς, την βλέπουν όλοι. */
  perm?: string;
  /** Η οθόνη. Μπορεί να είναι lazy: η κάθε καρτέλα φορτώνει μόνο όταν ανοίξει. */
  Component: React.ComponentType;
}

/** Οι καρτέλες που δικαιούται ο χρήστης, με τη σειρά που δόθηκαν. */
export function visibleTabs(tabs: ReadonlyArray<SectionTab>, can: (perm: string) => boolean): SectionTab[] {
  return tabs.filter((t) => !t.perm || can(t.perm));
}

const TabFallback: React.FC = () => (
  <div className="flex items-center justify-center py-24" role="status" aria-live="polite">
    <div aria-hidden="true" className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
    <span className="sr-only">Φόρτωση…</span>
  </div>
);

export const TabbedSection: React.FC<{ label: string; tabs: ReadonlyArray<SectionTab> }> = ({ label, tabs }) => {
  const { hasPermission } = useAuth();
  const allowed = visibleTabs(tabs, hasPermission);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Αν η επιλεγμένη καρτέλα δεν ισχύει πια (άλλαξε το δικαίωμα), πρώτη διαθέσιμη.
  const active = allowed.find((t) => t.id === activeId) ?? allowed[0];
  if (!active) return null;
  const Active = active.Component;

  return (
    <div className="space-y-6">
      {allowed.length > 1 && (
        <div
          role="tablist"
          aria-label={label}
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200"
        >
          {allowed.map((t) => {
            const Icon = t.icon;
            const selected = t.id === active.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`tabpanel-${t.id}`}
                onClick={() => setActiveId(t.id)}
                className={`min-h-10 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selected
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-500'}`} aria-hidden="true" />
                <span className="whitespace-nowrap">{t.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Χωρίς μπάρα δεν υπάρχει καρτέλα να δείξει το panel· ρόλος μόνο όταν υπάρχει. */}
      <div
        {...(allowed.length > 1
          ? { role: 'tabpanel', id: `tabpanel-${active.id}`, 'aria-labelledby': `tab-${active.id}` }
          : {})}
      >
        <Suspense fallback={<TabFallback />}>
          <Active />
        </Suspense>
      </div>
    </div>
  );
};
