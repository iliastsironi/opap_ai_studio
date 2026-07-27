import React, { useState } from 'react';
import { Gamepad2, Activity, Server, Zap, ShieldCheck, Cpu } from 'lucide-react';

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
  const [terminals] = useState<VltTerminal[]>([
    { id: 'VLT-01', code: 'PLAY-ATH-001', game_title: 'Sizzling Hot Deluxe', status: 'ONLINE', meter_in: 450.0, meter_out: 280.0, net_revenue: 170.0 },
    { id: 'VLT-02', code: 'PLAY-ATH-002', game_title: 'Book of Ra Magic', status: 'ONLINE', meter_in: 680.0, meter_out: 410.0, net_revenue: 270.0 },
    { id: 'VLT-03', code: 'PLAY-ATH-003', game_title: 'Lucky Lady\'s Charm', status: 'ONLINE', meter_in: 320.0, meter_out: 190.0, net_revenue: 130.0 },
    { id: 'VLT-04', code: 'PLAY-ATH-004', game_title: 'Lord of the Ocean', status: 'ONLINE', meter_in: 510.0, meter_out: 340.0, net_revenue: 170.0 },
    { id: 'VLT-05', code: 'PLAY-ATH-005', game_title: 'Dolphin\'s Pearl Deluxe', status: 'MAINTENANCE', meter_in: 0.0, meter_out: 0.0, net_revenue: 0.0 },
  ]);

  const totalIn = terminals.reduce((sum, t) => sum + t.meter_in, 0);
  const totalOut = terminals.reduce((sum, t) => sum + t.meter_out, 0);
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
                PHASE 2 ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Real-time μέτρηση Meter-In / Meter-Out, καθαρού εσόδου & κατάστασης παιγνιομηχανών PLAY.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            <span className="w-2 h-2 mr-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            4/5 Online
          </span>
        </div>
      </div>

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
    </div>
  );
};
