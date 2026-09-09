import React, { useState, useEffect } from 'react';
import { Gamepad2, RefreshCw, Clock, Plus, Trash2, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchActiveShiftFromFirestore } from '../../services/shiftService.ts';
import {
  fetchVltTerminalsFromFirestore,
  createVltTerminalInFirestore,
  updateVltTerminalInFirestore,
  deleteVltTerminalInFirestore,
  VltTerminalRecord,
} from '../../services/moduleServices.ts';
import { Shift } from '../../types/index.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { pickNum, safeNum } from '../../services/financialCalculator.ts';
import { Modal } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';

const ELEVATED_ROLE_CODES = ['ORG_OWNER', 'PLATFORM_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER', 'ORG_ADMIN'];

export const VltManager: React.FC = () => {
  const { selectedStoreId, stores } = useTenant();
  const { organization, roles, hasPermission } = useAuth();
  const orgId = organization?.id || 'org_opap_demo';
  const canManageTerminals =
    roles?.some((r) => ELEVATED_ROLE_CODES.includes(r.code)) || hasPermission('*');

  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);

  // Terminals - real, persisted rows (manual entry; see moduleServices.ts)
  const [terminals, setTerminals] = useState<VltTerminalRecord[]>([]);
  const [loadingTerminals, setLoadingTerminals] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const TERMINALS_PAGE_SIZE = 20;

  // Add/Edit Terminal Modal
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [editingTerminalId, setEditingTerminalId] = useState<string | null>(null);
  const [terminalFormError, setTerminalFormError] = useState<string | null>(null);
  const [isSavingTerminal, setIsSavingTerminal] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formGameTitle, setFormGameTitle] = useState('');
  const [formStatus, setFormStatus] = useState<'ONLINE' | 'OFFLINE' | 'MAINTENANCE'>('ONLINE');
  const [formMeterIn, setFormMeterIn] = useState('0');
  const [formMeterOut, setFormMeterOut] = useState('0');

  // Delete Terminal Confirmation
  const [terminalToDelete, setTerminalToDelete] = useState<VltTerminalRecord | null>(null);
  const [isDeletingTerminal, setIsDeletingTerminal] = useState(false);

  const targetStoreId = selectedStoreId && selectedStoreId !== 'ALL' ? selectedStoreId : stores[0]?.id;

  const loadTerminals = async () => {
    setLoadingTerminals(true);
    if (!targetStoreId) {
      setTerminals([]);
      setLoadingTerminals(false);
      return;
    }
    try {
      const data = await fetchVltTerminalsFromFirestore(orgId, targetStoreId);
      setTerminals(data);
    } finally {
      setLoadingTerminals(false);
    }
  };

  const openAddTerminalModal = () => {
    setEditingTerminalId(null);
    setFormCode(`PLAY-${String(terminals.length + 1).padStart(3, '0')}`);
    setFormGameTitle('');
    setFormStatus('ONLINE');
    setFormMeterIn('0');
    setFormMeterOut('0');
    setTerminalFormError(null);
    setShowTerminalModal(true);
  };

  const openEditTerminalModal = (t: VltTerminalRecord) => {
    setEditingTerminalId(t.id);
    setFormCode(t.code);
    setFormGameTitle(t.game_title);
    setFormStatus(t.status);
    setFormMeterIn(String(t.meter_in));
    setFormMeterOut(String(t.meter_out));
    setTerminalFormError(null);
    setShowTerminalModal(true);
  };

  const handleSaveTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStoreId) return;
    if (!formCode.trim()) {
      setTerminalFormError('Παρακαλώ εισάγετε κωδικό τερματικού.');
      return;
    }
    setTerminalFormError(null);
    setIsSavingTerminal(true);
    try {
      const payload = {
        code: formCode.trim(),
        game_title: formGameTitle.trim(),
        status: formStatus,
        meter_in: parseFloat(formMeterIn) || 0,
        meter_out: parseFloat(formMeterOut) || 0,
      };
      if (editingTerminalId) {
        await updateVltTerminalInFirestore(editingTerminalId, payload);
      } else {
        await createVltTerminalInFirestore({
          organization_id: orgId,
          store_id: targetStoreId,
          ...payload,
        });
      }
      await loadTerminals();
      setShowTerminalModal(false);
    } catch (err: any) {
      setTerminalFormError(err.message || 'Αποτυχία αποθήκευσης τερματικού.');
    } finally {
      setIsSavingTerminal(false);
    }
  };

  const handleConfirmDeleteTerminal = async () => {
    if (!terminalToDelete) return;
    setIsDeletingTerminal(true);
    try {
      await deleteVltTerminalInFirestore(terminalToDelete.id);
      await loadTerminals();
      setTerminalToDelete(null);
    } finally {
      setIsDeletingTerminal(false);
    }
  };

  useEffect(() => {
    loadTerminals();
  }, [targetStoreId, orgId]);

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
      console.warn('Could not load active shift in VltManager', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveShiftData();
  }, [selectedStoreId, orgId]);

  const terminalsIn = terminals.reduce((sum, t) => sum + t.meter_in, 0);
  const terminalsOut = terminals.reduce((sum, t) => sum + t.meter_out, 0);
  const cashOutAbs =
    activeShift?.vlts_cash_out !== null && activeShift?.vlts_cash_out !== undefined
      ? Math.abs(safeNum(activeShift.vlts_cash_out))
      : undefined;
  const totalIn = activeShift ? pickNum(activeShift.vlts_in, activeShift.vlts_cash_in, terminalsIn) : terminalsIn;
  const totalOut = activeShift ? pickNum(activeShift.vlts_out, cashOutAbs, terminalsOut) : terminalsOut;
  const totalNet = totalIn - totalOut;

  const totalPages = Math.max(1, Math.ceil(terminals.length / TERMINALS_PAGE_SIZE));
  const pageSafe = Math.min(currentPage, totalPages);
  const paginatedTerminals = terminals.slice((pageSafe - 1) * TERMINALS_PAGE_SIZE, pageSafe * TERMINALS_PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-center text-purple-600 shrink-0">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Τερματικά PLAY VLTs</h1>
            <p className="text-xs text-slate-500 mt-1">
              Real-time μέτρηση Meter-In / Meter-Out, καθαρού εσόδου & κατάστασης παιγνιομηχανών PLAY.
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
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-2xl border border-purple-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 font-extrabold text-sm">
              🎰
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">
                Ενεργή Βάρδια: {activeShift.store_name} ({activeShift.shift_type === 'MORNING' ? 'Πρωινή' : 'Απογευματινή'})
              </p>
              <p className="text-micro text-slate-600 mt-0.5">
                Τα παρακάτω ποσά εισροών (Meter-In) και εκροών/payouts (Meter-Out) προέρχονται από την ενεργή βάρδια. Καταχωρούνται στον οδηγό κλεισίματος βάρδιας (βήμα ΟΠΑΠ & VLTs), όχι εδώ.
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
          <span>Δεν υπάρχει ανοιχτή βάρδια αυτή τη στιγμή για το επιλεγμένο κατάστημα.</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Σύνολο Εισπράξεων (Meter In)</p>
          <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{formatCurrency(totalIn)}</h3>
          <p className="text-micro text-slate-400 mt-2">Εισαγωγές χαρτονομισμάτων & TITO στα VLTs</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Σύνολο Πληρωμών (Meter Out)</p>
          <h3 className="text-2xl font-extrabold text-rose-600 mt-1">-{formatCurrency(totalOut)}</h3>
          <p className="text-micro text-slate-400 mt-2">Εκδόσεις TITO & payouts παικτών</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Καθαρό Έσοδο VLTs (Net Revenue)</p>
          <h3 className="text-2xl font-extrabold text-indigo-600 mt-1">{formatCurrency(totalNet)}</h3>
          <p className="text-micro text-slate-400 mt-2">Υπόλοιπο για συμφωνία ταμείου βάρδιας</p>
        </div>
      </div>

      {/* Terminals Grid */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Ανά Τερματικό</h3>
        {canManageTerminals && (
          <button
            onClick={openAddTerminalModal}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-micro font-bold transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Προσθήκη Τερματικού</span>
          </button>
        )}
      </div>

      {loadingTerminals ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
          Φόρτωση τερματικών...
        </div>
      ) : terminals.length === 0 ? (
        <div className="bg-slate-50 p-8 rounded-2xl border border-dashed border-slate-300 text-center">
          <p className="text-xs text-slate-500">Δεν έχουν καταχωρηθεί τερματικά VLT για αυτό το κατάστημα.</p>
          {canManageTerminals && (
            <button
              onClick={openAddTerminalModal}
              className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Προσθήκη Πρώτου Τερματικού</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedTerminals.map((t) => (
            <div key={t.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-micro font-mono text-slate-400 uppercase font-bold">{t.code}</span>
                  <h4 className="font-bold text-slate-900 text-sm">{t.game_title || '—'}</h4>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-micro font-bold px-2 py-0.5 rounded font-mono ${
                      t.status === 'ONLINE'
                        ? 'bg-emerald-100 text-emerald-800'
                        : t.status === 'OFFLINE'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {t.status}
                  </span>
                  {canManageTerminals && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditTerminalModal(t)}
                        aria-label={`Επεξεργασία ${t.code}`}
                        className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setTerminalToDelete(t)}
                        aria-label={`Διαγραφή ${t.code}`}
                        className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 p-2 rounded">
                  <p className="text-micro text-slate-400 font-medium">In</p>
                  <p className="text-xs font-extrabold text-slate-800 font-mono">{formatCurrency(t.meter_in)}</p>
                </div>
                <div className="bg-slate-50 p-2 rounded">
                  <p className="text-micro text-slate-400 font-medium">Out</p>
                  <p className="text-xs font-extrabold text-rose-600 font-mono">{formatCurrency(t.meter_out)}</p>
                </div>
                <div className="bg-indigo-50 p-2 rounded">
                  <p className="text-micro text-indigo-500 font-medium">Net</p>
                  <p className="text-xs font-extrabold text-indigo-700 font-mono">{formatCurrency(t.net_revenue)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {terminals.length > TERMINALS_PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
          <span>
            {(pageSafe - 1) * TERMINALS_PAGE_SIZE + 1}-
            {Math.min(pageSafe * TERMINALS_PAGE_SIZE, terminals.length)} από {terminals.length} τερματικά
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
              aria-label="Προηγούμενη σελίδα"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-700">Σελίδα {pageSafe} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
              aria-label="Επόμενη σελίδα"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Terminal Modal */}
      <Modal
        isOpen={showTerminalModal}
        onClose={() => setShowTerminalModal(false)}
        icon={Gamepad2}
        title={editingTerminalId ? 'Επεξεργασία Τερματικού' : 'Νέο Τερματικό VLT'}
        size="md"
        bodyAsForm
        onSubmit={handleSaveTerminal}
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowTerminalModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={isSavingTerminal}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSavingTerminal ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
          </>
        }
      >
            <div className="space-y-4 text-xs">
              {terminalFormError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-2.5 text-micro font-medium">
                  {terminalFormError}
                </div>
              )}

              <div>
                <label htmlFor="terminal-code" className="block text-slate-700 font-bold mb-1">
                  Κωδικός Τερματικού
                </label>
                <input
                  id="terminal-code"
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="π.χ. PLAY-ATH-001"
                  className="w-full border border-slate-300 rounded-lg p-2.5 font-mono font-bold text-slate-900 text-sm"
                />
              </div>

              <div>
                <label htmlFor="terminal-game" className="block text-slate-700 font-bold mb-1">
                  Τίτλος Παιχνιδιού
                </label>
                <input
                  id="terminal-game"
                  type="text"
                  value={formGameTitle}
                  onChange={(e) => setFormGameTitle(e.target.value)}
                  placeholder="π.χ. Sizzling Hot Deluxe"
                  className="w-full border border-slate-300 rounded-lg p-2.5 font-semibold text-slate-900 text-sm"
                />
              </div>

              <div>
                <label htmlFor="terminal-status" className="block text-slate-700 font-bold mb-1">
                  Κατάσταση
                </label>
                <select
                  id="terminal-status"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as 'ONLINE' | 'OFFLINE' | 'MAINTENANCE')}
                  className="w-full border border-slate-300 rounded-lg p-2.5 font-semibold text-slate-900 text-sm bg-white"
                >
                  <option value="ONLINE">ONLINE</option>
                  <option value="OFFLINE">OFFLINE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="terminal-meter-in" className="block text-slate-700 font-bold mb-1">
                    Meter In (€)
                  </label>
                  <input
                    id="terminal-meter-in"
                    type="number"
                    step="0.01"
                    value={formMeterIn}
                    onChange={(e) => setFormMeterIn(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono font-bold text-slate-900 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="terminal-meter-out" className="block text-slate-700 font-bold mb-1">
                    Meter Out (€)
                  </label>
                  <input
                    id="terminal-meter-out"
                    type="number"
                    step="0.01"
                    value={formMeterOut}
                    onChange={(e) => setFormMeterOut(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono font-bold text-slate-900 text-sm"
                  />
                </div>
              </div>
            </div>
      </Modal>

      {/* Delete Terminal Confirmation */}
      <ConfirmDialog
        isOpen={!!terminalToDelete}
        onCancel={() => setTerminalToDelete(null)}
        onConfirm={handleConfirmDeleteTerminal}
        tone="destructive"
        closeOnBackdropClick={false}
        title="Διαγραφή Τερματικού;"
        message={
          <>
            Θα διαγραφεί οριστικά το τερματικό <span className="font-mono font-bold">{terminalToDelete?.code}</span>
            {terminalToDelete?.game_title ? ` (${terminalToDelete.game_title})` : ''}. Η ενέργεια δεν αναιρείται.
          </>
        }
        confirmLabel="Διαγραφή"
        isLoading={isDeletingTerminal}
        loadingLabel="Διαγραφή..."
      />
    </div>
  );
};
