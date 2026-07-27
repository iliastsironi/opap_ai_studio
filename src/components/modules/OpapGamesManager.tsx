import React, { useState } from 'react';
import { Ticket, Search, Trophy, BarChart3, TrendingUp, RefreshCw, Layers } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';

interface OpapSummaryItem {
  game: string;
  grossSales: number;
  payouts: number;
  netRevenue: number;
  ticketsCount: number;
  cancellations: number;
}

export const OpapGamesManager: React.FC = () => {
  const { selectedStoreId } = useTenant();

  const [gamesData] = useState<OpapSummaryItem[]>([
    {
      game: 'KINO',
      grossSales: 1850.0,
      payouts: 1120.0,
      netRevenue: 730.0,
      ticketsCount: 420,
      cancellations: 12,
    },
    {
      game: 'ΤΖΟΚΕΡ (JOKER)',
      grossSales: 620.0,
      payouts: 180.0,
      netRevenue: 440.0,
      ticketsCount: 155,
      cancellations: 2,
    },
    {
      game: 'POWERSPIN',
      grossSales: 480.0,
      payouts: 310.0,
      netRevenue: 170.0,
      ticketsCount: 98,
      cancellations: 5,
    },
    {
      game: 'ΣΚΡΑΤΣ & ΛΑΧΕΙΑ',
      grossSales: 340.0,
      payouts: 90.0,
      netRevenue: 250.0,
      ticketsCount: 85,
      cancellations: 0,
    },
    {
      game: 'ΛΟΤΤΟ & ΠΡΩΤΟ',
      grossSales: 210.0,
      payouts: 45.0,
      netRevenue: 165.0,
      ticketsCount: 60,
      cancellations: 1,
    },
  ]);

  const totalGross = gamesData.reduce((acc, g) => acc + g.grossSales, 0);
  const totalPayouts = gamesData.reduce((acc, g) => acc + g.payouts, 0);
  const totalNet = totalGross - totalPayouts;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Παιχνίδια ΟΠΑΠ (Financial Sales Audit)</h1>
              <span className="text-xs font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                PHASE 2 ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Αναλυτική παρακολούθηση εισπράξεων, πληρωμών κερδών (payouts) & ακυρώσεων ανά τερματικό ΟΠΑΠ.
            </p>
          </div>
        </div>

        <button className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 shadow-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Ανανέωση Τερματικών</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Ακαθάριστες Εισπράξεις ΟΠΑΠ (Gross Sales)</p>
          <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{totalGross.toFixed(2)} €</h3>
          <p className="text-[11px] text-emerald-600 font-semibold mt-2 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> +12.4% σε σύγκριση με προηγούμενη βάρδια
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Πληρωμές Κερδών (Payouts)</p>
          <h3 className="text-2xl font-extrabold text-rose-600 mt-1">-{totalPayouts.toFixed(2)} €</h3>
          <p className="text-[11px] text-slate-400 mt-2">Εξόφληση δελτίων από ταμείο πρακτορείου</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Καθαρά Έσοδα ΟΠΑΠ (Net Revenue)</p>
          <h3 className="text-2xl font-extrabold text-indigo-600 mt-1">{totalNet.toFixed(2)} €</h3>
          <p className="text-[11px] text-slate-400 mt-2">Καθαρή συνεισφορά στο ταμείο βάρδιας</p>
        </div>
      </div>

      {/* Games Breakdown Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>Ανάλυση ανά Παιχνίδι ΟΠΑΠ</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">
            5 Παιχνίδια
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="px-4 py-3">Παιχνίδι</th>
                <th className="px-4 py-3 text-right">Εισπράξεις (€)</th>
                <th className="px-4 py-3 text-right">Πληρωμές Κερδών (€)</th>
                <th className="px-4 py-3 text-right">Καθαρό (€)</th>
                <th className="px-4 py-3 text-center">Πλήθος Δελτίων</th>
                <th className="px-4 py-3 text-center">Ακυρώσεις</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gamesData.map((game, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                    <span>{game.game}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                    {game.grossSales.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-rose-600">
                    -{game.payouts.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-emerald-600">
                    {game.netRevenue.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-medium text-slate-700">
                    {game.ticketsCount}
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-semibold text-slate-500">
                    {game.cancellations}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
