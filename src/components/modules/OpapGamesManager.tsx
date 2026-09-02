import React, { useState, useEffect } from 'react';
import { Ticket, Search, Trophy, BarChart3, TrendingUp, RefreshCw, Layers, Edit3, X, CheckCircle, Clock, Zap } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchActiveShiftFromFirestore, updateShiftInFirestore } from '../../services/shiftService.ts';
import { Shift } from '../../types/index.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';

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

  // Edit Shift Sales Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingShift, setSavingShift] = useState(false);

  // Form Fields for Live Shift Editing
  const [arithmoGross, setArithmoGross] = useState('');
  const [arithmoCancels, setArithmoCancels] = useState('');
  const [arithmoPayouts, setArithmoPayouts] = useState('');
  const [arithmoVouchers, setArithmoVouchers] = useState('');
  const [pameStoiximaBalance, setPameStoiximaBalance] = useState('');
  const [scratchSales, setScratchSales] = useState('');
  const [scratchPayouts, setScratchPayouts] = useState('');
  const [cleverPointTotal, setCleverPointTotal] = useState('');

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
      if (shift) {
        setArithmoGross(String(shift.arithmo_gross || shift.number_games_sales || 0));
        setArithmoCancels(String(shift.arithmo_cancels || shift.number_games_cancellations || 0));
        setArithmoPayouts(String(shift.arithmo_payouts || shift.number_games_payouts || 0));
        setArithmoVouchers(String(shift.arithmo_vouchers || shift.vouchers || 0));
        setPameStoiximaBalance(String(shift.pame_stoixima_balance || 0));
        setScratchSales(String(shift.scratch_sales || shift.scratch_lotto_sales || 0));
        setScratchPayouts(String(shift.scratch_payouts || 0));
        setCleverPointTotal(String(shift.clever_point_total || 0));
      }
    } catch (e) {
      console.warn('Could not load active shift in OpapGamesManager', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveShiftData();
  }, [selectedStoreId, orgId]);

  const handleSaveShiftSales = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    setSavingShift(true);
    try {
      const gross = parseFloat(arithmoGross) || 0;
      const cancels = parseFloat(arithmoCancels) || 0;
      const payouts = parseFloat(arithmoPayouts) || 0;
      const vouchers = parseFloat(arithmoVouchers) || 0;
      const stoixima = parseFloat(pameStoiximaBalance) || 0;
      const scratchIn = parseFloat(scratchSales) || 0;
      const scratchOut = parseFloat(scratchPayouts) || 0;
      const clever = parseFloat(cleverPointTotal) || 0;

      const arithmoNet = gross - cancels - payouts - vouchers;
      const scratchNet = scratchIn - scratchOut;

      const updates: Partial<Shift> = {
        arithmo_gross: gross,
        arithmo_cancels: cancels,
        arithmo_payouts: payouts,
        arithmo_vouchers: vouchers,
        number_games_sales: gross,
        number_games_cancellations: cancels,
        number_games_payouts: payouts,
        vouchers: vouchers,
        pame_stoixima_balance: stoixima,
        scratch_sales: scratchIn,
        scratch_payouts: scratchOut,
        scratch_lotto_sales: scratchNet,
        clever_point_total: clever,
        opap_gross_sales: gross + scratchIn,
        opap_payouts: payouts + scratchOut,
        opap_net_sales: arithmoNet + stoixima + scratchNet + clever,
      };

      await updateShiftInFirestore(activeShift.id, updates);

      if (typeof window !== 'undefined') {
        try {
          const draftKey = `shift_draft_${activeShift.id}`;
          const rawDraft = localStorage.getItem(draftKey);
          if (rawDraft) {
            const parsed = JSON.parse(rawDraft);
            Object.assign(parsed, updates);
            localStorage.setItem(draftKey, JSON.stringify(parsed));
          }
        } catch (e) {
          // ignore
        }
      }

      await loadActiveShiftData();
      setShowEditModal(false);
    } catch (err) {
      console.error('Error saving OPAP sales:', err);
    } finally {
      setSavingShift(false);
    }
  };

  // Derive dynamic table data from active shift or fallback demo
  const curGross = activeShift ? (Number(activeShift.arithmo_gross) || Number(activeShift.number_games_sales) || 1850) : 1850;
  const curCancels = activeShift ? (Number(activeShift.arithmo_cancels) || Number(activeShift.number_games_cancellations) || 12) : 12;
  const curPayouts = activeShift ? (Number(activeShift.arithmo_payouts) || Number(activeShift.number_games_payouts) || 1120) : 1120;
  const curVouchers = activeShift ? (Number(activeShift.arithmo_vouchers) || Number(activeShift.vouchers) || 0) : 0;
  const curStoixima = activeShift ? (Number(activeShift.pame_stoixima_balance) || 350) : 350;
  const curScratchSales = activeShift ? (Number(activeShift.scratch_sales) || Number(activeShift.scratch_lotto_sales) || 340) : 340;
  const curScratchPayouts = activeShift ? (Number(activeShift.scratch_payouts) || 90) : 90;
  const curClever = activeShift ? (Number(activeShift.clever_point_total) || 120) : 120;

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
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Παιχνίδια ΟΠΑΠ (Financial Sales Audit)</h1>
              <span className="text-xs font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                ΑΜΦΙΔΡΟΜΟΣ ΣΥΓΧΡΟΝΙΣΜΟΣ
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Αναλυτική παρακολούθηση εισπράξεων, πληρωμών κερδών (payouts) & ακυρώσεων ανά τερματικό ΟΠΑΠ.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {activeShift && (
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Επεξεργασία & Συγχρονισμός Βάρδιας</span>
            </button>
          )}

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
        <div className="bg-gradient-to-r from-amber-50 to-indigo-50 p-4 rounded-xl border border-amber-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 font-extrabold text-sm">
              🎯
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">
                Ενεργή Βάρδια: {activeShift.store_name} ({activeShift.shift_type === 'MORNING' ? 'Πρωινή' : 'Απογευματινή'})
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Όλες οι καταχωρήσεις πωλήσεων και κερδών ενημερώνουν αυτόματα το ταμείο και το κλείσιμο της βάρδιας.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 self-start sm:self-auto">
            <span className="w-2 h-2 mr-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            Συνδεδεμένη Βάρδια
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
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Ακαθάριστες Εισπράξεις ΟΠΑΠ (Gross Sales)</p>
          <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{totalGross.toFixed(2)} €</h3>
          <p className="text-[11px] text-emerald-600 font-semibold mt-2 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> Πωλήσεις δελτίων, κουπονιών & λαχείων
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
                    {game.grossSales.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-amber-700">
                    {game.cancellations > 0 ? `-${game.cancellations.toFixed(2)} €` : '0.00 €'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">
                    {game.payouts > 0 ? `-${game.payouts.toFixed(2)} €` : '0.00 €'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500">
                    {game.vouchers > 0 ? `-${game.vouchers.toFixed(2)} €` : '0.00 €'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-extrabold text-indigo-700">
                    {game.netRevenue >= 0 ? `+${game.netRevenue.toFixed(2)} €` : `${game.netRevenue.toFixed(2)} €`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Shift Sales Modal */}
      {showEditModal && activeShift && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Ticket className="w-4 h-4 text-amber-400" />
                Καταχώρηση / Ενημέρωση Πωλήσεων Βάρδιας ({activeShift.store_name})
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShiftSales} className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              <p className="text-slate-600">
                Ενημερώστε τα ποσά πωλήσεων και εξαργυρώσεων για την ενεργή βάρδια. Τα δεδομένα συγχρονίζονται αμφίδρομα με το κλείσιμο της βάρδιας.
              </p>

              {/* 1. Number Games */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase">
                  🎯 Αριθμοπαιχνίδια (KINO, Τζόκερ, Powerspin κλπ.)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Πωλήσεις Gross (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={arithmoGross}
                      onChange={(e) => setArithmoGross(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-amber-800 font-bold mb-1">Ακυρώσεις (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={arithmoCancels}
                      onChange={(e) => setArithmoCancels(e.target.value)}
                      className="w-full border border-amber-200 rounded-lg p-2 font-mono font-bold text-amber-800"
                    />
                  </div>
                  <div>
                    <label className="block text-rose-800 font-bold mb-1">Πληρωμές Κερδών (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={arithmoPayouts}
                      onChange={(e) => setArithmoPayouts(e.target.value)}
                      className="w-full border border-rose-200 rounded-lg p-2 font-mono font-bold text-rose-700"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Vouchers (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={arithmoVouchers}
                      onChange={(e) => setArithmoVouchers(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Pame Stoixima & Scratch */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-extrabold text-slate-900 text-xs uppercase">⚽ Πάμε Στοίχημα</h4>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Υπόλοιπο / Balance (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={pameStoiximaBalance}
                      onChange={(e) => setPameStoiximaBalance(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-extrabold text-slate-900 text-xs uppercase">📦 Clever Point</h4>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Σύνολο Υπηρεσιών (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={cleverPointTotal}
                      onChange={(e) => setCleverPointTotal(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Scratch & Lotteries */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase">🎟️ Σκρατς & Λαχεία</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Πωλήσεις Σκρατς (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={scratchSales}
                      onChange={(e) => setScratchSales(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-rose-800 font-bold mb-1">Εξαργυρώσεις Σκρατς (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={scratchPayouts}
                      onChange={(e) => setScratchPayouts(e.target.value)}
                      className="w-full border border-rose-200 rounded-lg p-2 font-mono font-bold text-rose-700"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={savingShift}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer"
                >
                  {savingShift ? 'Αποθήκευση...' : 'Αποθήκευση & Συγχρονισμός'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
