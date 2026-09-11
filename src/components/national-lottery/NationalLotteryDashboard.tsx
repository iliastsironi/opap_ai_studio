import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getEditionDashboard, EditionDashboard } from '../../services/nationalLotteryService.ts';
import { NationalLotteryEdition, NationalLotteryDrawCode } from '../../types/index.ts';

const DRAW_LABELS: Record<NationalLotteryDrawCode, string> = { A: 'Α', B: 'Β', C: 'Γ', D: 'Δ', ST: 'ΣΤ' };

interface NationalLotteryDashboardProps {
  edition: NationalLotteryEdition;
  refreshKey: number; // bump to force a refetch (e.g. after a collection/cancellation elsewhere)
}

// Owner/Manager dashboard: active subscriber count + breakdown by type,
// per-draw progress, and an expandable "who hasn't received this draw"
// list per the spec.
export const NationalLotteryDashboard: React.FC<NationalLotteryDashboardProps> = ({ edition, refreshKey }) => {
  const [dashboard, setDashboard] = useState<EditionDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDraw, setExpandedDraw] = useState<NationalLotteryDrawCode | null>(null);

  useEffect(() => {
    setLoading(true);
    getEditionDashboard(edition)
      .then(setDashboard)
      .finally(() => setLoading(false));
  }, [edition, refreshKey]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-2xl font-black text-slate-900">{dashboard.activeCustomerCount}</p>
          <p className="text-micro text-slate-500 font-bold uppercase">Ενεργοί Συνδρομητές</p>
        </div>
        <div>
          <p className="text-2xl font-black text-indigo-600">{dashboard.fiveCount}</p>
          <p className="text-micro text-slate-500 font-bold uppercase">5άδες</p>
        </div>
        <div>
          <p className="text-2xl font-black text-purple-600">{dashboard.tenCount}</p>
          <p className="text-micro text-slate-500 font-bold uppercase">10άδες</p>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-2">
        <p className="text-micro font-bold text-slate-500 uppercase tracking-wide">Πρόοδος Έκδοσης {edition.label}</p>
        {dashboard.drawProgress.map((progress) => {
          const isExpanded = expandedDraw === progress.drawCode;
          const pct = progress.totalCount > 0 ? Math.round((progress.receivedCount / progress.totalCount) * 100) : 0;
          return (
            <div key={progress.drawCode} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedDraw(isExpanded ? null : progress.drawCode)}
                className="w-full flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50"
              >
                <span className="w-6 text-sm font-black text-slate-700 shrink-0">{DRAW_LABELS[progress.drawCode]}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-bold text-slate-600 shrink-0 font-mono">
                  {progress.receivedCount}/{progress.totalCount}
                </span>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {isExpanded && (
                <div className="px-3 pb-3">
                  {progress.pendingCustomers.length === 0 ? (
                    <p className="text-micro text-emerald-600 font-semibold">Όλοι έχουν παραλάβει αυτή την κλήρωση.</p>
                  ) : (
                    <ul className="text-micro text-slate-600 space-y-0.5">
                      {progress.pendingCustomers.map((c) => (
                        <li key={c.nationalLotteryCustomerId}>{c.fullName}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
