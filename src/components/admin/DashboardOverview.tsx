import React from 'react';
import { Store as StoreIcon, Users, Shield, History, Building2, CheckCircle2, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

export const DashboardOverview: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { organization, roles, permissions, assignedStores } = useAuth();
  const { stores, activeStoreId } = useTenant();

  const primaryRole = roles[0]?.name || 'Χρήστης';

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
            <span>Σύστημα</span>
            <span>/</span>
            <span className="text-slate-900 font-bold">Αρχιτεκτονική & Επισκόπηση Οργανισμού</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {organization?.trade_name || organization?.legal_name || ' ShiftLedger Multi-Tenant Engine'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Επιχειρησιακή διαχείριση καταστημάτων, δικαιωμάτων πρόσβασης και αμετάβλητων καταγραφών ελέγχου.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Φάση 2: Βάρδιες & Ταμείο Ενεργή
          </div>
          <button
            onClick={() => onNavigate('shifts')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center space-x-1.5"
          >
            <span>Βάρδιες & Ταμείο</span>
          </button>
        </div>

      </div>

      {/* Grid Layout: Main Roadmap & Schema + Right Column Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main 8-col area */}
        <div className="lg:col-span-8 space-y-6">
          {/* Schema Visualizer Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="font-bold text-slate-900 text-sm">PostgreSQL Schema (14 Tables)</h2>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                MULTI-TENANT SCHEMA
              </span>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Core Identity
                  </p>
                  <ul className="text-xs space-y-2 text-slate-700 font-medium">
                    <li className="flex justify-between">
                      <span>organizations</span> <span className="text-slate-400 font-mono text-[10px]">PK</span>
                    </li>
                    <li className="flex justify-between">
                      <span>users</span> <span className="text-slate-400 font-mono text-[10px]">PK</span>
                    </li>
                    <li className="flex justify-between">
                      <span>roles</span> <span className="text-slate-400 font-mono text-[10px]">PK</span>
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Structural
                  </p>
                  <ul className="text-xs space-y-2 text-slate-700 font-medium">
                    <li className="flex justify-between">
                      <span>stores</span> <span className="text-slate-400 font-mono text-[10px]">FK</span>
                    </li>
                    <li className="flex justify-between">
                      <span>departments</span> <span className="text-slate-400 font-mono text-[10px]">FK</span>
                    </li>
                    <li className="flex justify-between">
                      <span>store_users</span> <span className="text-slate-400 font-mono text-[10px]">M:N</span>
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Compliance & Security
                  </p>
                  <ul className="text-xs space-y-2 text-slate-700 font-medium">
                    <li className="flex justify-between">
                      <span>audit_logs</span> <span className="text-slate-400 font-mono text-[10px]">JSONB</span>
                    </li>
                    <li className="flex justify-between">
                      <span>permissions</span> <span className="text-slate-400 font-mono text-[10px]">FK</span>
                    </li>
                    <li className="flex justify-between">
                      <span>role_permissions</span> <span className="text-slate-400 font-mono text-[10px]">M:N</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Implementation Roadmap */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-bold text-slate-900 text-sm">Επιχειρησιακό Roadmap (Φάσεις 1 & 2)</h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {assignedStores.length} Σημεία Πρόσβασης
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex items-center px-6 py-4 gap-4">
                <div className="w-5 h-5 border-2 border-indigo-600 rounded flex items-center justify-center text-white bg-indigo-600 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900">Multi-Tenant Isolation & Security Matrix</p>
                  <p className="text-[11px] text-slate-500">
                    Row-level isolation, JWT Auth, RBAC permissions & αμετάβλητα audit logs.
                  </p>
                </div>
                <div className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  COMPLETED
                </div>
              </div>

              <div className="flex items-center px-6 py-4 gap-4">
                <div className="w-5 h-5 border-2 border-indigo-600 rounded flex items-center justify-center text-white bg-indigo-600 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900">Βάρδιες & Οδηγός Κλεισίματος Ταμείου (Phase 2)</p>
                  <p className="text-[11px] text-slate-500">
                    Έναρξη/Κλείσιμο βάρδιας, εισπράξεις ΟΠΑΠ/VLTs/FnB, καταμέτρηση EUR, έξοδα & πιστώσεις.
                  </p>
                </div>
                <div className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  COMPLETED
                </div>
              </div>

              <div className="flex items-center px-6 py-4 gap-4 bg-slate-50/50">
                <div className="w-5 h-5 border-2 border-indigo-600 rounded flex items-center justify-center text-white bg-indigo-600 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900">Έλεγχος Αποκλίσεων & Έγκριση Διευθυντή</p>
                  <p className="text-[11px] text-slate-500">
                    Αυτοματοποιημένος υπολογισμός discrepancies, όρια συναγερμού & ροή αιτήσεων διόρθωσης.
                  </p>
                </div>
                <div className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  COMPLETED
                </div>
              </div>
            </div>
          </div>

          {/* Network Summary */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Δίκτυο Καταστημάτων Οργανισμού</h3>
                <p className="text-xs text-slate-500">Εγγεγραμμένα σημεία και τύποι λειτουργίας</p>
              </div>
              <button
                onClick={() => onNavigate('stores')}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
              >
                Διαχείριση →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stores.map((st) => (
                <div
                  key={st.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    activeStoreId === st.id || activeStoreId === 'ALL'
                      ? 'bg-slate-50 border-indigo-200 ring-1 ring-indigo-500/20'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                      {st.code}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      {st.store_type}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-xs">{st.name}</h4>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{st.address || 'Έδρα καταστήματος'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 4-col Sidebar Column */}
        <div className="lg:col-span-4 space-y-6">
          {/* Phase Progress Card (Indigo Dark Card from Sleek Theme) */}
          <div className="bg-indigo-900 rounded-xl p-6 text-white shadow-md">
            <h3 className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-4">
              Πρόοδος Φάσης 2 (Βάρδιες & Ταμείο)
            </h3>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-4xl font-extrabold tracking-tight">100%</span>
              <span className="text-xs text-indigo-300 mb-1">Ολοκληρωμένο</span>
            </div>
            <div className="w-full bg-indigo-950/60 h-2 rounded-full mb-6">
              <div className="bg-emerald-400 h-2 rounded-full w-full"></div>
            </div>

            <div className="space-y-3 pt-2 border-t border-indigo-800/80 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-indigo-200">Έναρξη / Κλείσιμο Βάρδιας</span>
                <span className="font-bold text-emerald-400">100%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-indigo-200">Υπολογιστής Ταμείου & Cash Counter</span>
                <span className="font-bold text-emerald-400">100%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-indigo-200">Έξοδα, Πιστώσεις & Υπόλοιπα</span>
                <span className="font-bold text-emerald-400">100%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-indigo-200">Έγκριση / Reopen & Audit Logging</span>
                <span className="font-bold text-emerald-400">100%</span>
              </div>
            </div>
          </div>

          {/* Multi-Tenant Strategy Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">
              Στρατηγική Ασφαλείας
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <div className="mt-1 w-2 h-2 bg-emerald-500 rounded-full shrink-0"></div>
                <div>
                  <p className="font-bold text-slate-900">Tenant Isolation</p>
                  <p className="text-slate-500 text-[11px] leading-relaxed mt-0.5">
                    Strict Organization scoping enforced on every API query and route middleware.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 w-2 h-2 bg-indigo-500 rounded-full shrink-0"></div>
                <div>
                  <p className="font-bold text-slate-900">Audit Logging</p>
                  <p className="text-slate-500 text-[11px] leading-relaxed mt-0.5">
                    Synchronous logging of actions, before/after states and user tokens to audit_logs.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigate('audit')}
              className="w-full mt-2 py-2 border border-slate-200 text-slate-700 rounded-md text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
            >
              Προβολή Audit Logs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
