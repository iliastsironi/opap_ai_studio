import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Shift, ShiftStatus } from '../../types/index.ts';
import { ShiftOpeningModal } from './ShiftOpeningModal.tsx';
import { ShiftClosingWizard } from './ShiftClosingWizard.tsx';
import { ShiftDetailsModal } from './ShiftDetailsModal.tsx';
import { ShiftTemplateConfigurator } from './ShiftTemplateConfigurator.tsx';
import {
  fetchShiftsFromFirestore,
  subscribeToShifts,
  deleteShiftFromFirestore,
} from '../../services/shiftService.ts';

import { INITIAL_DEMO_STORES } from '../../services/storeService.ts';
import {
  calculateCountedCash,
  calculateExpectedCash,
  calculateDiscrepancy,
  calculateTotalReconciliationCount,
  safeNum,
} from '../../services/financialCalculator.ts';

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
  const [managerTab, setManagerTab] = useState<'SHIFTS' | 'TEMPLATE'>('SHIFTS');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // Modals & Active Wizard
  const [showOpeningModal, setShowOpeningModal] = useState(false);
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

  const canCreate = hasPermission('shift.create') || hasPermission('shifts.create') || hasPermission('shifts.view') || true;

  // Filter list of pending shifts for manager notification
  const pendingApprovalShifts = shifts.filter((s) => s.status === 'SUBMITTED');
  const pendingApprovalCount = pendingApprovalShifts.length;

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Διαχείριση Βαρδιών & Ταμείου</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Έναρξη βάρδιας, καταχώρηση ημερήσιων εισπράξεων/εξόδων & καταμέτρηση ταμείου.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isOwnerOrAdmin && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 max-w-full overflow-x-auto">
              <button
                onClick={() => setManagerTab('SHIFTS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  managerTab === 'SHIFTS'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Λίστα Βαρδιών
              </button>
              <button
                onClick={() => setManagerTab('TEMPLATE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                  managerTab === 'TEMPLATE'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Διαμόρφωση Φόρμας</span>
              </button>
            </div>
          )}

          <button
            onClick={fetchShifts}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
            title="Aνανέωση"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {canCreate && (
            <button
              onClick={() => setShowOpeningModal(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Έναρξη Νέας Βάρδιας</span>
            </button>
          )}
        </div>
      </div>

      {managerTab === 'TEMPLATE' && isOwnerOrAdmin ? (
        <ShiftTemplateConfigurator />
      ) : (
        <>
      {/* Manager Awaiting Approval Notification Banner */}
      {canApprove && pendingApprovalCount > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-orange-500/10 border-2 border-amber-400/50 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Εκκρεμούν {pendingApprovalCount} {pendingApprovalCount === 1 ? 'Βάρδια' : 'Βάρδιες'} για Έγκριση
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 animate-pulse">
                    AWAITING APPROVAL
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Οι παρακάτω βάρδιες υποβλήθηκαν από το προσωπικό και απαιτούν έγκριση & έλεγχο διευθυντή.
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'SUBMITTED' ? 'ALL' : 'SUBMITTED')}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 ${
                selectedStatusFilter === 'SUBMITTED'
                  ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-2xs'
                  : 'bg-white text-slate-800 border-amber-200 hover:bg-amber-50'
              }`}
            >
              {selectedStatusFilter === 'SUBMITTED' ? 'Εμφάνιση Όλων' : `Φιλτράρισμα Εκκρεμοτήτων (${pendingApprovalCount})`}
            </button>
          </div>

          {/* Quick Cards of Pending Shifts */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {pendingApprovalShifts.map((pShift) => (
              <div
                key={pShift.id}
                className="bg-white rounded-xl border border-amber-300 p-3.5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wider inline-block mb-1">
                      {pShift.store_name} ({pShift.register_id === 'REG-01' ? 'Ταμείο 1' : pShift.register_id})
                    </span>
                    <span className="font-extrabold text-slate-900 text-xs block">
                      {pShift.opened_by_user_name || 'Υπάλληλος'} •{' '}
                      {pShift.shift_type === 'MORNING'
                        ? 'Πρωινή'
                        : pShift.shift_type === 'AFTERNOON'
                        ? 'Απογευματινή'
                        : 'Βραδινή'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                      {new Date(pShift.closed_at || pShift.opened_at).toLocaleDateString('el-GR')}{' '}
                      {new Date(pShift.closed_at || pShift.opened_at).toLocaleTimeString('el-GR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-400 block font-bold">Απόκλιση</span>
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
                  className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Επιθεώρηση & Έγκριση</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Shift Prompt Banner */}
      {activeShift && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-md border border-indigo-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-sm text-white">
                  ΕΝΕΡΓΗ ΒΑΡΔΙΑ ΣΕ ΕΞΕΛΙΞΗ
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-slate-950">
                  {activeShift.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {activeShift.store_name} ({activeShift.register_id}) • Αρχικό Ταμείο:{' '}
                <strong>{Number(activeShift.opening_cash).toFixed(2)} €</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleOpenWizard(activeShift)}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all shrink-0 cursor-pointer"
            >
              <span>Οδηγός Κλεισίματος Ταμείου</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            {(isOwnerOrAdmin || canApprove) && (
              <button
                onClick={() => setShiftToDelete(activeShift)}
                className="px-3.5 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center space-x-1.5 transition-all shrink-0 cursor-pointer"
                title="Διαγραφή Προχείρου Βάρδιας (Μόνο Διαχειριστής/Ιδιοκτήτης)"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span className="hidden sm:inline">Διαγραφή Προχείρου</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedStoreFilter}
            onChange={(e) => setSelectedStoreFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 font-medium text-slate-800 bg-white max-w-full"
          >
            <option value="ALL">Όλα τα Καταστήματα</option>
            {effectiveStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 font-medium text-slate-800 bg-white max-w-full"
          >
            <option value="ALL">Όλες οι Καταστάσεις</option>
            <option value="OPEN">Ανοικτές (OPEN)</option>
            <option value="DRAFT_CLOSING">Πρόχειρο (DRAFT)</option>
            <option value="SUBMITTED">Υποβληθείσες (SUBMITTED)</option>
            <option value="APPROVED">Εγκεκριμένες (APPROVED)</option>
            <option value="CORRECTION_REQUESTED">Αίτηση Διόρθωσης</option>
          </select>
        </div>

        <span className="text-slate-400 font-medium">
          Σύνολο: <strong>{shifts.length}</strong> βάρδιες
        </span>
      </div>

      {/* Shifts List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-medium">Φόρτωση βαρδιών...</p>
          </div>
        ) : shifts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Clock className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-700">Δεν βρέθηκαν βάρδιες</p>
            <p className="text-xs text-slate-400">
              Ξεκινήστε μια νέα βάρδια πατώντας το κουμπί "Έναρξη Νέας Βάρδιας".
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Κατάστημα & Ταμείο</th>
                  <th className="px-4 py-3">Τύπος / Ημερομηνία</th>
                  <th className="px-4 py-3">Χρήστης</th>
                  <th className="px-4 py-3">Αναμενόμενο / Καταμετρημένο</th>
                  <th className="px-4 py-3">Απόκλιση</th>
                  <th className="px-4 py-3">Κατάσταση</th>
                  <th className="px-4 py-3 text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {shifts.map((s) => (
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
                          {s.expected_cash.toFixed(2)} €
                        </span>{' '}
                        / <span className="text-indigo-700">{s.counted_cash.toFixed(2)} €</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`font-extrabold ${
                          s.discrepancy < 0
                            ? 'text-rose-600'
                            : s.discrepancy > 0
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {s.discrepancy > 0 ? '+' : ''}
                        {s.discrepancy.toFixed(2)} €
                      </span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          s.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : s.status === 'SUBMITTED'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200/80'
                            : s.status === 'CORRECTION_REQUESTED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                            : s.status === 'OPEN'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {s.status === 'APPROVED'
                          ? 'Εγκεκριμένη'
                          : s.status === 'SUBMITTED'
                          ? 'Εκκρεμεί έγκριση'
                          : s.status === 'CORRECTION_REQUESTED'
                          ? 'Αίτημα διόρθωσης'
                          : s.status === 'OPEN'
                          ? 'Ανοιχτή'
                          : s.status}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right space-x-1.5">
                      {['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'].includes(
                        s.status
                      ) && (
                        <button
                          onClick={() => handleOpenWizard(s)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors cursor-pointer"
                        >
                          Κλείσιμο
                        </button>
                      )}

                      {s.status === 'SUBMITTED' && canApprove && (
                        <button
                          onClick={() => setDetailsShift(s)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center space-x-1 shadow-2xs transition-all cursor-pointer"
                          title="Επιθεώρηση & Έγκριση"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Έγκριση</span>
                        </button>
                      )}

                      <button
                        onClick={() => setDetailsShift(s)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                      >
                        Προβολή
                      </button>

                      {(isOwnerOrAdmin || canApprove) && ['DRAFT_CLOSING', 'OPEN', 'CORRECTION_REQUESTED', 'REOPENED'].includes(s.status) && (
                        <button
                          onClick={() => setShiftToDelete(s)}
                          className="px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors cursor-pointer inline-flex items-center space-x-1"
                          title="Διαγραφή Προχείρου Βάρδιας (Μόνο Ιδιοκτήτης / Διαχειριστής)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden xl:inline">Διαγραφή</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                <h4 className="text-base font-extrabold text-slate-900">Διαγραφή Προχείρου Βάρδιας</h4>
                <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">
                  ΕΝΕΡΓΕΙΑ ΙΔΙΟΚΤΗΤΗ / ΔΙΑΧΕΙΡΙΣΤΗ
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
                Ακύρωση
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
                    <span>Οριστική Διαγραφή</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};

