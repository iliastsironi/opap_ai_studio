import React, { useEffect, useState } from 'react';
import { Store as StoreIcon, Plus, Building2, MapPin, Phone, Clock, Layers, CheckCircle, CreditCard, Trash2, Edit3, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Department, Store, StoreType } from '../../types/index.js';
import { createStoreInFirestore, updateStoreInFirestore, deleteStoreFromFirestore, fetchDepartmentsForStore, createDepartmentInFirestore } from '../../services/storeService.ts';

export const StoresManager: React.FC = () => {
  const { token, organization, hasPermission } = useAuth();
  const { stores, refreshStores } = useTenant();

  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [deptsLoadError, setDeptsLoadError] = useState<string | null>(null);
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);
  const [isDeletingStore, setIsDeletingStore] = useState(false);
  const [deleteStoreError, setDeleteStoreError] = useState<string | null>(null);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [isSavingDept, setIsSavingDept] = useState(false);

  // Add / Edit Store Form Modal
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [storeCode, setStoreCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState<StoreType>('OPAP_AGENCY');
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeHours, setStoreHours] = useState('08:00 - 23:30');
  const [storePosCount, setStorePosCount] = useState<number>(2);
  const [storeFormError, setStoreFormError] = useState<string | null>(null);

  // New Department Modal
  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [addDeptError, setAddDeptError] = useState<string | null>(null);

  useEffect(() => {
    if (stores.length > 0 && !selectedStore) {
      handleSelectStore(stores[0]);
    } else if (selectedStore) {
      const updated = stores.find((s) => s.id === selectedStore.id);
      if (updated) {
        setSelectedStore(updated);
      } else if (stores.length > 0) {
        handleSelectStore(stores[0]);
      } else {
        setSelectedStore(null);
      }
    }
  }, [stores]);

  const handleSelectStore = async (st: Store) => {
    setSelectedStore(st);
    setLoadingDepts(true);
    setDeptsLoadError(null);
    try {
      const orgId = organization?.id || 'org_opap_demo';
      const data = await fetchDepartmentsForStore(st.id, orgId);
      setDepartments(data);
    } catch (err) {
      setDepartments([]);
      setDeptsLoadError('Αποτυχία φόρτωσης τμημάτων για αυτό το κατάστημα. Δοκιμάστε ξανά.');
    } finally {
      setLoadingDepts(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingStoreId(null);
    setStoreCode(`STR-0${stores.length + 1}`);
    setStoreName('');
    setStoreType('OPAP_AGENCY');
    setStoreAddress('');
    setStorePhone('');
    setStoreHours('08:00 - 23:30');
    setStorePosCount(2);
    setStoreFormError(null);
    setShowStoreModal(true);
  };

  const handleOpenEditModal = (st: Store, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingStoreId(st.id);
    setStoreCode(st.code || '');
    setStoreName(st.name || '');
    setStoreType(st.store_type || 'OPAP_AGENCY');
    setStoreAddress(st.address || '');
    setStorePhone(st.phone || '');
    setStoreHours(st.operating_hours || '08:00 - 23:30');
    setStorePosCount(st.pos_count ?? st.pos_terminals?.length ?? 2);
    setStoreFormError(null);
    setShowStoreModal(true);
  };

  const handleDeleteStore = (st: Store, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteStoreError(null);
    setStoreToDelete(st);
  };

  const handleConfirmDeleteStore = async () => {
    if (!storeToDelete) return;
    setIsDeletingStore(true);
    setDeleteStoreError(null);
    try {
      await deleteStoreFromFirestore(storeToDelete.id);
      await refreshStores();
      setStoreToDelete(null);
    } catch (err: any) {
      setDeleteStoreError(err.message || 'Αποτυχία διαγραφής καταστήματος');
    } finally {
      setIsDeletingStore(false);
    }
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setStoreFormError(null);
    setIsSavingStore(true);

    try {
      if (editingStoreId) {
        // Edit existing store
        await updateStoreInFirestore(editingStoreId, {
          code: storeCode,
          name: storeName,
          store_type: storeType,
          address: storeAddress,
          phone: storePhone,
          operating_hours: storeHours,
          pos_count: storePosCount,
        });
      } else {
        // Create new store
        await createStoreInFirestore({
          organization_id: organization?.id || 'org_opap_demo',
          code: storeCode,
          name: storeName,
          store_type: storeType,
          address: storeAddress,
          phone: storePhone,
          operating_hours: storeHours,
          pos_count: storePosCount,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      await refreshStores();
      setShowStoreModal(false);
    } catch (err: any) {
      setStoreFormError(err.message || 'Αποτυχία αποθήκευσης καταστήματος');
    } finally {
      setIsSavingStore(false);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStore) return;
    setAddDeptError(null);
    setIsSavingDept(true);

    try {
      const orgId = organization?.id || 'org_opap_demo';
      await createDepartmentInFirestore({
        organization_id: orgId,
        store_id: selectedStore.id,
        code: newDeptCode,
        name: newDeptName,
        is_active: true,
      });

      await handleSelectStore(selectedStore);
      setShowAddDeptModal(false);
      setNewDeptCode('');
      setNewDeptName('');
    } catch (err: any) {
      setAddDeptError(err.message || 'Αποτυχία δημιουργίας τμήματος');
    } finally {
      setIsSavingDept(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Διαχείριση Καταστημάτων & Τμημάτων
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ρύθμιση σημείων πώλησης, τερματικών POS και operational τμημάτων.
          </p>
        </div>

        {hasPermission('store.manage') && (
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Νέο Κατάστημα</span>
          </button>
        )}
      </div>

      {/* Stores Grid & Selected Store Details Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left List of Stores */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Λίστα Καταστημάτων ({stores.length})
          </p>
          <div className="space-y-2">
            {stores.map((st) => {
              const isSelected = selectedStore?.id === st.id;
              const posCount = st.pos_count ?? st.pos_terminals?.length ?? 0;
              return (
                <div
                  key={st.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectStore(st)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectStore(st);
                    }
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer group relative focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                        {st.code}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Ενεργό
                      </span>
                    </div>

                    {hasPermission('store.manage') && (
                      <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100">
                        <button
                          onClick={(e) => handleOpenEditModal(st, e)}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                          title="Επεξεργασία Καταστήματος"
                          aria-label="Επεξεργασία Καταστήματος"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteStore(st, e)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          title="Διαγραφή Καταστήματος"
                          aria-label="Διαγραφή Καταστήματος"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm mt-2">{st.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{st.address || 'Χωρίς διεύθυνση'}</p>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">{st.operating_hours || '08:00 - 23:30'}</span>
                    <span className="font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md">
                      {posCount} POS
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Details View */}
        <div className="lg:col-span-2 space-y-6">
          {selectedStore ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
              <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center space-x-2 bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-md text-xs font-bold font-mono">
                    <span>{selectedStore.code}</span>
                  </div>
                  <h2 className="text-lg font-extrabold text-slate-900 mt-1">{selectedStore.name}</h2>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-lg">
                    {selectedStore.store_type}
                  </span>

                  {hasPermission('store.manage') && (
                    <>
                      <button
                        onClick={() => handleOpenEditModal(selectedStore)}
                        className="inline-flex items-center space-x-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Επεξεργασία</span>
                      </button>

                      <button
                        onClick={() => handleDeleteStore(selectedStore)}
                        className="inline-flex items-center space-x-1.5 text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Διαγραφή</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs text-slate-600">
                <div className="flex items-start space-x-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-500 block">Διεύθυνση</span>
                    <span className="font-medium text-slate-900">{selectedStore.address || '-'}</span>
                  </div>
                </div>

                <div className="flex items-start space-x-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-500 block">Τηλέφωνο</span>
                    <span className="font-medium text-slate-900">{selectedStore.phone || '-'}</span>
                  </div>
                </div>

                <div className="flex items-start space-x-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-500 block">Ωράριο Λειτουργίας</span>
                    <span className="font-medium text-slate-900">{selectedStore.operating_hours || '-'}</span>
                  </div>
                </div>

                <div className="flex items-start space-x-2 bg-indigo-50/60 p-3 rounded-xl border border-indigo-100">
                  <CreditCard className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-indigo-600 block">Πλήθος POS</span>
                    <span className="font-extrabold text-slate-900 text-sm">
                      {selectedStore.pos_count ?? selectedStore.pos_terminals?.length ?? 0} Τερματικά
                    </span>
                  </div>
                </div>
              </div>

              {/* Departments Section */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">Τμήματα Καταστήματος</h3>
                  </div>

                  {hasPermission('department.manage') && (
                    <button
                      onClick={() => setShowAddDeptModal(true)}
                      className="inline-flex items-center space-x-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Προσθήκη Τμήματος</span>
                    </button>
                  )}
                </div>

                {loadingDepts ? (
                  <p className="text-xs text-slate-400">Φόρτωση τμημάτων...</p>
                ) : deptsLoadError ? (
                  <p className="text-xs text-rose-600 font-semibold">{deptsLoadError}</p>
                ) : departments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Δεν έχουν οριστεί τμήματα για αυτό το κατάστημα.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {departments.map((dept) => (
                      <div
                        key={dept.id}
                        className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-xs font-mono font-bold text-indigo-700">{dept.code}</p>
                          <p className="text-xs font-bold text-slate-900 mt-0.5">{dept.name}</p>
                        </div>
                        <CheckCircle aria-hidden="true" className="w-4 h-4 text-emerald-500" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400">
              Επιλέξτε κατάστημα από τη λίστα για προβολή στοιχείων.
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Store Modal */}
      {showStoreModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              {editingStoreId ? 'Επεξεργασία Καταστήματος' : 'Δημιουργία Νέου Καταστήματος'}
            </h2>

            {storeFormError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold">
                {storeFormError}
              </div>
            )}

            <form onSubmit={handleSaveStore} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="store-code" className="block text-xs font-bold text-slate-700 uppercase mb-1">Κωδικός</label>
                  <input
                    id="store-code"
                    type="text"
                    value={storeCode}
                    onChange={(e) => setStoreCode(e.target.value)}
                    placeholder="π.χ. STR-01"
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label htmlFor="store-pos-count" className="block text-xs font-bold text-slate-700 uppercase mb-1">Πλήθος POS</label>
                  <input
                    id="store-pos-count"
                    type="number"
                    min="0"
                    max="50"
                    value={storePosCount}
                    onChange={(e) => setStorePosCount(parseInt(e.target.value) || 0)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="store-name" className="block text-xs font-bold text-slate-700 uppercase mb-1">Όνομα Καταστήματος</label>
                <input
                  id="store-name"
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="π.χ. Πρακτορείο ΟΠΑΠ - Χαλάνδρι"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="store-type" className="block text-xs font-bold text-slate-700 uppercase mb-1">Τύπος Καταστήματος</label>
                <select
                  id="store-type"
                  value={storeType}
                  onChange={(e) => setStoreType(e.target.value as StoreType)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="OPAP_AGENCY">Πρακτορείο ΟΠΑΠ (OPAP Agency)</option>
                  <option value="PLAY_STORE">PLAY OPAP Store (VLTs)</option>
                  <option value="OPAP_FNB">OPAP & FnB Lounge</option>
                  <option value="GAMING_HALL">Gaming Hall</option>
                  <option value="RETAIL">Κατάστημα Λιανικής (Retail)</option>
                </select>
              </div>

              <div>
                <label htmlFor="store-address" className="block text-xs font-bold text-slate-700 uppercase mb-1">Διεύθυνση</label>
                <input
                  id="store-address"
                  type="text"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="π.χ. Λεωφ. Πεντέλης 10"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="store-phone" className="block text-xs font-bold text-slate-700 uppercase mb-1">Τηλέφωνο</label>
                  <input
                    id="store-phone"
                    type="text"
                    value={storePhone}
                    onChange={(e) => setStorePhone(e.target.value)}
                    placeholder="210 6812345"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="store-hours" className="block text-xs font-bold text-slate-700 uppercase mb-1">Ωράριο</label>
                  <input
                    id="store-hours"
                    type="text"
                    value={storeHours}
                    onChange={(e) => setStoreHours(e.target.value)}
                    placeholder="08:00 - 23:30"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowStoreModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={isSavingStore}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingStore ? 'Αποθήκευση...' : editingStoreId ? 'Αποθήκευση Αλλαγών' : 'Δημιουργία Καταστήματος'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      {showAddDeptModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Προσθήκη Νέου Τμήματος</h2>

            {addDeptError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold">
                {addDeptError}
              </div>
            )}

            <form onSubmit={handleCreateDepartment} className="space-y-4">
              <div>
                <label htmlFor="dept-code" className="block text-xs font-bold text-slate-700 uppercase mb-1">Κωδικός Τμήματος</label>
                <input
                  id="dept-code"
                  type="text"
                  value={newDeptCode}
                  onChange={(e) => setNewDeptCode(e.target.value)}
                  placeholder="π.χ. PLAY_VLT, FNB, LOTTERY"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label htmlFor="dept-name" className="block text-xs font-bold text-slate-700 uppercase mb-1">Όνομα Τμήματος</label>
                <input
                  id="dept-name"
                  type="text"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="π.χ. Τμήμα Τερματικών VLT PLAY"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddDeptModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={isSavingDept}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingDept ? 'Προσθήκη...' : 'Προσθήκη Τμήματος'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Store Confirmation Modal */}
      {storeToDelete && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
          onClick={() => setStoreToDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Διαγραφή Καταστήματος</h4>
            </div>
            <p className="text-xs text-slate-600">
              Είστε βέβαιοι ότι θέλετε να διαγράψετε το κατάστημα «{storeToDelete.name}» ({storeToDelete.code});
              Η ενέργεια είναι οριστική και επηρεάζει όλα τα τμήματα και τις καταχωρήσεις που συνδέονται με αυτό.
            </p>
            {deleteStoreError && (
              <p className="text-xs text-rose-600 font-semibold bg-rose-50 p-2.5 rounded-lg">{deleteStoreError}</p>
            )}
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeletingStore}
                onClick={() => setStoreToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                disabled={isDeletingStore}
                onClick={handleConfirmDeleteStore}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingStore ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Διαγραφή...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ναι, Διαγραφή</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
