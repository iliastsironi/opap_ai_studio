import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import {
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
  Filter,
  Search,
  Eye,
  Building2,
  Coins,
  ChevronLeft,
  ChevronRight,
  Printer,
  ShieldCheck,
  RefreshCw,
  Sliders,
  Scale,
  ChevronDown,
  ChevronUp,
  Trash2,
  UserCheck,
  LayoutGrid,
  Table as TableIcon,
  DollarSign,
  Calendar,
  User,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Shift } from '../../types/index.ts';
import { ShiftOpeningModal } from './ShiftOpeningModal.tsx';
import { ShiftStatusBadge } from '../ui/StatusBadge.tsx';
import { ShiftDetailsModal } from './ShiftDetailsModal.tsx';
import { ShiftReceiptPrintView } from './ShiftReceiptPrintView.tsx';
import { safeNum } from '../../services/financialCalculator.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { CustomerCreditDirectoryModal } from './CustomerCreditDirectoryModal.tsx';
import { DailyShiftReportModal } from './DailyShiftReportModal.tsx';
import { lazyWithRetry } from '../../lib/lazyWithRetry.ts';

// Lazy-loaded: each is only mounted behind a condition (active wizard / active
// manager tab), so keeping them out of the main chunk avoids shipping the
// wizard's ~3000 lines and the aggregation view's chart deps to every visitor.
const ShiftClosingWizard = lazyWithRetry(() =>
  import('./ShiftClosingWizard.tsx').then((m) => ({ default: m.ShiftClosingWizard }))
);
const ShiftTemplateConfigurator = lazyWithRetry(() =>
  import('./ShiftTemplateConfigurator.tsx').then((m) => ({ default: m.ShiftTemplateConfigurator }))
);
const DiscrepancyLedger = lazyWithRetry(() =>
  import('./DiscrepancyLedger.tsx').then((m) => ({ default: m.DiscrepancyLedger }))
);

// Statuses that mean "this shift is still someone's to finish". Keep this as
// the single source: the header button, the KPI count and every ΚΛΕΙΣΙΜΟ
// action must agree, or the page shows two different answers to "how many are
// open?" side by side.
const OPEN_SHIFT_STATUSES = ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'];

const LazyLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center py-24">
    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
  </div>
);
import { toGreekUpper } from '../../lib/greekTypography.ts';
import {
  fetchShiftsFromFirestore,
  subscribeToShifts,
  deleteShiftFromFirestore,
} from '../../services/shiftService.ts';
import { discrepancyClasses } from '../../lib/discrepancyTone.ts';
import { whoAndWhen } from '../../lib/shiftWhoWhen.ts';
import {
  dayLabel,
  groupShiftsByDay,
  registerLabel,
  shiftTypeLabel,
} from '../../lib/inspectionDayGroups.ts';

