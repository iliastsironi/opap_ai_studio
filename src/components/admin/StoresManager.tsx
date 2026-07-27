import React, { useEffect, useState } from 'react';
import { Store as StoreIcon, Plus, Building2, MapPin, Phone, Clock, Layers, CheckCircle, CreditCard, Smartphone, Trash2, ShieldCheck, Edit3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { Department, Store, StoreType, PosTerminal } from '../../types/index.js';
import { createStoreInFirestore, updateStoreInFirestore } from '../../services/storeService.ts';

export const StoresManager: React.FC = () => {
  const { token, organization, hasPermission } = useAuth();
  const { stores, refreshStores } = useTenant();

  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);

  // New Store Form Modal
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [newStoreCode, setNewStoreCode] = useState('');
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreType, setNewStoreType] = useState<StoreType>('OPAP_AGENCY');
  const [newStoreAddress, setNewStoreAddress] = useState('');
  const [newStorePhone, setNewStorePhone] = useState('');
  const [newStoreHours, setNewStoreHours] = useState('08:00 - 23:30');
  const [addStoreError, setAddStoreError] = useState<string | null>(null);

  // New Department Modal
  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [addDeptError, setAddDeptError] = useState<string | null>(null);

  // New POS Terminal Modal
  const [showAddPosModal, setShowAddPosModal] = useState(false);
  const [posTerminalId, setPosTerminalId] = useState('');
  const [posMerchantId, setPosMerchantId] = useState('');
  const [posSerialNumber, setPosSerialNumber] = useState('');
  const [posProvider, setPosProvider] = useState('Viva Wallet');
  const [posType, setPosType] = useState<PosTerminal['device_type']>('CARD_EFTPOS');
  const [posNotes, setPosNotes] = useState('');
  const [addPosError, setAddPosError] = useState<string | null>(null);

  const handleAddPosTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStore) return;
    setAddPosError(null);

    const newPos: PosTerminal = {
      id: `pos_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      terminal_id: posTerminalId,
      merchant_id: posMerchantId,
      serial_number: posSerialNumber,
      provider: posProvider,
      device_type: posType,
      is_active: true,
      notes: posNotes,
    };

    const currentPosList = selectedStore.pos_terminals || [];
    const updatedPosList = [...currentPosList, newPos];

    try {
      await updateStoreInFirestore(selectedStore.id, {
        pos_terminals: updatedPosList,
      });

      setSelectedStore({ ...selectedStore, pos_terminals: updatedPosList });
      await refreshStores();
      setShowAddPosModal(false);
      setPosTerminalId('');
      setPosMerchantId('');
      setPosSerialNumber('');
      setPosNotes('');
    } catch (err: any) {
      setAddPosError(err.message || 'Αποτυχία προσθήκης τερματικού POS');
    }
  };

  const handleRemovePosTerminal = async (posId: string) => {
    if (!selectedStore) return;
    if (!window.confirm('Είστε βέβαιοι ότι θέλετε να καταργήσετε αυτό το τερματικό POS;')) return;

    const currentPosList = selectedStore.pos_terminals || [];
    const updatedPosList = currentPosList.filter((p) => p.id !== posId);

    try {
      await updateStoreInFirestore(selectedStore.id, {
        pos_terminals: updatedPosList,
      });
      setSelectedStore({ ...selectedStore, pos_terminals: updatedPosList });
      await refreshStores();
    } catch (err: any) {
      alert(err.message || 'Αποτυχία διαγραφής τερματικού POS');
    }
  };

  useEffect(() => {
    if (stores.length > 0 && !selectedStore) {
      handleSelectStore(stores[0]);
    }
  }, [stores]);

  const handleSelectStore = async (st: Store) => {
    setSelectedStore(st);
    setLoadingDepts(true);
    try {
      const res = await fetch(`/api/v1/stores/${st.id}/departments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data);
      } else {
        setDepartments([
          { id: 'd1', store_id: st.id, organization_id: 'org_opap_demo', code: 'OPAP-MAIN', name: 'Κύρια Αίθουσα ΟΠΑΠ', is_active: true, created_at: new Date().toISOString() },
          { id: 'd2', store_id: st.id, organization_id: 'org_opap_demo', code: 'VLT-HALL', name: 'Αίθουσα PLAY/VLTs', is_active: true, created_at: new Date().toISOString() },
        ]);
      }
    } catch (err) {
      setDepartments([
        { id: 'd1', store_id: st.id, organization_id: 'org_opap_demo', code: 'OPAP-MAIN', name: 'Κύρια Αίθουσα ΟΠΑΠ', is_active: true, created_at: new Date().toISOString() },
        { id: 'd2', store_id: st.id, organization_id: 'org_opap_demo', code: 'VLT-HALL', name: 'Αίθουσα PLAY/VLTs', is_active: true, created_at: new Date().toISOString() },
      ]);
    } finally {
      setLoadingDepts(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddStoreError(null);

    try {
      await createStoreInFirestore({
        organization_id: organization?.id || 'org_opap_demo',
        code: newStoreCode,
        name: newStoreName,
        store_type: newStoreType,
        address: newStoreAddress,
        phone: newStorePhone,
        operating_hours: newStoreHours,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      try {
        await fetch('/api/v1/stores', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            code: newStoreCode,
            name: newStoreName,
            store_type: newStoreType,
            address: newStoreAddress,
            phone: newStorePhone,
            operating_hours: newStoreHours,
          }),
        });
      } catch (e) {
        // server endpoint optional
      }

      await refreshStores();
      setShowAddStoreModal(false);
      setNewStoreCode('');
      setNewStoreName('');
      setNewStoreAddress('');
      setNewStorePhone('');
    } catch (err: any) {
      setAddStoreError(err.message || 'Αποτυχία δημιουργίας καταστήματος');
    }
  };


  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStore) return;
    setAddDeptError(null);

    try {
      const res = await fetch(`/api/v1/stores/${selectedStore.id}/departments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: newDeptCode,
          name: newDeptName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Αποτυχία δημιουργίας τμήματος');
      }

      await handleSelectStore(selectedStore);
      setShowAddDeptModal(false);
      setNewDeptCode('');
      setNewDeptName('');
    } catch (err: any) {
      setAddDeptError(err.message);
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
            Ρύθμιση σημείων πώλησης, τύπων λειτουργίας και operational τμημάτων.
          </p>
        </div>

        {hasPermission('store.manage') && (
          <button
            onClick={() => setShowAddStoreModal(true)}
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow-sm transition-all cursor-pointer"
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
              return (
                <button
                  key={st.id}
                  onClick={() => handleSelectStore(st)}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                      {st.code}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Ενεργό
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mt-2">{st.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 truncate">{st.address || 'Χωρίς διεύθυνση'}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Details View */}
        <div className="lg:col-span-2 space-y-6">
          {selectedStore ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center space-x-2 bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-md text-xs font-bold font-mono">
                    <span>{selectedStore.code}</span>
                  </div>
                  <h2 className="text-lg font-extrabold text-slate-900 mt-1">{selectedStore.name}</h2>
                </div>
                <span className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-lg">
                  {selectedStore.store_type}
                </span>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
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
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* POS Terminals & Card Readers Section */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Τερματικά POS & EFTPOS ({selectedStore.pos_terminals?.length || 0})</h3>
                      <p className="text-[11px] text-slate-500">Αριθμοί τερματικών Tora POS, Viva Wallet, Eurobank κ.ά.</p>
                    </div>
                  </div>

                  {hasPermission('store.manage') && (
                    <button
                      onClick={() => setShowAddPosModal(true)}
                      className="inline-flex items-center space-x-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Προσθήκη POS</span>
                    </button>
                  )}
                </div>

                {(!selectedStore.pos_terminals || selectedStore.pos_terminals.length === 0) ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500">
                    Δεν έχουν καταχωρηθεί τερματικά POS για αυτό το κατάστημα.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedStore.pos_terminals.map((pos) => (
                      <div
                        key={pos.id}
                        className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between relative group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                              {pos.provider}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">
                              {pos.device_type}
                            </span>
                          </div>
                          <p className="text-xs font-extrabold font-mono text-slate-900 mt-1">
                            TID: {pos.terminal_id}
                          </p>
                          {pos.merchant_id && (
                            <p className="text-[11px] text-slate-500 font-mono">MID: {pos.merchant_id}</p>
                          )}
                          {pos.serial_number && (
                            <p className="text-[11px] text-slate-500 font-mono">S/N: {pos.serial_number}</p>
                          )}
                          {pos.notes && (
                            <p className="text-[11px] text-slate-400 italic mt-0.5">{pos.notes}</p>
                          )}
                        </div>

                        {hasPermission('store.manage') && (
                          <button
                            onClick={() => handleRemovePosTerminal(pos.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            title="Διαγραφή POS"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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

      {/* Add Store Modal */}
      {showAddStoreModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Δημιουργία Νέου Καταστήματος</h2>

            {addStoreError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold">
                {addStoreError}
              </div>
            )}

            <form onSubmit={handleCreateStore} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Κωδικός Καταστήματος</label>
                <input
                  type="text"
                  value={newStoreCode}
                  onChange={(e) => setNewStoreCode(e.target.value)}
                  placeholder="π.χ. STR-404"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Όνομα Καταστήματος</label>
                <input
                  type="text"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="π.χ. Πρακτορείο ΟΠΑΠ - Χαλάνδρι"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Τύπος Καταστήματος</label>
                <select
                  value={newStoreType}
                  onChange={(e) => setNewStoreType(e.target.value as StoreType)}
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
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Διεύθυνση</label>
                <input
                  type="text"
                  value={newStoreAddress}
                  onChange={(e) => setNewStoreAddress(e.target.value)}
                  placeholder="π.χ. Λεωφ. Πεντέλης 10"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Τηλέφωνο</label>
                <input
                  type="text"
                  value={newStorePhone}
                  onChange={(e) => setNewStorePhone(e.target.value)}
                  placeholder="210 6812345"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddStoreModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm cursor-pointer"
                >
                  Δημιουργία Καταστήματος
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
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Κωδικός Τμήματος</label>
                <input
                  type="text"
                  value={newDeptCode}
                  onChange={(e) => setNewDeptCode(e.target.value)}
                  placeholder="π.χ. PLAY_VLT, FNB, LOTTERY"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Όνομα Τμήματος</label>
                <input
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
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm cursor-pointer"
                >
                  Προσθήκη Τμήματος
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add POS Terminal Modal */}
      {showAddPosModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Προσθήκη Τερματικού POS / EFTPOS</h2>

            {addPosError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold">
                {addPosError}
              </div>
            )}

            <form onSubmit={handleAddPosTerminal} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Πάροχος / Τράπεζα</label>
                <select
                  value={posProvider}
                  onChange={(e) => setPosProvider(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="TORA WALLET">TORA Wallet / ΟΠΑΠ</option>
                  <option value="Viva Wallet">Viva Wallet</option>
                  <option value="Eurobank">Eurobank EFTPOS</option>
                  <option value="National Bank (ΕΤΕ)">National Bank (ΕΤΕ)</option>
                  <option value="Wordline / NBG">Wordline / NBG</option>
                  <option value="Piraeus Bank">Piraeus Bank / myPOS</option>
                  <option value="Other">Άλλος Πάροχος</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Τύπος Συσκευής</label>
                <select
                  value={posType}
                  onChange={(e) => setPosType(e.target.value as PosTerminal['device_type'])}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="CARD_EFTPOS">Τερματικό Καρτών (EFTPOS)</option>
                  <option value="TORA_POS">Tora POS (Πληρωμές Λογαριασμών)</option>
                  <option value="OPAP_TERMINAL">Κεντρικό Τερματικό ΟΠΑΠ</option>
                  <option value="OTHER">Άλλος Εξοπλισμός</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Terminal ID (TID)</label>
                <input
                  type="text"
                  value={posTerminalId}
                  onChange={(e) => setPosTerminalId(e.target.value)}
                  placeholder="π.χ. TID-881920"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Merchant ID (MID)</label>
                  <input
                    type="text"
                    value={posMerchantId}
                    onChange={(e) => setPosMerchantId(e.target.value)}
                    placeholder="MID-00129"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Σειριακός Αριθμός (S/N)</label>
                  <input
                    type="text"
                    value={posSerialNumber}
                    onChange={(e) => setPosSerialNumber(e.target.value)}
                    placeholder="SN-998811"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Σημειώσεις / Θέση</label>
                <input
                  type="text"
                  value={posNotes}
                  onChange={(e) => setPosNotes(e.target.value)}
                  placeholder="π.χ. POS #1 - Ταμείο 1"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddPosModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
                >
                  Προσθήκη POS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
