import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Trash2,
  UserCheck,
  Layers,
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Shift, ShiftStatus } from '../../types/index.ts';
import { ShiftOpeningModal } from './ShiftOpeningModal.tsx';
import { ShiftClosingWizard } from './ShiftClosingWizard.tsx';
import { ShiftDetailsModal } from './ShiftDetailsModal.tsx';
import { ShiftTemplateConfigurator } from './ShiftTemplateConfigurator.tsx';
import { CustomerCreditDirectoryModal } from './CustomerCreditDirectoryModal.tsx';
import { DailyAggregationView } from './DailyAggregationView.tsx';
import { DailyShiftReportModal } from './DailyShiftReportModal.tsx';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import {
  fetchShiftsFromFirestore,
  subscribeToShifts,
  deleteShiftFromFirestore,
} from '../../services/shiftService.ts';
import { INITIAL_DEMO_STORES } from '../../services/storeService.ts';

export const ShiftsManager: React.FC = () => {
  const { token, organization, roles, hasPermission, assignedStores } = useAuth();
  const { currentStore, stores: tenantStores, setStoreId } = useTenant();

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

  const effectiveStores =
    availableStores.length > 0
      ? availableStores
      : INITIAL_DEMO_STORES.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
        }));

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [managerTab, setManagerTab] = useState<'SHIFTS' | 'DAILY_REPORT' | 'TEMPLATE'>('SHIFTS');
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Active Wizard
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [showCreditDirectoryModal, setShowCreditDirectoryModal] = useState(false);
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [wizardShift, setWizardShift] = useState<Shift | null>(null);
  const [detailsShift, setDetailsShift] = useState<Shift | null>(null);
  const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);
  const [isDeletingShift, setIsDeletingShift] = useState(false);

  const orgId = organization?.id || 'org_opap_demo';

  // Delete draft shift handler (Owner / Manager privilege)
  const handleDeleteShift = async (shiftToDel: Shift) => {
    setIsDeletingShift(true);
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
      alert(err.message || 'Σφάλμα κατά τη διαγραφή του προχείρου βάρδιας');
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
          s.store_id === (currentStore?.id || 'store_opap_01') &&
          ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'].includes(s.status)
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
          s.store_id === (currentStore?.id || 'store_opap_01') &&
          ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'].includes(s.status)
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

  // Key KPI metrics
  const metrics = useMemo(() => {
    const totalCount = shifts.length;
    const openCount = shifts.filter((s) => ['OPEN', 'DRAFT_CLOSING'].includes(s.status)).length;
    const pendingCount = shifts.filter((s) => s.status === 'SUBMITTED').length;
    const totalCountedCash = shifts.reduce((acc, s) => acc + (Number(s.counted_cash) || 0), 0);
    const totalDiscrepancy = shifts.reduce((acc, s) => acc + (Number(s.discrepancy) || 0), 0);

    return {
      totalCount,
      openCount,
      pendingCount,
      totalCountedCash,
      totalDiscrepancy,
    };
  }, [shifts]);

  // Pending shifts for approval
  const pendingApprovalShifts = useMemo(
    () => shifts.filter((s) => s.status === 'SUBMITTED'),
    [shifts]
  );
  const pendingApprovalCount = pendingApprovalShifts.length;

  // If active closing wizard is open
  if (wizardShift) {
    return (
      <ShiftClosingWizard
        shift={wizardShift}
        onBack={() => setWizardShift(null)}
        onSubmitted={() => {
          setWizardShift(null);
          fetchShifts();
        }}
      />
    );
  }

  const canCreate =
    hasPermission('shift.create') ||
    hasPermission('shifts.create') ||
    hasPermission('shifts.view') ||
    true;

  // Status badge helper function (pure Greek uppercase without accents)
  const renderStatusBadge = (status: ShiftStatus | string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
            {toGreekUpper('Εγκεκριμενη')}
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse"></span>
            {toGreekUpper('Εκκρεμει Εγκριση')}
          </span>
        );
      case 'CORRECTION_REQUESTED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5"></span>
            {toGreekUpper('Αιτημα Διορθωσης')}
          </span>
        );
      case 'OPEN':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></span>
            {toGreekUpper('Ανοιχτη')}
          </span>
        );
      case 'DRAFT_CLOSING':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5"></span>
            {toGreekUpper('Προχειρο')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {toGreekUpper(status)}
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
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
            {/* Manager Navigation Tabs */}
            <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200 max-w-full overflow-x-auto">
              <button
                onClick={() => setManagerTab('SHIFTS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  managerTab === 'SHIFTS'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {toGreekUpper('Λιστα Βαρδιων')}
              </button>
              <button
                onClick={() => setManagerTab('DAILY_REPORT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                  managerTab === 'DAILY_REPORT'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{toGreekUpper('Ημερησιο')}</span>
              </button>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setManagerTab('TEMPLATE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
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
              className="px-3.5 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center space-x-2 shadow-2xs transition-all cursor-pointer"
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
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>

            {/* Primary Action Button */}
            {canCreate && (
              <button
                onClick={() => setShowOpeningModal(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{toGreekUpper('Εναρξη Νεας Βαρδιας')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick KPI Strip (Responsive Tablet & Desktop Grid) */}
        {managerTab === 'SHIFTS' && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {toGreekUpper('Συνολο Βαρδιων')}
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg sm:text-xl font-black text-slate-900 font-mono">
                  {metrics.totalCount}
                </span>
                <span className="text-[11px] font-bold text-slate-500">
                  {metrics.openCount} {toGreekUpper('Ανοιχτες')}
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                {toGreekUpper('Προς Εγκριση')}
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg sm:text-xl font-black text-amber-900 font-mono">
                  {metrics.pendingCount}
                </span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-200/70 text-amber-900">
                  {metrics.pendingCount > 0 ? toGreekUpper('Εκκρεμει') : toGreekUpper('Καθαρο')}
                </span>
              </div>
            </div>

            <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                {toGreekUpper('Καταμετρημενο Ταμειο')}
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg sm:text-xl font-black text-indigo-950 font-mono">
                  {metrics.totalCountedCash.toFixed(2)} €
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
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
                  {metrics.totalDiscrepancy > 0 ? '+' : ''}
                  {metrics.totalDiscrepancy.toFixed(2)} €
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {metrics.totalDiscrepancy === 0 ? toGreekUpper('Ισοζυγιο') : toGreekUpper('Διαφορα')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {managerTab === 'TEMPLATE' && isOwnerOrAdmin ? (
        <ShiftTemplateConfigurator />
      ) : managerTab === 'DAILY_REPORT' ? (
        <DailyAggregationView
          shifts={shifts}
          stores={effectiveStores}
          currentStoreId={currentStore?.id || selectedStoreFilter}
          onOpenShiftDetails={(s) => setDetailsShift(s)}
        />
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
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-400 text-slate-950 animate-pulse">
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
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 ${
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

              {/* Quick Tablet Grid Cards of Pending Shifts */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                {pendingApprovalShifts.map((pShift) => (
                  <div
                    key={pShift.id}
                    className="bg-white rounded-xl border border-amber-200 p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wider inline-block mb-1">
                          {pShift.store_name} ({pShift.register_id === 'REG-01' ? 'Ταμείο 1' : pShift.register_id})
                        </span>
                        <h4 className="font-extrabold text-slate-900 text-xs block">
                          {pShift.opened_by_user_name || 'Υπάλληλος'} •{' '}
                          {pShift.shift_type === 'MORNING'
                            ? 'Πρωινή'
                            : pShift.shift_type === 'AFTERNOON'
                            ? 'Απογευματινή'
                            : 'Βραδινή'}
                        </h4>
                        <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
                          {new Date(pShift.closed_at || pShift.opened_at).toLocaleDateString('el-GR')}{' '}
                          {new Date(pShift.closed_at || pShift.opened_at).toLocaleTimeString('el-GR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="text-right shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block font-bold">
                          {toGreekUpper('Αποκλιση')}
                        </span>
                        <span
                          className={`font-black text-xs font-mono ${
                            pShift.discrepancy < 0
                              ? 'text-rose-600'
                              : pShift.discrepancy > 0
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {pShift.discrepancy > 0 ? '+' : ''}
                          {pShift.discrepancy.toFixed(2)} €
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setDetailsShift(pShift)}
                      className="w-full py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{toGreekUpper('Επιθεωρηση & Εγκριση')}</span>
                    </button>
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
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950">
                        {toGreekUpper(activeShift.status)}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-indigo-100 mt-1">
                      {activeShift.store_name} ({activeShift.register_id})
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5 flex items-center space-x-1">
                      <span>Χειριστής: {activeShift.opened_by_user_name || 'Υπάλληλος'}</span>
                      <span>•</span>
                      <span>{new Date(activeShift.opened_at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </p>
                  </div>
                </div>

                {/* Group 2: Key Financials (md:col-span-3) */}
                <div className="md:col-span-3 bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    {toGreekUpper('Αρχικο Ταμειο (Float)')}
                  </span>
                  <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                    {Number(activeShift.opening_cash).toFixed(2)} €
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5">
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
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center space-x-2 shadow-sm transition-all cursor-pointer"
                  >
                    <span>{toGreekUpper('Οδηγος Κλεισιματος')}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {(isOwnerOrAdmin || canApprove) && (
                    <button
                      onClick={() => setShiftToDelete(activeShift)}
                      className="py-2.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer shrink-0"
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

          {/* Grouped Filter, Search & View Controls Bar (Tablet Responsive Grid) */}
          <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              {/* Search Field (sm:col-span-5) */}
              <div className="sm:col-span-5 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Αναζήτηση με χειριστή, κατάστημα, ταμείο..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 font-medium text-xs text-slate-800 bg-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Store & Status Filters (sm:col-span-5) */}
              <div className="sm:col-span-5 grid grid-cols-2 gap-2">
                <select
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

                <select
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

              {/* View Layout Switcher (sm:col-span-2) */}
              <div className="sm:col-span-2 flex items-center justify-end space-x-1 bg-slate-100/90 p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewMode('CARDS')}
                  className={`p-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex-1 flex items-center justify-center space-x-1 ${
                    viewMode === 'CARDS'
                      ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Προβολή Καρτών (Tablet Friendly)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{toGreekUpper('Καρτες')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('TABLE')}
                  className={`p-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex-1 flex items-center justify-center space-x-1 ${
                    viewMode === 'TABLE'
                      ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Προβολή Πίνακα (Desktop Table)"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{toGreekUpper('Πινακας')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Shifts Content: Cards Grid or Data Table */}
          {loading ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs font-medium">Φόρτωση βαρδιών...</p>
            </div>
          ) : filteredShifts.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 space-y-2">
              <Clock className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-700">Δεν βρέθηκαν βάρδιες</p>
              <p className="text-xs text-slate-400">
                {searchQuery
                  ? 'Δεν βρέθηκαν αποτελέσματα με τα κριτήρια αναζήτησης.'
                  : 'Ξεκινήστε μια νέα βάρδια πατώντας το κουμπί "Έναρξη Νέας Βάρδιας".'}
              </p>
            </div>
          ) : viewMode === 'CARDS' ? (
            /* Tablet Responsive Grid Cards */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredShifts.map((s) => (
                <div
                  key={s.id}
                  className={`bg-white rounded-2xl border transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between overflow-hidden ${
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
                        <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wide">
                          {s.store_name}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
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
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {new Date(s.opened_at).toLocaleDateString('el-GR')}{' '}
                        {new Date(s.opened_at).toLocaleTimeString('el-GR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    <div className="shrink-0">{renderStatusBadge(s.status)}</div>
                  </div>

                  {/* Card Body - Cashier & Financial Matrix Group */}
                  <div className="p-4 space-y-3.5 flex-1">
                    {/* Cashier Info */}
                    <div className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-xl">
                      <div className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center text-slate-600 text-[11px] font-bold shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="text-[10px] text-slate-400 block font-bold uppercase">
                          {toGreekUpper('Χειριστης')}
                        </span>
                        <span className="font-bold text-slate-900 truncate block">
                          {s.opened_by_user_name || 'Υπάλληλος'}
                        </span>
                      </div>
                    </div>

                    {/* Financial Matrix (2x2 Grid) */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">
                          {toGreekUpper('Αναμενομενο')}
                        </span>
                        <span className="font-black text-slate-900 font-mono text-sm block mt-0.5">
                          {Number(s.expected_cash || 0).toFixed(2)} €
                        </span>
                      </div>

                      <div className="p-2.5 bg-indigo-50/50 rounded-xl border border-indigo-100/80">
                        <span className="text-[10px] font-bold text-indigo-700 block uppercase">
                          {toGreekUpper('Καταμετρημενο')}
                        </span>
                        <span className="font-black text-indigo-950 font-mono text-sm block mt-0.5">
                          {Number(s.counted_cash || 0).toFixed(2)} €
                        </span>
                      </div>

                      <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 col-span-2 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block uppercase">
                            {toGreekUpper('Αποκλιση Ταμειου')}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            (Καταμέτρηση - Αναμενόμενο)
                          </span>
                        </div>
                        <span
                          className={`font-black text-sm font-mono px-2 py-0.5 rounded-lg ${
                            s.discrepancy < -0.01
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : s.discrepancy > 0.01
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {s.discrepancy > 0 ? '+' : ''}
                          {Number(s.discrepancy || 0).toFixed(2)} €
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Buttons Group (Tablet Touch Targets 42px+) */}
                  <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex items-center gap-2">
                    {['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'].includes(
                      s.status
                    ) && (
                      <button
                        onClick={() => handleOpenWizard(s)}
                        className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1 shadow-2xs"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{toGreekUpper('Κλεισιμο')}</span>
                      </button>
                    )}

                    {s.status === 'SUBMITTED' && canApprove && (
                      <button
                        onClick={() => setDetailsShift(s)}
                        className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center justify-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
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
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Dense Data Table Mode */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">{toGreekUpper('Καταστημα & Ταμειο')}</th>
                      <th className="px-4 py-3">{toGreekUpper('Τυπος / Ημερομηνια')}</th>
                      <th className="px-4 py-3">{toGreekUpper('Χειριστης')}</th>
                      <th className="px-4 py-3">{toGreekUpper('Αναμενομενο / Καταμετρημενο')}</th>
                      <th className="px-4 py-3">{toGreekUpper('Αποκλιση')}</th>
                      <th className="px-4 py-3">{toGreekUpper('Κατασταση')}</th>
                      <th className="px-4 py-3 text-right">{toGreekUpper('Ενεργειες')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {filteredShifts.map((s) => (
                      <tr
                        key={s.id}
                        className={`transition-colors ${
                          s.status === 'SUBMITTED'
                            ? 'bg-amber-50/40 hover:bg-amber-50 border-l-4 border-l-amber-500'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900">{s.store_name}</div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {s.register_id === 'REG-01' ? 'Ταμείο 1' : s.register_id}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-800">
                            {s.shift_type === 'MORNING'
                              ? 'Πρωινή'
                              : s.shift_type === 'AFTERNOON'
                              ? 'Απογευματινή'
                              : 'Βραδινή'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {new Date(s.opened_at).toLocaleDateString('el-GR')}{' '}
                            {new Date(s.opened_at).toLocaleTimeString('el-GR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900">
                            {s.opened_by_user_name || 'Υπάλληλος'}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div>
                            <span className="font-bold text-slate-900">
                              {Number(s.expected_cash || 0).toFixed(2)} €
                            </span>{' '}
                            /{' '}
                            <span className="text-indigo-700 font-bold">
                              {Number(s.counted_cash || 0).toFixed(2)} €
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={`font-black ${
                              s.discrepancy < 0
                                ? 'text-rose-600'
                                : s.discrepancy > 0
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {s.discrepancy > 0 ? '+' : ''}
                            {Number(s.discrepancy || 0).toFixed(2)} €
                          </span>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {renderStatusBadge(s.status)}
                        </td>

                        <td className="px-4 py-3.5 text-right space-x-1.5">
                          {['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'].includes(
                            s.status
                          ) && (
                            <button
                              onClick={() => handleOpenWizard(s)}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors cursor-pointer"
                            >
                              {toGreekUpper('Κλεισιμο')}
                            </button>
                          )}

                          {s.status === 'SUBMITTED' && canApprove && (
                            <button
                              onClick={() => setDetailsShift(s)}
                              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center space-x-1 shadow-2xs transition-all cursor-pointer"
                              title="Επιθεώρηση & Έγκριση"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>{toGreekUpper('Εγκριση')}</span>
                            </button>
                          )}

                          <button
                            onClick={() => setDetailsShift(s)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                          >
                            {toGreekUpper('Προβολη')}
                          </button>

                          {(isOwnerOrAdmin || canApprove) &&
                            ['DRAFT_CLOSING', 'OPEN', 'CORRECTION_REQUESTED', 'REOPENED'].includes(
                              s.status
                            ) && (
                              <button
                                onClick={() => setShiftToDelete(s)}
                                className="px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors cursor-pointer inline-flex items-center space-x-1"
                                title="Διαγραφή Προχείρου Βάρδιας (Μόνο Ιδιοκτήτης / Διαχειριστής)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="hidden xl:inline">{toGreekUpper('Διαγραφη')}</span>
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

      {/* Delete Draft Shift Confirmation Modal */}
      {shiftToDelete && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  Διαγραφή Προχείρου Βάρδιας
                </h4>
                <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">
                  {toGreekUpper('Ενεργεια Ιδιοκτητη / Διαχειριστη')}
                </span>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-3.5 space-y-2 text-xs text-rose-950">
              <p className="font-bold">
                Είστε βέβαιοι ότι θέλετε να διαγράψετε οριστικά αυτό το πρόχειρο βάρδιας;
              </p>
              <div className="bg-white/80 rounded-lg p-2.5 space-y-1 text-[11px] border border-rose-200">
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
              <p className="text-[11px] text-rose-700">
                ⚠️ Τα δεδομένα του προχείρου (καταμετρήσεις, πρόχειρες καταχωρήσεις) θα διαγραφούν οριστικά από τη βάση δεδομένων.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeletingShift}
                onClick={() => setShiftToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                {toGreekUpper('Ακυρωση')}
              </button>
              <button
                type="button"
                disabled={isDeletingShift}
                onClick={() => handleDeleteShift(shiftToDelete)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingShift ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Διαγραφή...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{toGreekUpper('Οριστικη Διαγραφη')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Credit & Debts Directory Modal */}
      <CustomerCreditDirectoryModal
        isOpen={showCreditDirectoryModal}
        onClose={() => setShowCreditDirectoryModal(false)}
        storeId={currentStore?.id || 'store_opap_01'}
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
    </div>
  );
};
