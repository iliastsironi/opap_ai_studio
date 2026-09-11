import React, { useEffect, useState } from 'react';
import { Calendar, Plus, Edit2, Trash2, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { fetchRosterSchedules, saveRosterSchedule } from '../../services/financialRecordsService.ts';
import { fetchUsersFromFirestore } from '../../services/userService.ts';
import { WeeklyRosterStore } from '../../data/pnlData.ts';
import { SYSTEM_ROLES } from '../../lib/rbac.ts';
import { Modal, ModalActions } from '../ui/Modal.tsx';

type ScheduleRow = WeeklyRosterStore['schedule'][number];
type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const DAY_FIELDS: Array<{ key: DayKey; label: string }> = [
  { key: 'mon', label: 'Δευτέρα' },
  { key: 'tue', label: 'Τρίτη' },
  { key: 'wed', label: 'Τετάρτη' },
  { key: 'thu', label: 'Πέμπτη' },
  { key: 'fri', label: 'Παρασκευή' },
  { key: 'sat', label: 'Σάββατο' },
  { key: 'sun', label: 'Κυριακή' },
];

const SPECIAL_ASSIGNMENT_OPTIONS = ['Ρεπό', 'Άδεια', 'Ασθένεια'];

const emptyRows = (): ScheduleRow[] => [
  { shift: '08:00 - 16:00 (Πρωί)', role: '', mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' },
  { shift: '16:00 - 00:00 (Απόγευμα)', role: '', mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' },
  { shift: 'Ρεπό', role: '', mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' },
];

// Weekly shift roster - split out of ReportsManager so it can be reached by
// roster.view (granted to every role, EMPLOYEE/SHIFT_SUPERVISOR included)
// without also granting reports.view, which would expose P&L/payroll/KPIs.
// Editing stays gated behind roster.manage (Owner + Area/Store Manager only).
export const RosterManager: React.FC = () => {
  const { organization, hasPermission } = useAuth();
  const { stores } = useTenant();
  const orgId = organization?.id || 'org_opap_demo';
  const canManage = hasPermission('roster.manage');

  const [loading, setLoading] = useState(true);
  const [rosterSchedules, setRosterSchedules] = useState<WeeklyRosterStore[]>([]);
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState('');
  const [editingStoreName, setEditingStoreName] = useState('');
  const [editingRows, setEditingRows] = useState<ScheduleRow[]>(emptyRows());

  const load = async () => {
    setLoading(true);
    try {
      const [ros, users] = await Promise.all([
        fetchRosterSchedules(orgId),
        fetchUsersFromFirestore(orgId),
      ]);
      setRosterSchedules(ros || []);
      setTenantUsers(users || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const handleOpenEditor = (existing?: WeeklyRosterStore) => {
    if (!canManage) return;
    if (existing) {
      setEditingStoreId(existing.storeId);
      setEditingStoreName(existing.storeName);
      setEditingRows(
        existing.schedule && existing.schedule.length > 0
          ? JSON.parse(JSON.stringify(existing.schedule))
          : emptyRows()
      );
    } else {
      const firstStore = stores[0];
      setEditingStoreId(firstStore?.id || '');
      setEditingStoreName(firstStore?.name || '');
      setEditingRows(emptyRows());
    }
    setShowModal(true);
  };

  const handleAddRow = () => {
    setEditingRows([
      ...editingRows,
      { shift: 'Νέα Βάρδια (π.χ. 12:00 - 20:00)', role: '', mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' },
    ]);
  };

  const handleRemoveRow = (rowIndex: number) => {
    if (editingRows.length <= 1) return;
    setEditingRows(editingRows.filter((_, idx) => idx !== rowIndex));
  };

  const handleCellChange = (rowIndex: number, field: string, value: string) => {
    const updated = [...editingRows];
    updated[rowIndex] = { ...updated[rowIndex], [field]: value };
    setEditingRows(updated);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setIsSaving(true);
    try {
      await saveRosterSchedule(orgId, { storeId: editingStoreId, storeName: editingStoreName, schedule: editingRows });
      setShowModal(false);
      await load();
    } finally {
      setIsSaving(false);
    }
  };

  const roleName = (code?: string) => (code ? SYSTEM_ROLES.find((r) => r.code === code)?.name || code : null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">Πρόγραμμα Βαρδιών</h1>
            <p className="text-xs text-slate-500">Εβδομαδιαίο πρόγραμμα προσωπικού ανά κατάστημα</p>
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => handleOpenEditor()}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Δημιουργία / Επεξεργασία Προγράμματος</span>
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
        {loading ? (
          <p className="text-xs text-slate-500">Φόρτωση προγράμματος...</p>
        ) : rosterSchedules.length === 0 ? (
          <p className="text-xs text-slate-500">
            {canManage
              ? 'Δεν υπάρχει ακόμα πρόγραμμα βαρδιών. Δημιουργήστε το πρώτο με το κουμπί παραπάνω.'
              : 'Δεν έχει δημιουργηθεί ακόμα πρόγραμμα βαρδιών από τον διαχειριστή.'}
          </p>
        ) : (
          rosterSchedules.map((r, idx) => (
            <div key={r.storeId || idx} className="space-y-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full"></span>
                  <h4 className="font-extrabold text-slate-900 text-xs">Κατάστημα: {r.storeName}</h4>
                </div>
                {canManage && (
                  <button
                    onClick={() => handleOpenEditor(r)}
                    className="px-2.5 py-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Επεξεργασία</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3">Βάρδια / Ωράριο</th>
                      {DAY_FIELDS.map((d) => (
                        <th key={d.key} className="py-2.5 px-3 text-center">{d.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.schedule.map((s, sIdx) => (
                      <tr key={sIdx} className="hover:bg-slate-50/80 transition-colors font-medium">
                        <td className="py-2.5 px-3 font-bold text-slate-800 bg-slate-50/50">
                          <div>{s.shift}</div>
                          {roleName(s.role) && (
                            <div className="text-[10px] font-semibold text-indigo-600 mt-0.5">Ρόλος: {roleName(s.role)}</div>
                          )}
                        </td>
                        {DAY_FIELDS.map((d) => (
                          <td key={d.key} className="py-2.5 px-3 text-center text-slate-700">{s[d.key] || '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && canManage && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          headerStyle="bordered"
          icon={Calendar}
          title="Διαμόρφωση Εβδομαδιαίου Προγράμματος Βαρδιών"
          subtitle="Επιλέξτε εργαζόμενους από το μητρώο χρηστών για κάθε βάρδια & ημέρα της εβδομάδας."
          size="5xl"
          bodyAsForm
          onSubmit={handleSave}
          footer={
            <ModalActions
              onCancel={() => setShowModal(false)}
              saveLabel="Αποθήκευση Προγράμματος"
              isSaving={isSaving}
              savingLabel="Αποθήκευση..."
            />
          }
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label htmlFor="roster-store-select" className="block font-bold text-slate-700 mb-1">Επιλογή Καταστήματος</label>
                <select
                  id="roster-store-select"
                  value={editingStoreId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditingStoreId(val);
                    const matching = stores.find((s) => s.id === val || s.code === val);
                    setEditingStoreName(matching ? matching.name : val);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold"
                >
                  {!editingStoreId && <option value="">— Επιλέξτε κατάστημα —</option>}
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                  ))}
                  {editingStoreId && !stores.some((s) => s.id === editingStoreId) && (
                    <option value={editingStoreId}>{editingStoreName || editingStoreId} (παλιά καταχώρηση)</option>
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="roster-store-name" className="block font-bold text-slate-700 mb-1">Τίτλος / Ετικέτα Καταστήματος</label>
                <input
                  id="roster-store-name"
                  type="text"
                  value={editingStoreName}
                  onChange={(e) => setEditingStoreName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold"
                  placeholder="π.χ. 100343 - Κεντρικό ΟΠΑΠ"
                />
              </div>
            </div>

            <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-900">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>Διαθέσιμο Προσωπικό & Χρήστες Οργανισμού:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tenantUsers.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-indigo-200 text-indigo-800 rounded-lg text-[11px] font-semibold shadow-2xs"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    {u.first_name} {u.last_name} ({u.role_name || u.role_code || 'Staff'})
                  </span>
                ))}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[11px] font-semibold">
                  Ρεπό
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[11px] font-semibold">
                  Άδεια / Ασθένεια
                </span>
              </div>
              <p className="text-[10px] text-indigo-700/80 pt-0.5">Μόνο άτομα από αυτή τη λίστα μπορούν να ανατεθούν σε βάρδια.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-xs">Γραμμές Βαρδιών & Ωραρίων:</h4>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Προσθήκη Γραμμής Βάρδιας</span>
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3 w-44">Βάρδια / Ωράριο</th>
                      <th className="py-2.5 px-2 w-36">Απαιτούμενος Ρόλος</th>
                      {DAY_FIELDS.map((d) => (
                        <th key={d.key} className="py-2.5 px-2 text-center">{d.label}</th>
                      ))}
                      <th className="py-2.5 px-2 text-center w-10">#</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {editingRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.shift}
                            onChange={(e) => handleCellChange(rIdx, 'shift', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800"
                            placeholder="π.χ. 08:00 - 16:00 (Πρωί)"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={row.role || ''}
                            onChange={(e) => handleCellChange(rIdx, 'role', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-800"
                          >
                            <option value="">Οποιοσδήποτε ρόλος</option>
                            {SYSTEM_ROLES.filter((r) => r.code !== 'PLATFORM_ADMIN').map((r) => (
                              <option key={r.code} value={r.code}>{r.name}</option>
                            ))}
                          </select>
                        </td>
                        {DAY_FIELDS.map((d) => {
                          const value = row[d.key];
                          const isKnownValue =
                            !value ||
                            SPECIAL_ASSIGNMENT_OPTIONS.includes(value) ||
                            tenantUsers.some((u) => `${u.first_name} ${u.last_name}` === value);
                          return (
                            <td key={d.key} className="p-1.5">
                              <select
                                value={value}
                                onChange={(e) => handleCellChange(rIdx, d.key, e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-center text-xs font-medium text-slate-800"
                              >
                                <option value="">— Κενό —</option>
                                {tenantUsers.map((u) => {
                                  const fullName = `${u.first_name} ${u.last_name}`;
                                  return <option key={u.id} value={fullName}>{fullName}</option>;
                                })}
                                {SPECIAL_ASSIGNMENT_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                                {!isKnownValue && <option value={value}>{value} (παλιά καταχώρηση)</option>}
                              </select>
                            </td>
                          );
                        })}
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(rIdx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                            title="Διαγραφή γραμμής"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
