import React, { useState, useEffect } from 'react';
import {
  Banknote,
  Clock,
  Receipt,
  BarChart3,
  ArrowRight,
  AlertTriangle,
  AlertCircle,
  Euro,
  Vault,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { QuickCashDialog, type QuickCashKind } from '../shifts/QuickCashDialog.tsx';
import { fetchShiftsFromFirestore } from '../../services/shiftService.ts';
import { fetchEmployeeCharges } from '../../services/employeeChargeService.ts';
import { fetchIncidentsFromFirestore } from '../../services/moduleServices.ts';
import { Shift } from '../../types/index.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { StatCard } from '../ui/StatCard.tsx';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

export const DashboardOverview: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { organization, roles, hasPermission } = useAuth();
  const [quickCash, setQuickCash] = useState<QuickCashKind | null>(null);
  const { stores, activeStoreId } = useTenant();

  const canApprove =
    roles?.some(
      (r) =>
        ['ORG_OWNER', 'STORE_MANAGER', 'ADMIN', 'AREA_MANAGER', 'PLATFORM_ADMIN', 'SHIFT_LEADER'].includes(r.code) ||
        r.name?.toLowerCase().includes('manager') ||
        r.name?.toLowerCase().includes('owner') ||
        r.name?.toLowerCase().includes('διευθυντής') ||
        r.name?.toLowerCase().includes('ιδιοκτήτης')
    ) ||
    hasPermission('*') ||
    hasPermission('shift.approve') ||
    hasPermission('shifts.approve');

  const [pendingShifts, setPendingShifts] = useState<Shift[]>([]);
  const [openCharges, setOpenCharges] = useState<{ count: number; total: number }>({ count: 0, total: 0 });
  const [openIncidents, setOpenIncidents] = useState(0);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = organization!.id; // guaranteed by ProtectedLayout's organisation guard
    setLoadingShifts(true);
    setFetchError(null);
    Promise.all([
      fetchShiftsFromFirestore(orgId, activeStoreId, 'SUBMITTED'),
      fetchShiftsFromFirestore(orgId, activeStoreId),
      // Both are managers-only at the database anyway: employee_charges shows
      // staff their own rows, incidents_select is auth_is_elevated(). An
      // employee never reaches this screen, so an empty result here is correct
      // rather than something to hide.
      fetchEmployeeCharges(orgId, activeStoreId).catch(() => []),
      fetchIncidentsFromFirestore(orgId, activeStoreId === 'ALL' ? undefined : activeStoreId).catch(() => []),
    ])
      .then(([pending, all, charges, incidents]) => {
        setPendingShifts(pending);
        setAllShifts(all);
        const open = (charges ?? []).filter((c: any) => c.status === 'OPEN');
        setOpenCharges({
          count: open.length,
          total: open.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0),
        });
        setOpenIncidents((incidents ?? []).filter((i: any) => i.status !== 'RESOLVED').length);
      })
      .catch((err: any) => {
        console.error('Error loading dashboard shifts:', err);
        setFetchError(err.message || 'Αποτυχία φόρτωσης δεδομένων ταμπλό');
      })
      .finally(() => setLoadingShifts(false));
  }, [organization?.id, activeStoreId]);

  // Open since yesterday or earlier, in Athens time. Today's open shifts are
  // people at work; these are the ones nobody closed.
  const staleOpenShifts = (() => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
    return allShifts.filter(
      (s) =>
        ['OPEN', 'DRAFT_CLOSING'].includes(s.status) &&
        new Date(s.opened_at).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' }) < todayKey
    ).length;
  })();

  const activeStoreName =
    activeStoreId === 'ALL'
      ? 'Όλα τα Καταστήματα'
      : stores.find((s) => s.id === activeStoreId)?.name || 'Επιλεγμένο Κατάστημα';

  // Compute live KPIs from shifts, falling back to demo numbers only when there
  // is no shift data at all - a real sum of exactly 0 must stay 0, not get
  // silently replaced by a demo constant.
  const totalCompletedShifts = allShifts.filter((s) => s.status === 'APPROVED').length;
  const hasRealShifts = allShifts.length > 0;
  const totalRevenueCalculated = hasRealShifts
    ? allShifts.reduce((sum, s) => sum + (s.opap_gross_sales || 0) + (s.vlts_cash_in || 0) + (s.fnb_sales || 0), 0)
    : 14200;
  const totalExpensesCalculated = hasRealShifts
    ? allShifts.reduce((sum, s) => sum + (s.expenses_paid_cash || 0), 0)
    : 1860;
  const totalDiscrepanciesCalculated = hasRealShifts
    ? allShifts.reduce((sum, s) => sum + (s.discrepancy || 0), 0)
    : -8;
  const totalSafeDropCalculated = hasRealShifts
    ? allShifts.reduce((sum, s) => sum + (s.bank_deposits || 0), 0)
    : 4500;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <span>Αρχική</span>
            <span>/</span>
            <span className="text-slate-900 font-bold">Κεντρικό Ταμπλό Ελέγχου & KPIs</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>{organization?.trade_name || organization?.legal_name || 'ShiftLedger Store Manager'}</span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200">
              {activeStoreName}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Πλήρης επιχειρησιακή προβολή εσόδων ΟΠΑΠ/VLTs/FnB, καταμετρήσεων ταμείου, εξόδων & αποκλίσεων.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onNavigate('reports')}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>P&L, KPIs & Excel</span>
          </button>
          <button
            onClick={() => onNavigate('shifts')}
            className="transition px-4 py-2.5 duration-150 ease-out active:scale-[0.97] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-xs cursor-pointer flex items-center space-x-2"
          >
            <Clock className="w-4 h-4" />
            <span>Βάρδιες & Ταμείο</span>
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 flex items-start justify-between gap-3">
          <div className="flex items-start space-x-2 text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-xs font-semibold">
              {fetchError} — Οι παρακάτω τιμές ενδέχεται να μην είναι ενημερωμένες.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFetchError(null)}
            aria-label="Κλείσιμο"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* COMPREHENSIVE FINANCIAL & OPERATIONAL KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={toGreekUpper('Συνολικα Εσοδα (€)')}
          value={formatCurrency(totalRevenueCalculated)}
          icon={Euro}
          iconTone="primary"
          trend={{ direction: 'up', label: '+8.4%', tone: 'success' }}
          caption="ΟΠΑΠ: 55% | VLTs: 35% | FnB: 10%"
        />

        <StatCard
          label={toGreekUpper('Εξοδα & Πληρωμες (€)')}
          value={formatCurrency(totalExpensesCalculated)}
          icon={Receipt}
          iconTone="danger"
          trend={{ direction: 'flat', label: 'Εγκεκριμένα', tone: 'neutral' }}
          caption="Τιμολόγια, προμηθευτές & μικροέξοδα"
        />

        <StatCard
          label={toGreekUpper('Αποκλισεις Ταμειου (€)')}
          value={formatCurrency(totalDiscrepanciesCalculated, { showSign: true })}
          valueClassName={totalDiscrepanciesCalculated < 0 ? 'text-amber-600' : 'text-emerald-600'}
          icon={AlertTriangle}
          iconTone={totalDiscrepanciesCalculated < 0 ? 'warning' : 'success'}
          trend={
            Math.abs(totalDiscrepanciesCalculated) <= 10
              ? { direction: 'up', label: 'Εντός Ορίων', tone: 'success' }
              : { direction: 'down', label: 'Προσοχή', tone: 'warning' }
          }
          caption="Συνολική διαφορά καταμετρημένων vs Z"
        />

        <StatCard
          label={toGreekUpper('Καταθεσεις Safe Drop (€)')}
          value={formatCurrency(totalSafeDropCalculated)}
          icon={Vault}
          iconTone="accent"
          trend={{ direction: 'flat', label: 'Ασφαλισμένα', tone: 'accent' }}
          caption="Μεταφορές μετρητών στο χρηματοκιβώτιο"
        />
      </div>

      {/* Pending Shift Approval Banner */}
      {/* Εκκρεμότητες: everything waiting on a manager, in one place.
          Shifts left open are counted from yesterday or earlier, never today -
          a shift open at 4pm is someone working, not a problem, and a banner
          that cries about normal operation gets ignored within a week. */}
      {canApprove && (openCharges.count > 0 || openIncidents > 0 || staleOpenShifts > 0) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
          <h3 className="text-xs font-black text-slate-900">{toGreekUpper('Εκκρεμοτητες')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {staleOpenShifts > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('shifts')}
                className="transition text-left p-3 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-50 duration-150 ease-out active:scale-[0.99] cursor-pointer"
              >
                <span className="text-micro font-bold text-amber-800 uppercase tracking-wider block">
                  {toGreekUpper('Ανοιχτες απο προηγουμενη μερα')}
                </span>
                <span className="text-lg font-black text-amber-900 font-mono tabular-nums block mt-1">
                  {staleOpenShifts}
                </span>
                <span className="text-micro text-amber-800">
                  {staleOpenShifts === 1 ? 'βάρδια δεν έκλεισε' : 'βάρδιες δεν έκλεισαν'}
                </span>
              </button>
            )}

            {openCharges.count > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('shifts')}
                className="transition text-left p-3 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-50 duration-150 ease-out active:scale-[0.99] cursor-pointer"
              >
                <span className="text-micro font-bold text-rose-800 uppercase tracking-wider block">
                  {toGreekUpper('Ανεξοφλητες χρεωσεις')}
                </span>
                <span className="text-lg font-black text-rose-900 font-mono tabular-nums block mt-1">
                  {formatCurrency(openCharges.total)}
                </span>
                <span className="text-micro text-rose-800">
                  {openCharges.count} {openCharges.count === 1 ? 'χρέωση' : 'χρεώσεις'} σε εκκρεμότητα
                </span>
              </button>
            )}

            {openIncidents > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('incidents')}
                className="transition text-left p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 duration-150 ease-out active:scale-[0.99] cursor-pointer"
              >
                <span className="text-micro font-bold text-slate-600 uppercase tracking-wider block">
                  {toGreekUpper('Ανοιχτα συμβαντα')}
                </span>
                <span className="text-lg font-black text-slate-900 font-mono tabular-nums block mt-1">
                  {openIncidents}
                </span>
                <span className="text-micro text-slate-600">χωρίς επίλυση</span>
              </button>
            )}
          </div>
        </div>
      )}

      {canApprove && pendingShifts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-orange-500/10 border-2 border-amber-400/50 p-5 rounded-2xl shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-2xs shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-sm text-slate-900">
                  Εκκρεμότητες Εγκρίσεων: {pendingShifts.length} {pendingShifts.length === 1 ? 'Βάρδια' : 'Βάρδιες'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-micro font-black bg-amber-400 text-slate-950 animate-pulse">
                  AWAITING APPROVAL
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Υπάρχουν βάρδιες που έχουν υποβληθεί από το προσωπικό και αναμένουν την τελική έγκρισή σας.
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigate('shifts')}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-2xs transition-colors cursor-pointer flex items-center space-x-1.5 shrink-0"
          >
            <Clock className="w-4 h-4" />
            <span>Μετάβαση στις Βάρδιες ({pendingShifts.length})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Quick Actions Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-bold text-slate-900 text-sm">Γρήγορες Ενέργειες & Λειτουργίες</h2>
            <p className="text-xs text-slate-500">Άμεση μετάβαση στις βασικές ενότητες καθημερινής διαχείρισης</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('shifts')}
            className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-300 transition-colors text-left group cursor-pointer"
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

          {/* Money into the till happens mid-shift and takes five seconds.
              Reaching it meant walking back through the whole closing wizard. */}
          <button
            onClick={() => setQuickCash('TOPUP')}
            className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-300 transition-colors text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                <Banknote className="w-4 h-4" />
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Προσαύξηση Ταμείου</h3>
            <p className="text-xs text-slate-500 mt-0.5">Προσθήκη μετρητών στην ανοιχτή βάρδια, χωρίς κλείσιμο</p>
          </button>

          <button
            onClick={() => setQuickCash('SAFEDROP')}
            className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-300 transition-colors text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                <Vault className="w-4 h-4" />
              </div>
              <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Κατάθεση Χρηματοκιβωτίου</h3>
            <p className="text-xs text-slate-500 mt-0.5">Μεταφορά μετρητών στο χρηματοκιβώτιο μέσα στη βάρδια</p>
          </button>

          <button
            onClick={() => onNavigate('expenses')}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Έξοδα & Δαπάνες</h3>
            <p className="text-xs text-slate-500 mt-0.5">Καταχώρηση πληρωμών, τιμολογίων & μικροεξόδων</p>
          </button>

          <button
            onClick={() => onNavigate('incidents')}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Συμβάντα & Αποκλίσεις</h3>
            <p className="text-xs text-slate-500 mt-0.5">Καταγραφή συμβάντων, διαφορών & ελέγχων</p>
          </button>

          <button
            onClick={() => onNavigate('reports')}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <BarChart3 className="w-4 h-4" />
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Αναφορές & Analytics</h3>
            <p className="text-xs text-slate-500 mt-0.5">Στατιστικά πωλήσεων, αποκλίσεις & οικονομικά Z</p>
          </button>
        </div>
      </div>

      <QuickCashDialog
        isOpen={quickCash !== null}
        kind={quickCash ?? 'TOPUP'}
        onClose={() => setQuickCash(null)}
        orgId={organization!.id}
        storeId={activeStoreId !== 'ALL' ? activeStoreId : stores[0]?.id}
        canManage={hasPermission('organization.update') || hasPermission('store.update')}
      />
    </div>
  );
};

