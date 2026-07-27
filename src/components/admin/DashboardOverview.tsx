import React from 'react';
import { Store as StoreIcon, Clock, Receipt, BarChart3, ShieldCheck, ArrowRight, Wallet, CheckCircle2, AlertTriangle, Building2, Ticket, Gamepad2, Coffee } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

export const DashboardOverview: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { organization, roles, assignedStores } = useAuth();
  const { stores, activeStoreId } = useTenant();

  const activeStoreName = activeStoreId === 'ALL'
    ? 'Όλα τα Καταστήματα'
    : stores.find((s) => s.id === activeStoreId)?.name || 'Επιλεγμένο Κατάστημα';

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
            <span>Αρχική</span>
            <span>/</span>
            <span className="text-slate-900 font-bold">Κεντρικό Ταμπλό Ελέγχου</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {organization?.trade_name || organization?.legal_name || 'ShiftLedger Store Manager'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Επιχειρησιακή διαχείριση καταστημάτων, ταμείου βάρδιας, εισπράξεων ΟΠΑΠ/VLTs & εξόδων.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span>Σύστημα σε Λειτουργία</span>
          </div>
          <button
            onClick={() => onNavigate('shifts')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center space-x-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Βάρδιες & Ταμείο</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Καταστήματα</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{stores.length}</h3>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Όλα ενεργά
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Επιλεγμένο Σημείο</p>
            <h3 className="text-sm font-bold text-slate-900 mt-1 truncate max-w-[140px]">{activeStoreName}</h3>
            <p className="text-[11px] text-indigo-600 font-medium mt-0.5">
              {activeStoreId === 'ALL' ? 'Συνολική προβολή' : 'Ενεργή συνεδρία'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
            <StoreIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Κατάσταση Ταμείου</p>
            <h3 className="text-lg font-bold text-slate-900 mt-1">Έτοιμο για Βάρδια</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">Αριθμομηχανή & Cash Counter</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ασφάλεια Multi-Tenant</p>
            <h3 className="text-lg font-bold text-slate-900 mt-1">Πλήρης Απομόνωση</h3>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Audit Logs Active
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Quick Actions & Stores Network */}
        <div className="lg:col-span-8 space-y-6">
          {/* Quick Actions Panel */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Γρήγορες Ενέργειες & Λειτουργίες</h2>
                <p className="text-xs text-slate-500">Άμεση μετάβαση στις βασικές ενότητες καθημερινής διαχείρισης</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => onNavigate('shifts')}
                className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-300 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Βάρδιες & Ταμείο</h3>
                <p className="text-xs text-slate-500 mt-0.5">Έναρξη, κλείσιμο, καταμέτρηση μετρητών & έλεγχος Z</p>
              </button>

              <button
                onClick={() => onNavigate('expenses')}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Έξοδα & Δαπάνες</h3>
                <p className="text-xs text-slate-500 mt-0.5">Καταχώρηση πληρωμών, τιμολογίων & μικροεξόδων</p>
              </button>

              <button
                onClick={() => onNavigate('opap')}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Ticket className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Παιχνίδια ΟΠΑΠ & VLTs</h3>
                <p className="text-xs text-slate-500 mt-0.5">Εισπράξεις, ακυρώσεις & υπόλοιπα τερματικών</p>
              </button>

              <button
                onClick={() => onNavigate('reports')}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Αναφορές & Analytics</h3>
                <p className="text-xs text-slate-500 mt-0.5">Στατιστικά πωλήσεων, αποκλίσεις & οικονομικά Z</p>
              </button>
            </div>
          </div>

          {/* Network Stores Summary */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
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

        {/* Right Column: Operational Checklist & Audit Controls */}
        <div className="lg:col-span-4 space-y-6">
          {/* Active Store Focus Card */}
          <div className="bg-indigo-900 rounded-xl p-6 text-white shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-800/80 pb-3">
              <h3 className="text-xs font-bold text-indigo-200 uppercase tracking-widest">
                Οδηγός Βάρδιας
              </h3>
              <span className="px-2 py-0.5 bg-indigo-800 rounded text-[10px] text-indigo-200 font-bold">
                Shift Status
              </span>
            </div>

            <p className="text-xs text-indigo-100 leading-relaxed">
              Για να διασφαλίσετε την ορθότητα του ταμείου, ακολουθήστε τα βήματα καταμέτρησης πριν το κλείσιμο της βάρδιας.
            </p>

            <div className="space-y-2.5 pt-1 text-xs">
              <div className="flex items-center gap-2 text-indigo-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Έλεγχος αρχικού ταμείου (Float)</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Καταγραφή εισπράξεων ΟΠΑΠ & VLT</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Καταχώρηση παραστατικών εξόδων</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Υπολογισμός τελικής απόκλισης</span>
              </div>
            </div>

            <button
              onClick={() => onNavigate('shifts')}
              className="w-full mt-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center justify-center space-x-2"
            >
              <span>Μετάβαση στο Ταμείο</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Security & Audit Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">
              Έλεγχος & Ασφάλεια
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <div className="mt-1 w-2 h-2 bg-emerald-500 rounded-full shrink-0"></div>
                <div>
                  <p className="font-bold text-slate-900">Tenant Isolation</p>
                  <p className="text-slate-500 text-[11px] leading-relaxed mt-0.5">
                    Αυστηρός διαχωρισμός δεδομένων ανά οργανισμό και κατάστημα.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 w-2 h-2 bg-indigo-500 rounded-full shrink-0"></div>
                <div>
                  <p className="font-bold text-slate-900">Audit Logging</p>
                  <p className="text-slate-500 text-[11px] leading-relaxed mt-0.5">
                    Αμετάβλητες καταγραφές όλων των ενεργειών ταμείου & εγκρίσεων.
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
