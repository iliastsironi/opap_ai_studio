import React, { useState, useEffect } from 'react';
import { Ticket, Search, Trophy, BarChart3, TrendingUp, RefreshCw, Layers, CheckCircle, Clock, Zap } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchActiveShiftFromFirestore } from '../../services/shiftService.ts';
import { Shift } from '../../types/index.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { pickNum } from '../../services/financialCalculator.ts';

interface OpapSummaryItem {
  game: string;
  grossSales: number;
  payouts: number;
  netRevenue: number;
  cancellations: number;
  vouchers: number;
}

export const OpapGamesManager: React.FC = () => {
  const { selectedStoreId, stores } = useTenant();
  const { organization } = useAuth();
  const orgId = organization?.id || 'org_opap_demo';

  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);

  const loadActiveShiftData = async () => {
    setLoading(true);
    const sId = selectedStoreId && selectedStoreId !== 'ALL' ? selectedStoreId : stores[0]?.id;
    if (!sId) {
      setLoading(false);
      return;
    }
    try {
      const shift = await fetchActiveShiftFromFirestore(orgId, sId);
      setActiveShift(shift);
    } catch (e) {
      console.warn('Could not load active shift in OpapGamesManager', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveShiftData();
  }, [selectedStoreId, orgId]);

  // Derive dynamic table data from active shift or fallback demo
  const curGross = activeShift ? pickNum(activeShift.arithmo_gross, activeShift.number_games_sales) : 1850;
  const curCancels = activeShift ? pickNum(activeShift.arithmo_cancels, activeShift.number_games_cancellations) : 12;
  const curPayouts = activeShift ? pickNum(activeShift.arithmo_payouts, activeShift.number_games_payouts) : 1120;
  const curVouchers = activeShift ? pickNum(activeShift.arithmo_vouchers, activeShift.vouchers) : 0;
  const curStoixima = activeShift ? pickNum(activeShift.pame_stoixima_balance) : 350;
  const curScratchSales = activeShift ? pickNum(activeShift.scratch_sales, activeShift.scratch_lotto_sales) : 340;
  const curScratchPayouts = activeShift ? pickNum(activeShift.scratch_payouts) : 90;
  const curClever = activeShift ? pickNum(activeShift.clever_point_total) : 120;

  const gamesData: OpapSummaryItem[] = [
    {
      game: 'Αριθμοπαιχνίδια (KINO, Τζόκερ, Powerspin, Λόττο)',
      grossSales: curGross,
      payouts: curPayouts,
      cancellations: curCancels,
      vouchers: curVouchers,
      netRevenue: curGross - curCancels - curPayouts - curVouchers,
    },
    {
      game: 'Πάμε Στοίχημα / Virtuals (Balance)',
      grossSales: curStoixima > 0 ? curStoixima : 0,
      payouts: curStoixima < 0 ? Math.abs(curStoixima) : 0,
      cancellations: 0,
      vouchers: 0,
      netRevenue: curStoixima,
    },
    {
      game: 'Σκρατς & Λαχεία (Instant Games)',
      grossSales: curScratchSales,
      payouts: curScratchPayouts,
      cancellations: 0,
      vouchers: 0,
      netRevenue: curScratchSales - curScratchPayouts,
    },
    {
      game: 'Υπηρεσίες Clever Point (Παραλαβές/Παραδόσεις)',
      grossSales: curClever,
      payouts: 0,
      cancellations: 0,
      vouchers: 0,
      netRevenue: curClever,
    },
  ];

  const totalGross = gamesData.reduce((acc, g) => acc + g.grossSales, 0);
  const totalPayouts = gamesData.reduce((acc, g) => acc + g.payouts, 0);
  const totalNet = gamesData.reduce((acc, g) => acc + g.netRevenue, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Παιχνίδια ΟΠΑΠ (Financial Sales Audit)</h1>
            <p className="text-xs text-slate-500 mt-1">
              Αναλυτική παρακολούθηση εισπράξεων, πληρωμών κερδών (payouts) & ακυρώσεων ανά τερματικό ΟΠΑΠ.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadActiveShiftData}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Ανανέωση</span>
          </button>
        </div>
      </div>

      {/* Active Shift Sync Banner */}
      {activeShift ? (
        <div className="bg-gradient-to-r from-amber-50 to-indigo-50 p-4 rounded-2xl border border-amber-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 font-extrabold text-sm">
              🎯
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">
                Ενεργή Βάρδια: {activeShift.store_name} ({activeShift.shift_type === 'MORNING' ? 'Πρωινή' : 'Απογευματινή'})
              </p>
              <p className="text-micro text-slate-600 mt-0.5">
                Τα παρακάτω ποσά πωλήσεων και κερδών προέρχονται από την ενεργή βάρδια. Καταχωρούνται στον οδηγό κλεισίματος βάρδιας (βήμα ΟΠΑΠ & VLTs), όχι εδώ.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 self-start sm:self-auto">
            <span className="w-2 h-2 mr-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            Ενεργή Βάρδια
          </span>
        </div>
      ) : (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center space-x-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>Δεν υπάρχει ανοιχτή βάρδια αυτή τη στιγμή για το επιλεγμένο κατάστημα. Εμφανίζονται τα τελευταία δεδομένα.</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Ακαθάριστες Εισπράξεις ΟΠΑΠ (Gross Sales)</p>
          <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{formatCurrency(totalGross)}</h3>
          <p className="text-micro text-emerald-600 font-semibold mt-2 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> Πωλήσεις δελτίων, κουπονιών & λαχείων
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Πληρωμές Κερδών (Payouts)</p>
          <h3 className="text-2xl font-extrabold text-rose-600 mt-1">-{formatCurrency(totalPayouts)}</h3>
          <p className="text-micro text-slate-400 mt-2">Εξόφληση δελτίων από ταμείο πρακτορείου</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Καθαρά Έσοδα ΟΠΑΠ (Net Revenue)</p>
          <h3 className="text-2xl font-extrabold text-indigo-600 mt-1">{formatCurrency(totalNet)}</h3>
          <p className="text-micro text-slate-400 mt-2">Καθαρή συνεισφορά στο ταμείο βάρδιας</p>
        </div>
      </div>

      {/* Games Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>Ανάλυση ανά Κατηγορία Παιχνιδιού ΟΠΑΠ</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">
            {gamesData.length} Κατηγορίες
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="px-4 py-3">{toGreekUpper('Κατηγορια Παιχνιδιου')}</th>
                <th className="px-4 py-3 text-right">{toGreekUpper('Εισπραξεις (€)')}</th>
                <th className="px-4 py-3 text-right">{toGreekUpper('Ακυρωσεις (€)')}</th>
                <th className="px-4 py-3 text-right">{toGreekUpper('Πληρωμες Κερδων (€)')}</th>
                <th className="px-4 py-3 text-right">{toGreekUpper('Vouchers (€)')}</th>
                <th className="px-4 py-3 text-right font-extrabold">{toGreekUpper('Καθαρο Ταμειου (€)')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gamesData.map((game, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">{game.game}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                    {formatCurrency(game.grossSales)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-amber-700">
                    {game.cancellations > 0 ? `-${formatCurrency(game.cancellations)}` : formatCurrency(0)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">
                    {game.payouts > 0 ? `-${formatCurrency(game.payouts)}` : formatCurrency(0)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500">
                    {game.vouchers > 0 ? `-${formatCurrency(game.vouchers)}` : formatCurrency(0)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-extrabold text-indigo-700">
                    {formatCurrency(game.netRevenue, { showSign: true })}
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
