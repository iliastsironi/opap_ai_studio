import React, { useState, useEffect } from 'react';
import { Gamepad2, Activity, Server, Zap, ShieldCheck, Cpu, Edit3, RefreshCw, X, Clock } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchActiveShiftFromFirestore, updateShiftInFirestore } from '../../services/shiftService.ts';
import { Shift } from '../../types/index.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';

interface VltTerminal {
  id: string;
  code: string;
  game_title: string;
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  meter_in: number;
  meter_out: number;
  net_revenue: number;
}

export const VltManager: React.FC = () => {
  const { selectedStoreId, stores } = useTenant();
  const { organization } = useAuth();
  const orgId = organization?.id || 'org_opap_demo';

  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Shift VLT Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingShift, setSavingShift] = useState(false);

  const [vltsIn, setVltsIn] = useState('');
  const [vltsOut, setVltsOut] = useState('');
  const [vltsOutType, setVltsOutType] = useState<'NEGATIVE' | 'POSITIVE'>('NEGATIVE');

  const [terminals] = useState<VltTerminal[]>([
    { id: 'VLT-01', code: 'PLAY-ATH-001', game_title: 'Sizzling Hot Deluxe', status: 'ONLINE', meter_in: 450.0, meter_out: 280.0, net_revenue: 170.0 },
    { id: 'VLT-02', code: 'PLAY-ATH-002', game_title: 'Book of Ra Magic', status: 'ONLINE', meter_in: 680.0, meter_out: 410.0, net_revenue: 270.0 },
    { id: 'VLT-03', code: 'PLAY-ATH-003', game_title: 'Lucky Lady\'s Charm', status: 'ONLINE', meter_in: 320.0, meter_out: 190.0, net_revenue: 130.0 },
    { id: 'VLT-04', code: 'PLAY-ATH-004', game_title: 'Lord of the Ocean', status: 'ONLINE', meter_in: 510.0, meter_out: 340.0, net_revenue: 170.0 },
    { id: 'VLT-05', code: 'PLAY-ATH-005', game_title: 'Dolphin\'s Pearl Deluxe', status: 'MAINTENANCE', meter_in: 0.0, meter_out: 0.0, net_revenue: 0.0 },
  ]);

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
        setVltsIn(String(shift.vlts_in || shift.vlts_cash_in || 0));
        setVltsOut(String(shift.vlts_out || Math.abs(shift.vlts_cash_out || 0) || 0));
        setVltsOutType(shift.vlts_out_type || ((shift.vlts_cash_out ?? -1) >= 0 ? 'POSITIVE' : 'NEGATIVE'));
      }
    } catch (e) {
      console.warn('Could not load active shift in VltManager', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveShiftData();
  }, [selectedStoreId, orgId]);

  const handleSaveShiftVlts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    setSavingShift(true);
    try {
      const inVal = parseFloat(vltsIn) || 0;
      const outVal = parseFloat(vltsOut) || 0;
      const signedOut = vltsOutType === 'NEGATIVE' ? -outVal : outVal;

      const updates: Partial<Shift> = {
        vlts_in: inVal,
        vlts_out: outVal,
        vlts_out_type: vltsOutType,
        vlts_cash_in: inVal,
        vlts_cash_out: signedOut,
        vlts_net: inVal + signedOut,
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
      console.error('Error saving VLTs to shift:', err);
    } finally {
      setSavingShift(false);
    }
  };

  const totalIn = activeShift ? (Number(activeShift.vlts_in) || Number(activeShift.vlts_cash_in) || terminals.reduce((sum, t) => sum + t.meter_in, 0)) : terminals.reduce((sum, t) => sum + t.meter_in, 0);
  const totalOut = activeShift ? (Number(activeShift.vlts_out) || Math.abs(Number(activeShift.vlts_cash_out) || 0) || terminals.reduce((sum, t) => sum + t.meter_out, 0)) : terminals.reduce((sum, t) => sum + t.meter_out, 0);
  const totalNet = totalIn - totalOut;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-center text-purple-600 shrink-0">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Τερματικά PLAY VLTs</h1>
              <span className="text-xs font-mono font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                ΑΜΦΙΔΡΟΜΟΣ ΣΥΓΧΡΟΝΙΣΜΟΣ
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Real-time μέτρηση Meter-In / Meter-Out, καθαρού εσόδου & κατάστασης παιγνιομηχανών PLAY.
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
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 font-extrabold text-sm">
              🎰
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">
                Ενεργή Βάρδια: {activeShift.store_name} ({activeShift.shift_type === 'MORNING' ? 'Πρωινή' : 'Απογευματινή'})
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Τα ποσά εισροών (Meter-In) και εκροών/payouts (Meter-Out) είναι συνδεδεμένα αμφίδρομα με το κλείσιμο της βάρδιας.
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
          <span>Δεν υπάρχει ανοιχτή βάρδια αυτή τη στιγμή για το επιλεγμένο κατάστημα.</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Σύνολο Εισπράξεων (Meter In)</p>
          <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{totalIn.toFixed(2)} €</h3>
          <p className="text-[11px] text-slate-400 mt-2">Εισαγωγές χαρτονομισμάτων & TITO στα VLTs</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Σύνολο Πληρωμών (Meter Out)</p>
          <h3 className="text-2xl font-extrabold text-rose-600 mt-1">-{totalOut.toFixed(2)} €</h3>
          <p className="text-[11px] text-slate-400 mt-2">Εκδόσεις TITO & payouts παικτών</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Καθαρό Έσοδο VLTs (Net Revenue)</p>
          <h3 className="text-2xl font-extrabold text-indigo-600 mt-1">{totalNet.toFixed(2)} €</h3>
          <p className="text-[11px] text-slate-400 mt-2">Υπόλοιπο για συμφωνία ταμείου βάρδιας</p>
        </div>
      </div>

      {/* Terminals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {terminals.map((t) => (
          <div key={t.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">{t.code}</span>
                <h4 className="font-bold text-slate-900 text-sm">{t.game_title}</h4>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                  t.status === 'ONLINE'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {t.status}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50 p-2 rounded">
                <p className="text-[10px] text-slate-400 font-medium">In</p>
                <p className="text-xs font-extrabold text-slate-800">{t.meter_in.toFixed(0)} €</p>
              </div>
              <div className="bg-slate-50 p-2 rounded">
                <p className="text-[10px] text-slate-400 font-medium">Out</p>
                <p className="text-xs font-extrabold text-rose-600">{t.meter_out.toFixed(0)} €</p>
              </div>
              <div className="bg-indigo-50 p-2 rounded">
                <p className="text-[10px] text-indigo-500 font-medium">Net</p>
                <p className="text-xs font-extrabold text-indigo-700">{t.net_revenue.toFixed(0)} €</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Shift VLT Modal */}
      {showEditModal && activeShift && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-purple-400" />
                Συγχρονισμός VLTs Βάρδιας ({activeShift.store_name})
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShiftVlts} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Εισάγετε τα συνολικά ποσά εισροών (Meter-In) και εκροών/payouts (Meter-Out) των παιγνιομηχανών VLTs για την ενεργή βάρδια.
              </p>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  VLTs Εισροές / Meter In (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={vltsIn}
                  onChange={(e) => setVltsIn(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg p-2.5 font-mono font-bold text-slate-900 text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-700 font-bold">
                    VLTs Εκροές / Meter Out (€)
                  </label>
                  <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setVltsOutType('NEGATIVE')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        vltsOutType === 'NEGATIVE' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      - Εκροή
                    </button>
                    <button
                      type="button"
                      onClick={() => setVltsOutType('POSITIVE')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        vltsOutType === 'POSITIVE' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      + Είσπραξη
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={vltsOut}
                  onChange={(e) => setVltsOut(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg p-2.5 font-mono font-bold text-slate-900 text-sm"
                />
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
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold cursor-pointer"
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