export const ShiftsManager: React.FC = () => {
  const { token, organization, roles, hasPermission, assignedStores } = useAuth();
  const { currentStore, stores: tenantStores, storeId, setStoreId } = useTenant();

  const isOwnerOrAdmin =
    roles?.some((r) => ['ORG_OWNER', 'ORG_ADMIN', 'PLATFORM_ADMIN'].includes(r.code)) ||
    hasPermission('roles.manage');

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

  const availableStores =
    assignedStores && assignedStores.length > 0
      ? assignedStores.map((s) => ({
          id: s.store_id,
          name: s.store_name || s.store_code,
          code: s.store_code || '',
        }))
      : tenantStores.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
        }));

  // Was falling back to three invented stores when the list was empty. An
  // empty list is the truth; the screen handles it.
  const effectiveStores = availableStores;

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [managerTab, setManagerTab] = useState<'SHIFTS' | 'DISCREPANCIES' | 'TEMPLATE'>('SHIFTS');
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>(() => {
    try {
      const saved = localStorage.getItem('shiftledger_shifts_view_mode');
      if (saved === 'CARDS' || saved === 'TABLE') return saved;
    } catch {}
    return 'TABLE';
  });

  const handleSetViewMode = (mode: 'CARDS' | 'TABLE') => {
    setViewMode(mode);
    try {
      localStorage.setItem('shiftledger_shifts_view_mode', mode);
    } catch {}
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  /**
   * Το κατάστημα που κοιτάς, ένα για όλη την εφαρμογή.
   *
   * This was local state starting at 'ALL', with the store picker in the top
   * bar driving a completely different value - setStoreId was imported here
   * and never called. So choosing a shop up there changed the heading and
   * nothing else: the list, the open shift and the totals all stayed on
   * every store at once, and shop 101499 showed you the shift that was open
   * at a different shop.
   *
   * One value now, read and written in both places, so the two controls
   * cannot disagree.
   */
  const selectedStoreFilter = storeId;
  const setSelectedStoreFilter = setStoreId;
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const SHIFTS_PAGE_SIZE = 20;

  // Reset to page 1 whenever what the user is filtering/searching for
  // changes - but not on every live-subscription push, which would
  // otherwise snap the page back on every unrelated shift update org-wide.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedStoreFilter, selectedStatusFilter]);

  // Modals & Active Wizard
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [showCreditDirectoryModal, setShowCreditDirectoryModal] = useState(false);
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [wizardShift, setWizardShift] = useState<Shift | null>(null);
  const [detailsShift, setDetailsShift] = useState<Shift | null>(null);
  const [receiptShift, setReceiptShift] = useState<Shift | null>(null);
  const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);
  const [isDeletingShift, setIsDeletingShift] = useState(false);
  const [deleteShiftError, setDeleteShiftError] = useState<string | null>(null);

  const orgId = organization!.id; // guaranteed by ProtectedLayout's organisation guard

  // Delete draft shift handler (Owner / Manager privilege)
  const handleDeleteShift = async (shiftToDel: Shift) => {
    setIsDeletingShift(true);
    setDeleteShiftError(null);
    try {
      await deleteShiftFromFirestore(shiftToDel.id);
      if (activeShift?.id === shiftToDel.id) {
        setActiveShift(null);
      }
      if (detailsShift?.id === shiftToDel.id) {
        setDetailsShift(null);
      }
      setShiftToDelete(null);
      await fetchShifts();
    } catch (err: any) {
      setDeleteShiftError(err.message || 'Σφάλμα κατά τη διαγραφή του προχείρου βάρδιας');
    } finally {
      setIsDeletingShift(false);
    }
  };

  // Fetch list of shifts
  const fetchShifts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const fsData = await fetchShiftsFromFirestore(orgId, selectedStoreFilter, selectedStatusFilter);
      setShifts(fsData);

      // Find active shift for current store
      const active = fsData.find(
        (s) =>
          s.store_id === currentStore?.id &&
          OPEN_SHIFT_STATUSES.includes(s.status)
      );
      setActiveShift(active || null);
    } catch (err: any) {
      setError(err.message || 'Σφάλμα ανάκτησης βαρδιών');
    } finally {
      setLoading(false);
    }
  }, [orgId, selectedStoreFilter, selectedStatusFilter, currentStore?.id]);

  useEffect(() => {
    fetchShifts();

    // Setup real-time listener for live shift state changes
    const unsub = subscribeToShifts(orgId, selectedStoreFilter, (updatedShifts) => {
      let filtered = updatedShifts;
      if (selectedStatusFilter !== 'ALL') {
        filtered = updatedShifts.filter((s) => s.status === selectedStatusFilter);
      }
      setShifts(filtered);

      const active = updatedShifts.find(
        (s) =>
          s.store_id === currentStore?.id &&
          OPEN_SHIFT_STATUSES.includes(s.status)
      );
      setActiveShift(active || null);
      setLoading(false);
    });

    return () => unsub();
  }, [orgId, selectedStoreFilter, selectedStatusFilter, currentStore?.id, fetchShifts]);

  // Handle open wizard for specific shift
  const handleOpenWizard = (shiftToClose: Shift) => {
    setWizardShift(shiftToClose);
  };

  // Filtered shifts based on search query
  const filteredShifts = useMemo(() => {
    if (!searchQuery.trim()) return shifts;
    const q = searchQuery.toLowerCase().trim();
    return shifts.filter(
      (s) =>
        s.store_name?.toLowerCase().includes(q) ||
        s.register_id?.toLowerCase().includes(q) ||
        s.opened_by_user_name?.toLowerCase().includes(q) ||
        s.closed_by_user_name?.toLowerCase().includes(q) ||
        s.shift_type?.toLowerCase().includes(q)
    );
  }, [shifts, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredShifts.length / SHIFTS_PAGE_SIZE));
  const pageSafe = Math.min(currentPage, totalPages);
  const paginatedShifts = filteredShifts.slice((pageSafe - 1) * SHIFTS_PAGE_SIZE, pageSafe * SHIFTS_PAGE_SIZE);

  // Key KPI metrics
  const metrics = useMemo(() => {
    const totalCount = shifts.length;
    const openCount = shifts.filter((s) => OPEN_SHIFT_STATUSES.includes(s.status)).length;
    const pendingCount = shifts.filter((s) => s.status === 'SUBMITTED').length;
    const totalDiscrepancy = shifts.reduce((acc, s) => acc + (Number(s.discrepancy) || 0), 0);

    return {
      totalCount,
      openCount,
      pendingCount,
      totalDiscrepancy,
    };
  }, [shifts]);

  // Every shift still open in the current view, for the header button.
  //
  // Deliberately derived from `shifts` rather than from `activeShift`:
  // activeShift matches on currentStore, which is null under «Όλα τα
  // Καταστήματα», so it finds nothing there. The whole point of this button is
  // that staff never hunt for their open shift, so it must not depend on the
  // store picker.
  //
  // That match used to read `currentStore?.id || 'store_opap_01'` - naming a
  // store that is not in the database. Same empty result, but it pointed a
  // default at a specific real agency to get there.
  const openShifts = useMemo(
    () =>
      shifts.filter((s) =>
        OPEN_SHIFT_STATUSES.includes(s.status)
      ),
    [shifts]
  );

  // Pending shifts for approval
  const pendingApprovalShifts = useMemo(
    () => shifts.filter((s) => s.status === 'SUBMITTED'),
    [shifts]
  );
  const pendingApprovalCount = pendingApprovalShifts.length;

  // One card per day, not per shift. The manager inspects the day's last
  // till; if that balances, the earlier ones have already passed their cash
  // through it and nobody opens them. Grouping says that on screen instead of
  // leaving three cards from the same Saturday to be matched up by eye.
  const pendingApprovalDays = useMemo(
    () => groupShiftsByDay(pendingApprovalShifts),
    [pendingApprovalShifts]
  );

  // If active closing wizard is open
  if (wizardShift) {
    return (
      <Suspense fallback={<LazyLoadingFallback />}>
        <ShiftClosingWizard
          shift={wizardShift}
          onBack={() => setWizardShift(null)}
          onSubmitted={() => {
            setWizardShift(null);
            fetchShifts();
          }}
        />
      </Suspense>
    );
  }

  const canCreate =
    hasPermission('shift.create') ||
    hasPermission('shifts.create') ||
    hasPermission('shifts.view') ||
    true;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Διαχείριση Βαρδιών & Ταμείου
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Έναρξη βάρδιας, καταχώρηση ημερήσιων εισπράξεων/εξόδων & καταμέτρηση ταμείου.
                </p>
              </div>
            </div>
          </div>

          {/* Top Actions & Tabs */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Open shift, reachable without scrolling or searching. The hero
                card further down says the same thing in more detail; this is
                the one staff hit on a phone, where the card is below the fold. */}
            {openShifts.length === 1 && (
              <div className="flex items-center gap-1.5">
                {/* Who is on it and since when, on screen rather than in a
                    title attribute - this control is the one staff hit on a
                    phone, where a tooltip does not exist. */}
                <div className="flex flex-col items-start gap-0.5">
                <button
                  onClick={() => handleOpenWizard(openShifts[0])}
                  className="transition px-3.5 py-2 rounded-xl duration-150 ease-out active:scale-[0.97] bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-xs whitespace-nowrap cursor-pointer"
                  title={`Κλείσιμο ανοιχτής βάρδιας — ${openShifts[0].store_name || ''} ${openShifts[0].register_id || ''}`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-200 animate-pulse shrink-0" />
                  <span>{toGreekUpper('Ανοιχτη Βαρδια')}</span>
                  <span className="font-bold opacity-80 hidden sm:inline">
                    · {toGreekUpper('Κλεισιμο')}
                  </span>
                </button>
                <span className="text-micro font-bold text-slate-600 font-mono pl-1 whitespace-nowrap">
                  {whoAndWhen(openShifts[0])}
                </span>
                </div>
                <IconButton
                  icon={Eye}
                  label="Προβολή ανοιχτής βάρδιας"
                  onClick={() => setDetailsShift(openShifts[0])}
                  className="border border-slate-200 bg-white"
                />
              </div>
            )}

            {openShifts.length > 1 && (
              <button
                onClick={() => setSelectedStatusFilter('OPEN')}
                className="transition px-3.5 py-2 rounded-xl duration-150 ease-out active:scale-[0.97] bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-xs whitespace-nowrap cursor-pointer"
                title="Εμφάνιση μόνο των ανοιχτών βαρδιών"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-200 animate-pulse shrink-0" />
                <span>
                  {openShifts.length} {toGreekUpper('Ανοιχτες Βαρδιες')}
                </span>
              </button>
            )}

            {/* Manager Navigation Tabs */}
            <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200 max-w-full overflow-x-auto">
              <button
                onClick={() => setManagerTab('SHIFTS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  managerTab === 'SHIFTS'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {toGreekUpper('Λιστα Βαρδιων')}
              </button>
              <button
                onClick={() => setManagerTab('DISCREPANCIES')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                  managerTab === 'DISCREPANCIES'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>{toGreekUpper('Αποκλισεις')}</span>
              </button>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setManagerTab('TEMPLATE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                    managerTab === 'TEMPLATE'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{toGreekUpper('Διαμορφωση')}</span>
                </button>
              )}
            </div>

            {/* Customer Credit Directory Modal Trigger */}
            <button
              onClick={() => setShowCreditDirectoryModal(true)}
              className="px-3.5 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center space-x-2 shadow-2xs transition-colors cursor-pointer"
              title="Διαχείριση Πιστώσεων, Πελατών & Ορίων Credit Score"
            >
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span className="hidden sm:inline">{toGreekUpper('Τεφτερι & Πιστωσεις')}</span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={fetchShifts}
              className="p-2 rounded-xl border border-slate-200/90 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
              title={toGreekUpper('Ανανεωση')}
              aria-label="Ανανέωση"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>

            {/* Primary Action Button */}
            {canCreate && (
              <button
                onClick={() => setShowOpeningModal(true)}
                className="transition px-4 py-2 rounded-xl duration-150 ease-out active:scale-[0.97] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center space-x-1.5 shadow-xs whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{toGreekUpper('Εναρξη Νεας Βαρδιας')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick KPI Strip (Responsive Tablet & Desktop Grid) */}
        {managerTab === 'SHIFTS' && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100">
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col justify-between">
              <span className="text-micro font-bold text-slate-500 uppercase tracking-wider">
                {toGreekUpper('Συνολο Βαρδιων')}
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg sm:text-xl font-black text-slate-900 font-mono">
                  {metrics.totalCount}
                </span>
                <span className="text-micro font-bold text-slate-500">
                  {metrics.openCount} {toGreekUpper('Ανοιχτες')}
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70 flex flex-col justify-between">
              <span className="text-micro font-bold text-amber-800 uppercase tracking-wider">
                {toGreekUpper('Προς Εγκριση')}
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg sm:text-xl font-black text-amber-900 font-mono">
                  {metrics.pendingCount}
                </span>
                <span className="text-micro font-black px-1.5 py-0.5 rounded bg-amber-200/70 text-amber-900">
                  {metrics.pendingCount > 0 ? toGreekUpper('Εκκρεμει') : toGreekUpper('Καθαρο')}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col justify-between">
              <span className="text-micro font-bold text-slate-500 uppercase tracking-wider">
                {toGreekUpper('Συνολικη Αποκλιση')}
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span
                  className={`text-lg sm:text-xl font-black font-mono ${
                    metrics.totalDiscrepancy < -0.01
                      ? 'text-rose-600'
                      : metrics.totalDiscrepancy > 0.01
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {formatCurrency(metrics.totalDiscrepancy, { showSign: true })}
                </span>
                <span className="text-micro font-bold text-slate-500">
                  {metrics.totalDiscrepancy === 0 ? toGreekUpper('Ισοζυγιο') : toGreekUpper('Διαφορα')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {managerTab === 'TEMPLATE' && isOwnerOrAdmin ? (
        <Suspense fallback={<LazyLoadingFallback />}>
          <ShiftTemplateConfigurator />
        </Suspense>
      ) : managerTab === 'DISCREPANCIES' ? (
        <Suspense fallback={<LazyLoadingFallback />}>
          <DiscrepancyLedger />
        </Suspense>
      ) : (
        <>
          {/* Manager Awaiting Approval Notification Banner (Tablet Responsive Grid) */}
          {canApprove && pendingApprovalCount > 0 && (
            <div className="bg-gradient-to-r from-amber-50 via-amber-50/70 to-orange-50/80 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                        Εκκρεμούν {pendingApprovalCount} {pendingApprovalCount === 1 ? 'Βάρδια' : 'Βάρδιες'} για Έγκριση
                      </h3>
                      <span className="px-2 py-0.5 rounded-md text-micro font-black bg-amber-400 text-slate-950 animate-pulse">
                        {toGreekUpper('Αναμονη Εγκρισης')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Υποβληθείσες βάρδιες από το προσωπικό που απαιτούν επιθεώρηση και έγκριση διευθυντή.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'SUBMITTED' ? 'ALL' : 'SUBMITTED')}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                    selectedStatusFilter === 'SUBMITTED'
                      ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-2xs font-black'
                      : 'bg-white text-slate-800 border-amber-300 hover:bg-amber-100/50'
                  }`}
                >
                  {selectedStatusFilter === 'SUBMITTED'
                    ? toGreekUpper('Εμφανιση Ολων')
                    : `${toGreekUpper('Φιλτραρισμα')} (${pendingApprovalCount})`}
                </button>
              </div>

              {/* One card per day: the day's tills together, each still
                  inspected on its own. Two columns at most - every shift
                  inside carries its own button, so three columns crushes
                  them at tablet width. */}
              <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-3.5 pt-1">
                {pendingApprovalDays.map((day) => (
                  <div
                    key={day.key}
                    className="transition bg-white rounded-xl border border-amber-200 shadow-2xs hover:shadow-xs overflow-hidden"
                  >
                    {/* Day header: whose day, and which day */}
                    <div className="px-4 py-3 bg-amber-50/70 border-b border-amber-200 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="text-micro font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            {day.storeName}
                          </span>
                          <span className="text-micro font-bold text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                            {registerLabel(day.registerId)}
                          </span>
                        </div>
                        <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                          <Calendar aria-hidden="true" className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="truncate">{dayLabel(day.day)}</span>
                        </h4>
                      </div>

                      <span className="shrink-0 text-micro font-black px-2 py-1 rounded-md bg-amber-200/80 text-amber-900 whitespace-nowrap">
                        {day.shifts.length}{' '}
                        {toGreekUpper(day.shifts.length === 1 ? 'Βαρδια' : 'Βαρδιες')}
                      </span>
                    </div>

                    {/* The day's tills, last one first - that is the one the
                        manager opens, and the only one they open when it
                        balances. */}
                    <div className="p-3 space-y-2">
                      {day.shifts.map((pShift) => {
                        const isLast = pShift.id === day.lastShift.id;
                        const hasEarlier = day.shifts.length > 1;
                        const stamp = new Date(pShift.closed_at || pShift.opened_at);

                        return (
                          <div
                            key={pShift.id}
                            className={`rounded-xl border p-3 space-y-2.5 ${
                              isLast && hasEarlier
                                ? 'border-amber-300 bg-amber-50/50'
                                : 'border-slate-200 bg-slate-50/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-slate-900 text-xs">
                                    {shiftTypeLabel(pShift.shift_type)}
                                  </span>
                                  {isLast && hasEarlier && (
                                    <span className="text-micro font-black px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 whitespace-nowrap">
                                      {toGreekUpper('Τελευταια')}
                                    </span>
                                  )}
                                </div>
                                <span className="text-micro text-slate-600 font-bold block truncate mt-0.5">
                                  {pShift.opened_by_user_name || 'Υπάλληλος'}
                                </span>
                                <span className="text-micro text-slate-500 font-mono block">
                                  {stamp.toLocaleTimeString('el-GR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="text-micro text-slate-500 block font-bold">
                                  {toGreekUpper('Αποκλιση')}
                                </span>
                                {/* The shift's own tolerance, as everywhere else. */}
                                <span
                                  className={`font-black text-xs font-mono px-2 py-0.5 rounded-lg border inline-block mt-0.5 ${
                                    discrepancyClasses(
                                      pShift.discrepancy,
                                      pShift.discrepancy_threshold
                                    ).badge
                                  }`}
                                >
                                  {formatCurrency(Number(pShift.discrepancy || 0), {
                                    showSign: true,
                                  })}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => setDetailsShift(pShift)}
                              className={`w-full py-2.5 px-3 rounded-lg font-black text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer ${
                                isLast
                                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-2xs'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                              }`}
                            >
                              <ShieldCheck className="w-4 h-4" />
                              <span>{toGreekUpper('Επιθεωρηση & Εγκριση')}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Shift Hero Card (Grouped Responsive Grid for Tablets) */}
          {activeShift && (
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-md border border-indigo-800/80">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                {/* Group 1: Identity & Status (md:col-span-5) */}
                <div className="md:col-span-5 flex items-start space-x-3.5">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-black text-xs sm:text-sm text-white tracking-wide">
                        {toGreekUpper('Ενεργη Βαρδια σε Εξελιξη')}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-micro font-black bg-emerald-500 text-slate-950">
                        {toGreekUpper(activeShift.status)}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-indigo-100 mt-1">
                      {activeShift.store_name} ({activeShift.register_id})
                    </p>
                    {/* The date as well as the time: a till left open
                        overnight read as though it had started this morning. */}
                    <p className="text-xs text-slate-300 mt-0.5">
                      Χειριστής: {whoAndWhen(activeShift)}
                    </p>
                  </div>
                </div>

                {/* Group 2: Key Financials (md:col-span-3) */}
                <div className="md:col-span-3 bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-micro font-bold uppercase text-slate-500">
                    {toGreekUpper('Αρχικο Ταμειο (Float)')}
                  </span>
                  <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                    {formatCurrency(Number(activeShift.opening_cash))}
                  </div>
                  <span className="text-micro text-slate-500 mt-0.5">
                    {activeShift.shift_type === 'MORNING'
                      ? 'Πρωινή Βάρδια'
                      : activeShift.shift_type === 'AFTERNOON'
                      ? 'Απογευματινή'
                      : 'Βραδινή'}
                  </span>
                </div>

                {/* Group 3: Action Buttons Group (md:col-span-4) */}
                <div className="md:col-span-4 flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch sm:items-center justify-end gap-2">
                  <button
                    onClick={() => handleOpenWizard(activeShift)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center space-x-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <span>{toGreekUpper('Οδηγος Κλεισιματος')}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {(isOwnerOrAdmin || canApprove) && (
                    <button
                      onClick={() => setShiftToDelete(activeShift)}
                      className="py-2.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                      title="Διαγραφή Προχείρου Βάρδιας (Μόνο Διαχειριστής/Ιδιοκτήτης)"
                    >
                      <Trash2 className="w-4 h-4 text-rose-400" />
                      <span className="sm:hidden md:inline lg:hidden">{toGreekUpper('Διαγραφη')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-rose-100 border border-rose-300 rounded-xl p-3 flex items-start justify-between gap-3">
              <div className="flex items-start space-x-2 text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="text-xs font-semibold">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Κλείσιμο"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Grouped Filter, Search & View Controls Bar - was sm: (640px), which
              switches this row from stacked to a 12-col inline grid before
              there's actually enough width for 2 dropdowns (long option text
              like "ΟΛΕΣ ΟΙ ΚΑΤΑΣΤΑΣΕΙΣ") plus the view switcher - confirmed
              live at 768px (tablet): both selects visibly truncated. lg:
              (1024px) is genuine desktop width; tablet now keeps the stacked
              layout that already renders cleanly at phone widths too. */}
          <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              {/* Search Field (lg:col-span-5) */}
              <div className="lg:col-span-5 relative">
                <label htmlFor="shifts-search" className="sr-only">Αναζήτηση βαρδιών</label>
                <Search aria-hidden="true" className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="shifts-search"
                  type="text"
                  placeholder="Αναζήτηση με χειριστή, κατάστημα, ταμείο..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 font-medium text-xs text-slate-800 bg-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Store & Status Filters (lg:col-span-5) */}
              <div className="lg:col-span-5 grid grid-cols-2 gap-2">
                <label htmlFor="shifts-store-filter" className="sr-only">Φίλτρο καταστήματος</label>
                <select
                  id="shifts-store-filter"
                  value={selectedStoreFilter}
                  onChange={(e) => setSelectedStoreFilter(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 font-medium text-xs text-slate-800 bg-white"
                >
                  <option value="ALL">{toGreekUpper('Ολα τα Καταστηματα')}</option>
                  {effectiveStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>

                <label htmlFor="shifts-status-filter" className="sr-only">Φίλτρο κατάστασης</label>
                <select
                  id="shifts-status-filter"
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 font-medium text-xs text-slate-800 bg-white"
                >
                  <option value="ALL">{toGreekUpper('Ολες οι Καταστασεις')}</option>
                  <option value="OPEN">{toGreekUpper('Ανοικτες (OPEN)')}</option>
                  <option value="DRAFT_CLOSING">{toGreekUpper('Προχειρο (DRAFT)')}</option>
                  <option value="SUBMITTED">{toGreekUpper('Υποβληθεισες (SUBMITTED)')}</option>
                  <option value="APPROVED">{toGreekUpper('Εγκεκριμενες (APPROVED)')}</option>
                  <option value="CORRECTION_REQUESTED">{toGreekUpper('Αιτηση Διορθωσης')}</option>
                </select>
              </div>

              {/* View Layout Switcher (lg:col-span-2) */}
              <div className="lg:col-span-2 flex items-center justify-end space-x-1 bg-slate-100/90 p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleSetViewMode('TABLE')}
                  className={`p-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer flex-1 flex items-center justify-center space-x-1 ${
                    viewMode === 'TABLE'
                      ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Προβολή Πίνακα (Γραμμές με Στήλες)"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span className="text-micro">{toGreekUpper('Πινακας')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetViewMode('CARDS')}
                  className={`p-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer flex-1 flex items-center justify-center space-x-1 ${
                    viewMode === 'CARDS'
                      ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Προβολή Καρτών"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="text-micro">{toGreekUpper('Καρτες')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Shifts Content: Cards Grid or Data Table */}
          {loading ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500 space-y-3">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs font-medium">Φόρτωση βαρδιών...</p>
            </div>
          ) : filteredShifts.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500 space-y-2">
              <Clock className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-700">Δεν βρέθηκαν βάρδιες</p>
              <p className="text-xs text-slate-500">
                {searchQuery
                  ? 'Δεν βρέθηκαν αποτελέσματα με τα κριτήρια αναζήτησης.'
                  : 'Ξεκινήστε μια νέα βάρδια πατώντας το κουμπί "Έναρξη Νέας Βάρδιας".'}
              </p>
            </div>
          ) : viewMode === 'CARDS' ? (
            /* Tablet Responsive Grid Cards */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedShifts.map((s) => (
                <div
                  key={s.id}
                  className={`transition bg-white rounded-2xl border shadow-2xs hover:shadow-xs flex flex-col justify-between overflow-hidden ${
                    s.status === 'SUBMITTED'
                      ? 'border-amber-300 ring-2 ring-amber-400/20'
                      : s.status === 'OPEN' || s.status === 'DRAFT_CLOSING'
                      ? 'border-indigo-200'
                      : 'border-slate-200/80'
                  }`}
                >
                  {/* Card Header Group */}
                  <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-1.5 mb-1">
                        <span className="text-micro font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wide">
                          {s.store_name}
                        </span>
                        <span className="text-micro font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {s.register_id === 'REG-01' ? 'Ταμείο 1' : s.register_id}
                        </span>
                      </div>
                      <h3 className="font-extrabold text-sm text-slate-900">
                        {s.shift_type === 'MORNING'
                          ? 'Πρωινή Βάρδια'
                          : s.shift_type === 'AFTERNOON'
                          ? 'Απογευματινή Βάρδια'
                          : 'Βραδινή Βάρδια'}
                      </h3>
                      <p className="text-micro text-slate-500 font-mono mt-0.5">
                        {new Date(s.opened_at).toLocaleDateString('el-GR')}{' '}
                        {new Date(s.opened_at).toLocaleTimeString('el-GR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <ShiftStatusBadge status={s.status} />
                    </div>
                  </div>

                  {/* Card Body - Cashier & Financial Matrix Group */}
                  <div className="p-4 space-y-3.5 flex-1">
                    {/* Cashier Info */}
                    <div className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-xl">
                      <div className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center text-slate-600 text-micro font-bold shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="text-micro text-slate-500 block font-bold uppercase">
                          {toGreekUpper('Χειριστης')}
                        </span>
                        <span className="font-bold text-slate-900 truncate block">
                          {s.opened_by_user_name || 'Υπάλληλος'}
                        </span>
                      </div>
                    </div>

                    {/* Financial Matrix (2x2 Grid) */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 col-span-2 flex items-center justify-between">
                        <div>
                          <span className="text-micro font-bold text-slate-500 block uppercase">
                            {toGreekUpper('Αποκλιση Ταμειου')}
                          </span>
                          <span className="text-micro text-slate-500">
                            (Καταμέτρηση - Αναμενόμενο)
                          </span>
                        </div>
                        {/* The shift's OWN tolerance, stamped when it was
                            opened. This list used to paint every shortage
                            red whatever the store allowed, and every surplus
                            orange - so the same figure was a different
                            colour here and on the closing screen. */}
                        <span
                          className={`font-black text-sm font-mono px-2 py-0.5 rounded-lg border ${
                            discrepancyClasses(s.discrepancy, s.discrepancy_threshold).badge
                          }`}
                        >
                          {formatCurrency(Number(s.discrepancy || 0), { showSign: true })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Buttons Group (Tablet Touch Targets 42px+) */}
                  <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex items-center gap-2">
                    {OPEN_SHIFT_STATUSES.includes(
                      s.status
                    ) && (
                      <button
                        onClick={() => handleOpenWizard(s)}
                        className="transition flex-1 py-2 px-3 rounded-xl duration-150 ease-out active:scale-[0.97] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer flex items-center justify-center space-x-1 shadow-2xs"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{toGreekUpper('Κλεισιμο')}</span>
                      </button>
                    )}

                    {s.status === 'SUBMITTED' && canApprove && (
                      <button
                        onClick={() => setDetailsShift(s)}
                        className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center justify-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
                        title="Επιθεώρηση & Έγκριση"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>{toGreekUpper('Εγκριση')}</span>
                      </button>
                    )}

                    <button
                      onClick={() => setDetailsShift(s)}
                      className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>{toGreekUpper('Προβολη')}</span>
                    </button>

                    {(isOwnerOrAdmin || canApprove) &&
                      ['DRAFT_CLOSING', 'OPEN', 'CORRECTION_REQUESTED', 'REOPENED'].includes(
                        s.status
                      ) && (
                        <button
                          onClick={() => setShiftToDelete(s)}
                          className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors cursor-pointer"
                          title="Διαγραφή Προχείρου Βάρδιας (Μόνο Ιδιοκτήτης / Διαχειριστής)"
                          aria-label="Διαγραφή Προχείρου Βάρδιας"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Dense & Readable Data Table Mode (Rows with Columns) */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/90 text-slate-700 font-extrabold uppercase tracking-wider text-micro border-b border-slate-200 select-none">
                    <tr>
                      <th className="px-3.5 py-3.5 whitespace-nowrap">{toGreekUpper('Ημερομηνια & Ωρα')}</th>
                      <th className="px-3.5 py-3.5 whitespace-nowrap">{toGreekUpper('Καταστημα & Ταμειο')}</th>
                      <th className="px-3.5 py-3.5 whitespace-nowrap">{toGreekUpper('Βαρδια')}</th>
                      <th className="px-3.5 py-3.5 whitespace-nowrap">{toGreekUpper('Χειριστης')}</th>
                      <th className="px-3.5 py-3.5 text-right whitespace-nowrap">{toGreekUpper('Αποκλιση')}</th>
                      <th className="px-3.5 py-3.5 text-center whitespace-nowrap">{toGreekUpper('Κατασταση')}</th>
                      <th className="px-3.5 py-3.5 text-right whitespace-nowrap">{toGreekUpper('Ενεργειες')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {paginatedShifts.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => setDetailsShift(s)}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDetailsShift(s);
                          }
                        }}
                        className={`transition-colors cursor-pointer group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset ${
                          s.status === 'SUBMITTED'
                            ? 'bg-amber-50/40 hover:bg-amber-100/60 border-l-4 border-l-amber-500'
                            : s.status === 'OPEN'
                            ? 'bg-blue-50/20 hover:bg-blue-100/40 border-l-4 border-l-blue-500'
                            : s.status === 'CORRECTION_REQUESTED'
                            ? 'bg-rose-50/30 hover:bg-rose-100/50 border-l-4 border-l-rose-500'
                            : 'hover:bg-indigo-50/40 border-l-4 border-l-transparent'
                        }`}
                      >
                        {/* 1. Ημερομηνία & Ώρα */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <div className="font-bold text-slate-900 font-mono text-xs">
                            {new Date(s.opened_at).toLocaleDateString('el-GR')}
                          </div>
                          <div className="text-micro text-slate-500 font-mono mt-0.5">
                            {new Date(s.opened_at).toLocaleTimeString('el-GR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {s.closed_at ? (
                              <>
                                {' - '}
                                {new Date(s.closed_at).toLocaleTimeString('el-GR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </>
                            ) : (
                              <span className="text-emerald-600 font-bold ml-1">({toGreekUpper('Σε εξελιξη')})</span>
                            )}
                          </div>
                        </td>

                        {/* 2. Κατάστημα & Ταμείο */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <div className="font-bold text-slate-900 text-xs">{s.store_name}</div>
                          <div className="text-micro text-indigo-700 bg-indigo-50/80 px-1.5 py-0.5 rounded font-semibold inline-block mt-0.5">
                            {s.register_id === 'REG-01' ? 'Ταμείο 1' : s.register_id}
                          </div>
                        </td>

                        {/* 3. Βάρδια */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-micro font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {s.shift_type === 'MORNING'
                              ? 'Πρωινή (Α)'
                              : s.shift_type === 'AFTERNOON'
                              ? 'Απογευματινή (Β)'
                              : s.shift_type === 'NIGHT'
                              ? 'Βραδινή (Γ)'
                              : s.shift_type || 'Βάρδια'}
                          </span>
                        </td>

                        {/* 4. Χειριστής */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-micro font-bold shrink-0">
                              <User className="w-3 h-3" />
                            </div>
                            <span className="font-bold text-slate-900 text-xs truncate max-w-[130px]">
                              {s.opened_by_user_name || 'Υπάλληλος'}
                            </span>
                          </div>
                        </td>

                        {/* 5. Απόκλιση */}
                        <td className="px-3.5 py-3 text-right whitespace-nowrap">
                          <span
                            className={`inline-block font-mono text-xs font-black px-2 py-0.5 rounded-lg border ${
                              discrepancyClasses(s.discrepancy, s.discrepancy_threshold).badge
                            }`}
                          >
                            {formatCurrency(Number(s.discrepancy || 0), { showSign: true })}
                          </span>
                        </td>

                        {/* 6. Κατάσταση */}
                        <td className="px-3.5 py-3 text-center whitespace-nowrap">
                          <ShiftStatusBadge status={s.status} />
                        </td>

                        {/* 7. Ενέργειες */}
                        <td
                          className="px-3.5 py-3 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end space-x-1.5">
                            {OPEN_SHIFT_STATUSES.includes(
                              s.status
                            ) && (
                              <button
                                onClick={() => handleOpenWizard(s)}
                                className="transition px-2.5 py-1.5 rounded-lg duration-150 ease-out active:scale-[0.97] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer shadow-2xs"
                                title="Οδηγός Κλεισίματος Βάρδιας"
                              >
                                {toGreekUpper('Κλεισιμο')}
                              </button>
                            )}

                            {s.status === 'SUBMITTED' && canApprove && (
                              <button
                                onClick={() => setDetailsShift(s)}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center space-x-1 shadow-2xs transition-colors cursor-pointer"
                                title="Επιθεώρηση & Έγκριση"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>{toGreekUpper('Εγκριση')}</span>
                              </button>
                            )}

                            <button
                              onClick={() => setDetailsShift(s)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
                              title="Προβολή Λεπτομερειών Βάρδιας"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>{toGreekUpper('Προβολη')}</span>
                            </button>

                            <IconButton
                              icon={Printer}
                              label="Εκτύπωση Θερμικής Απόδειξης"
                              tone="primary"
                              onClick={() => setReceiptShift(s)}
                              className="border border-slate-200 bg-white shadow-2xs"
                            />

                            {(isOwnerOrAdmin || canApprove) &&
                              ['DRAFT_CLOSING', 'OPEN', 'CORRECTION_REQUESTED', 'REOPENED'].includes(
                                s.status
                              ) && (
                                <IconButton
                                  icon={Trash2}
                                  label="Διαγραφή Προχείρου Βάρδιας"
                                  tone="danger"
                                  onClick={() => setShiftToDelete(s)}
                                  className="bg-rose-50 text-rose-700"
                                />
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Table Footer with Summary Row */}
                  <tfoot className="bg-slate-50/90 border-t-2 border-slate-200 font-bold text-slate-800 text-xs">
                    <tr>
                      <td colSpan={4} className="px-3.5 py-3 text-slate-500 uppercase tracking-wider text-micro">
                        {toGreekUpper('Συνολα Προβολης')} ({filteredShifts.length}{' '}
                        {filteredShifts.length === 1 ? 'Βάρδια' : 'Βάρδιες'})
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono font-black">
                        {(() => {
                          const totalDisc = filteredShifts.reduce(
                            (acc, s) => acc + (Number(s.discrepancy) || 0),
                            0
                          );
                          return (
                            <span
                              className={
                                totalDisc < -0.01
                                  ? 'text-rose-600'
                                  : totalDisc > 0.01
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                              }
                            >
                              {formatCurrency(totalDisc, { showSign: true })}
                            </span>
                          );
                        })()}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {filteredShifts.length > SHIFTS_PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
              <span>
                {(pageSafe - 1) * SHIFTS_PAGE_SIZE + 1}-
                {Math.min(pageSafe * SHIFTS_PAGE_SIZE, filteredShifts.length)} από {filteredShifts.length} βάρδιες
              </span>
              <div className="flex items-center space-x-2">
                <IconButton
                  icon={ChevronLeft}
                  label="Προηγούμενη σελίδα"
                  disabled={pageSafe <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="border border-slate-200 bg-white"
                />
                <span className="font-bold text-slate-700">Σελίδα {pageSafe} / {totalPages}</span>
                <IconButton
                  icon={ChevronRight}
                  label="Επόμενη σελίδα"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="border border-slate-200 bg-white"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Shift Opening Modal */}
      <ShiftOpeningModal
        isOpen={showOpeningModal}
        onClose={() => setShowOpeningModal(false)}
        onSuccess={(shiftId) => {
          fetchShifts();
        }}
        stores={effectiveStores}
      />

      {/* Shift Details Modal */}
      <ShiftDetailsModal
        shift={detailsShift}
        isOpen={Boolean(detailsShift)}
        onClose={() => setDetailsShift(null)}
        onRefresh={fetchShifts}
        onOpenClosingWizard={(s) => setWizardShift(s)}
        onDeleteRequest={(s) => {
          setDetailsShift(null);
          setShiftToDelete(s);
        }}
      />

      {/* Delete Draft Shift Confirmation */}
      <ConfirmDialog
        isOpen={shiftToDelete !== null}
        layer="stacked"
        closeOnBackdropClick={false}
        title="Διαγραφή Προχείρου Βάρδιας"
        message={
          shiftToDelete && (
            <div className="space-y-3">
              <p className="text-micro font-bold text-rose-600 tracking-wider">
                {toGreekUpper('Ενεργεια Ιδιοκτητη / Διαχειριστη')}
              </p>
              <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-3.5 space-y-2 text-xs text-rose-950">
                <p className="font-bold">
                  Είστε βέβαιοι ότι θέλετε να διαγράψετε οριστικά αυτό το πρόχειρο βάρδιας;
                </p>
                <div className="bg-white/80 rounded-lg p-2.5 space-y-1 text-micro border border-rose-200">
                  <div>
                    <strong>Κατάστημα:</strong> {shiftToDelete.store_name} ({shiftToDelete.register_id})
                  </div>
                  <div>
                    <strong>Υπάλληλος Έναρξης:</strong> {shiftToDelete.opened_by_user_name || 'Υπάλληλος'}
                  </div>
                  <div>
                    <strong>Ημερομηνία:</strong> {new Date(shiftToDelete.opened_at).toLocaleString('el-GR')}
                  </div>
                  <div>
                    <strong>Κατάσταση:</strong> {shiftToDelete.status}
                  </div>
                </div>
                <p className="text-micro text-rose-700">
                  ⚠️ Τα δεδομένα του προχείρου (καταμετρήσεις, πρόχειρες καταχωρήσεις) θα διαγραφούν οριστικά από τη βάση δεδομένων.
                </p>
              </div>
              {deleteShiftError && (
                <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 text-xs font-semibold text-rose-800">
                  {deleteShiftError}
                </div>
              )}
            </div>
          )
        }
        confirmLabel="Οριστική Διαγραφή"
        isLoading={isDeletingShift}
        loadingLabel="Διαγραφή..."
        onConfirm={() => shiftToDelete && handleDeleteShift(shiftToDelete)}
        onCancel={() => {
          setShiftToDelete(null);
          setDeleteShiftError(null);
        }}
      />

      {/* Customer Credit & Debts Directory Modal */}
      <CustomerCreditDirectoryModal
        isOpen={showCreditDirectoryModal}
        onClose={() => setShowCreditDirectoryModal(false)}
        orgId={organization!.id}
        storeId={currentStore?.id}
        isOwnerOrManager={Boolean(isOwnerOrAdmin || canApprove)}
      />

      {/* Daily Aggregation Report Popup Modal */}
      <DailyShiftReportModal
        isOpen={showDailyReportModal}
        onClose={() => setShowDailyReportModal(false)}
        shifts={shifts}
        stores={effectiveStores}
        currentStoreId={currentStore?.id || selectedStoreFilter}
        onOpenShiftDetails={(s) => setDetailsShift(s)}
      />

      {/* Thermal Receipt Print View Modal */}
      {receiptShift && (
        <ShiftReceiptPrintView
          isOpen={Boolean(receiptShift)}
          onClose={() => setReceiptShift(null)}
          data={{
            shift: receiptShift,
            storeName: receiptShift.store_name || 'OPAP AGENCY',
            storeCode: receiptShift.store_code || receiptShift.store_id || '100343',
            registerId: receiptShift.register_id || 'POS-01',
            cashierName: receiptShift.closed_by_user_name || receiptShift.opened_by_user_name || 'Υπάλληλος Βάρδιας',
            shiftType: receiptShift.shift_type || 'MORNING',
            openedAt: receiptShift.opened_at,
            closedAt: receiptShift.closed_at || new Date().toISOString(),
            denominations: receiptShift.counted_denominations || {},
            openingCashTotal: safeNum(receiptShift.opening_cash),
            arithmoGross: safeNum(receiptShift.arithmo_gross ?? receiptShift.number_games_sales),
            arithmoCancels: safeNum(receiptShift.arithmo_cancels ?? receiptShift.number_games_cancellations),
            arithmoPayouts: safeNum(receiptShift.arithmo_payouts ?? receiptShift.number_games_payouts),
            arithmoVouchers: safeNum(receiptShift.arithmo_vouchers ?? receiptShift.number_games_vouchers),
            arithmoNet: safeNum((receiptShift as any).arithmo_net ?? (safeNum(receiptShift.arithmo_gross) - safeNum(receiptShift.arithmo_cancels) - safeNum(receiptShift.arithmo_payouts) + safeNum(receiptShift.arithmo_vouchers))),
            scratchSales: safeNum(receiptShift.scratch_sales ?? receiptShift.scratch_lotto_sales),
            scratchPayouts: safeNum(receiptShift.scratch_payouts),
            scratchNet: safeNum(receiptShift.scratch_lotto_sales),
            vltsIn: safeNum(receiptShift.vlts_cash_in),
            vltsOut: safeNum(receiptShift.vlts_cash_out),
            vltsNet: safeNum((receiptShift as any).vlts_net ?? (safeNum(receiptShift.vlts_cash_in) - Math.abs(safeNum(receiptShift.vlts_cash_out)))),
            pameStoiximaBalance: safeNum(receiptShift.pame_stoixima_balance),
            cleverPointTotal: safeNum(receiptShift.clever_point_total),
            ippodromosBalance: safeNum(receiptShift.ippodromos_balance),
            fnbCash: safeNum(receiptShift.fnb_cash),
            fnbCard: safeNum(receiptShift.fnb_card),
            fnbTotal: safeNum(receiptShift.fnb_sales),
            expensesGpCash: safeNum(receiptShift.opap_expenses ?? (receiptShift.expenses_paid_cash || 0)),
            expensesFnbCash: safeNum(receiptShift.fnb_expenses),
            expensesTotalCash: safeNum(receiptShift.expenses_paid_cash),
            expensesList: Array.isArray(receiptShift.expenses) ? receiptShift.expenses.map((e) => ({
              id: e.id,
              category: e.category,
              recipient: e.description || e.category,
              amount: safeNum(e.amount),
              notes: e.description,
            })) : [],
            safeDrop: safeNum(receiptShift.bank_deposits ?? receiptShift.safe_drop),
            storePos1: safeNum(receiptShift.register_pos_1),
            storePos2: safeNum(receiptShift.register_pos_2),
            totalStorePos: safeNum(receiptShift.card_payments),
            toraPos1: safeNum(receiptShift.tora_pos1 ?? receiptShift.tora_pos_1),
            toraPos2: safeNum(receiptShift.tora_pos2 ?? receiptShift.tora_pos_2),
            totalToraPos: safeNum((receiptShift as any).tora_total ?? (safeNum(receiptShift.tora_pos1) + safeNum(receiptShift.tora_pos2))),
            creditGranted: safeNum(receiptShift.customer_credit_granted),
            creditCollected: safeNum(receiptShift.customer_credit_collected ?? receiptShift.customer_returns),
            totalCountedCash: safeNum(receiptShift.counted_cash ?? receiptShift.actual_cash),
            totalExpectedCash: safeNum(receiptShift.expected_cash),
            discrepancy: safeNum(receiptShift.discrepancy),
            isUnbalanced: receiptShift.is_unbalanced ?? (Math.abs(safeNum(receiptShift.discrepancy)) > 0.01),
            employeeNotes: receiptShift.employee_notes,
            managerNotes: receiptShift.manager_notes,
          }}
        />
      )}
    </div>
  );
};
