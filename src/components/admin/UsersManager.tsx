import React, { useEffect, useState } from 'react';
import { UserCheck, UserPlus, Shield, Store as StoreIcon, Mail, Phone, CheckCircle2, Send, Edit2, Trash2, UserX, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Role } from '../../types/index.js';
import { fetchUsersFromFirestore, createUserInFirestore, updateUserInFirestore, deleteUserInFirestore, DEMO_ROLES } from '../../services/userService.ts';
import { sendUserInviteEmail } from '../../services/emailService.ts';

export const UsersManager: React.FC = () => {
  const { token, organization, hasPermission } = useAuth();
  const { stores } = useTenant();

  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>(DEMO_ROLES);
  const [loading, setLoading] = useState(true);

  // Invite Modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRoleCode, setInviteRoleCode] = useState('EMPLOYEE');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [successNotification, setSuccessNotification] = useState<string | null>(null);

  // Edit User Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmployeeCode, setEditEmployeeCode] = useState('');
  const [editRoleCode, setEditRoleCode] = useState('EMPLOYEE');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE' | 'PENDING'>('ACTIVE');
  const [editStoreIds, setEditStoreIds] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const openEditModal = (u: any) => {
    setEditingUser(u);
    setEditFirstName(u.first_name || '');
    setEditLastName(u.last_name || '');
    setEditPhone(u.phone || '');
    setEditEmployeeCode(u.employee_code || '');
    setEditRoleCode(u.role_code || 'EMPLOYEE');
    setEditStatus(u.is_active ? 'ACTIVE' : 'INACTIVE');

    const currentStoreIds = u.stores ? u.stores.map((s: any) => s.store_id) : (u.assigned_stores?.map((s: any) => s.store_id) || []);
    setEditStoreIds(currentStoreIds);
    setEditError(null);
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    try {
      const assignedStoresList = stores
        .filter((s) => editStoreIds.includes(s.id))
        .map((s) => ({ store_id: s.id, store_code: s.code, store_name: s.name }));

      const selectedRoleObj = roles.find((r) => r.code === editRoleCode);

      await updateUserInFirestore(editingUser.id, {
        first_name: editFirstName,
        last_name: editLastName,
        phone: editPhone,
        employee_code: editEmployeeCode,
        role_code: editRoleCode,
        role_name: selectedRoleObj?.name || editRoleCode,
        is_active: editStatus === 'ACTIVE',
        status: editStatus,
        stores: assignedStoresList,
        assigned_stores: assignedStoresList,
      });

      setSuccessNotification(`Ο χρήστης ${editFirstName} ${editLastName} ενημερώθηκε επιτυχώς.`);
      setShowEditModal(false);
      await fetchUsers();
    } catch (err: any) {
      setEditError(err.message || 'Αποτυχία ενημέρωσης χρήστη');
    }
  };

  const handleDeleteUser = async (u: any) => {
    if (window.confirm(`Είστε βέβαιοι ότι θέλετε να διαγράψετε τον εργαζόμενο "${u.first_name} ${u.last_name}";`)) {
      try {
        await deleteUserInFirestore(u.id);
        setSuccessNotification(`Ο εργαζόμενος "${u.first_name} ${u.last_name}" διαγράφηκε επιτυχώς.`);
        await fetchUsers();
      } catch (err: any) {
        alert(err.message || 'Αποτυχία διαγραφής εργαζομένου');
      }
    }
  };

  const orgId = organization?.id || 'org_opap_demo';

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const fsUsers = await fetchUsersFromFirestore(orgId);
      setUsers(fsUsers);
      setRoles(DEMO_ROLES);

      if (token) {
        try {
          const [uRes, rRes] = await Promise.all([
            fetch('/api/v1/users', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/v1/users/roles', { headers: { Authorization: `Bearer ${token}` } }),
          ]);

          if (uRes.ok && rRes.ok) {
            const uData = await uRes.json();
            const rData = await rRes.json();
            if (uData && uData.length > 0) setUsers(uData);
            if (rData && rData.length > 0) setRoles(rData);
          }
        } catch (e) {
          // Bypassed API sync
        }
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token, orgId]);

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStoreIds.length === 0) {
      setInviteError('Παρακαλώ επιλέξτε τουλάχιστον ένα κατάστημα πρόσβασης.');
      return;
    }

    setInviteError(null);

    try {
      const assignedStoresList = stores
        .filter((s) => selectedStoreIds.includes(s.id))
        .map((s) => ({ store_id: s.id, store_code: s.code, store_name: s.name }));

      const selectedRoleObj = roles.find((r) => r.code === inviteRoleCode);

      await createUserInFirestore({
        organization_id: orgId,
        email: inviteEmail,
        first_name: inviteFirstName,
        last_name: inviteLastName,
        phone: invitePhone,
        role_code: inviteRoleCode,
        role_name: selectedRoleObj?.name || inviteRoleCode,
        is_active: true,
        is_verified: true,
        stores: assignedStoresList,
      });

      try {
        await fetch('/api/v1/users/invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: inviteEmail,
            first_name: inviteFirstName,
            last_name: inviteLastName,
            phone: invitePhone,
            role_code: inviteRoleCode,
            store_ids: selectedStoreIds,
          }),
        });
      } catch (e) {
        // API fallback
      }

      // Trigger automated invite email
      await sendUserInviteEmail({
        email: inviteEmail,
        first_name: inviteFirstName,
        last_name: inviteLastName,
        role_name: selectedRoleObj?.name || inviteRoleCode,
        store_name: assignedStoresList.map((s) => s.store_name).join(', '),
        organization_name: organization?.trade_name || organization?.legal_name || 'Πρακτορείο ΟΠΑΠ',
      });

      setSuccessNotification(`Η πρόσκληση στάλθηκε επιτυχώς στο ${inviteEmail} με μοναδικό σύνδεσμο εγγραφής!`);

      await fetchUsers();
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteFirstName('');
      setInviteLastName('');
      setInvitePhone('');
      setSelectedStoreIds([]);
    } catch (err: any) {
      setInviteError(err.message || 'Αποτυχία πρόσκλησης χρήστη');
    }
  };

  const toggleStoreSelection = (storeId: string) => {
    if (selectedStoreIds.includes(storeId)) {
      setSelectedStoreIds(selectedStoreIds.filter((id) => id !== storeId));
    } else {
      setSelectedStoreIds([...selectedStoreIds, storeId]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Notification Banner */}
      {successNotification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successNotification}</span>
          </div>
          <button
            onClick={() => setSuccessNotification(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Διαχείριση Χρηστών & Αναθέσεων
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Προσθήκη υπαλλήλων, ορισμός ρόλων και εκχώρηση δικαιωμάτων ανά κατάστημα.
          </p>
        </div>

        {hasPermission('users.manage') && (
          <button
            onClick={() => {
              if (stores.length > 0 && selectedStoreIds.length === 0) {
                setSelectedStoreIds([stores[0].id]);
              }
              setShowInviteModal(true);
            }}
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow-sm transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Πρόσκληση Χρήστη</span>
          </button>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Φόρτωση χρηστών...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Δεν βρέθηκαν χρήστες.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-4">Χρήστης</th>
                  <th className="p-4">Επικοινωνία</th>
                  <th className="p-4">Ρόλος Οργανισμού</th>
                  <th className="p-4">Ανατεθειμένα Καταστήματα</th>
                  <th className="p-4">Κατάσταση</th>
                  <th className="p-4 text-center">Ενέργειες</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-medium">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-xs">
                          {u.first_name?.[0]}
                          {u.last_name?.[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">
                            {u.first_name} {u.last_name}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">{u.employee_code || 'EMP-N/A'}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="space-y-0.5">
                        <p className="flex items-center space-x-1 font-medium text-slate-800">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{u.email}</span>
                        </p>
                        {u.phone && (
                          <p className="flex items-center space-x-1 text-slate-500">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{u.phone}</span>
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {u.roles?.map((r: any) => (
                          <span
                            key={r.id}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                          >
                            <Shield className="w-3 h-3 mr-1" />
                            {r.name}
                          </span>
                        ))}
                        {(!u.roles || u.roles.length === 0) && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Shield className="w-3 h-3 mr-1" />
                            {u.role_name || u.role_code || 'Εργαζόμενος'}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {(u.assigned_stores || u.stores)?.map((as: any, idx: number) => (
                          <span
                            key={as.store_id || idx}
                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700"
                          >
                            <StoreIcon className="w-3 h-3 mr-1 text-slate-400" />
                            {as.store_code || as.store_name}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="p-4">
                      <span
                        className={`inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          u.is_active !== false && u.status !== 'INACTIVE'
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-rose-700 bg-rose-50 border-rose-200'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {u.is_active !== false && u.status !== 'INACTIVE' ? 'Ενεργός' : 'Απενεργοποιημένος'}
                      </span>
                    </td>

                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Επεξεργασία Εργαζομένου"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Διαγραφή Εργαζομένου"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Πρόσκληση Νέου Χρήστη</h2>

            {inviteError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleInviteUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Όνομα</label>
                  <input
                    type="text"
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    placeholder="Γιώργος"
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Επώνυμο</label>
                  <input
                    type="text"
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                    placeholder="Παπαδόπουλος"
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="employee@company.gr"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Τηλέφωνο (Προαιρετικό)</label>
                <input
                  type="text"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  placeholder="+30 697 0000000"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Ρόλος Χρήστη</label>
                <select
                  value={inviteRoleCode}
                  onChange={(e) => setInviteRoleCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.name} - {r.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Ανατεθειμένα Καταστήματα ({selectedStoreIds.length})
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2.5 bg-slate-50">
                  {stores.map((st) => {
                    const isChecked = selectedStoreIds.includes(st.id);
                    return (
                      <label
                        key={st.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-white cursor-pointer text-xs font-medium text-slate-800"
                      >
                        <span>{st.code} - {st.name}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleStoreSelection(st.id)}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm cursor-pointer"
                >
                  Προσθήκη Χρήστη
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Επεξεργασία Στοιχείων Εργαζομένου</h2>

            {editError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold">
                {editError}
              </div>
            )}

            <form onSubmit={handleUpdateUser} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Όνομα</label>
                  <input
                    type="text"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Επώνυμο</label>
                  <input
                    type="text"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Κωδικός Εργαζομένου</label>
                  <input
                    type="text"
                    value={editEmployeeCode}
                    onChange={(e) => setEditEmployeeCode(e.target.value)}
                    placeholder="EMP-001"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Τηλέφωνο</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+30 697 0000000"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Ρόλος Εργαζομένου</label>
                <select
                  value={editRoleCode}
                  onChange={(e) => setEditRoleCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-indigo-500"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.name} - {r.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Κατάσταση Χρήστη</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="ACTIVE">Ενεργός (Active)</option>
                  <option value="INACTIVE">Απενεργοποιημένος (Inactive)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Ανατεθειμένα Καταστήματα ({editStoreIds.length})
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2.5 bg-slate-50">
                  {stores.map((st) => {
                    const isChecked = editStoreIds.includes(st.id);
                    return (
                      <label
                        key={st.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-white cursor-pointer text-xs font-medium text-slate-800"
                      >
                        <span>{st.code} - {st.name}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setEditStoreIds(editStoreIds.filter((id) => id !== st.id));
                            } else {
                              setEditStoreIds([...editStoreIds, st.id]);
                            }
                          }}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
                >
                  Αποθήκευση Αλλαγών
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
