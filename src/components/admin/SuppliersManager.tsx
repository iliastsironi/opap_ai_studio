import React, { useEffect, useState } from 'react';
import { Truck, Plus, Search, Building2, Phone, Mail, FileText, Edit2, Trash2, CheckCircle2, AlertCircle, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Supplier } from '../../types/index.ts';
import {
  fetchSuppliersFromFirestore,
  createSupplierInFirestore,
  updateSupplierInFirestore,
  deleteSupplierInFirestore,
} from '../../services/supplierService.ts';

const CATEGORY_LABELS: Record<string, string> = {
  OPAP_SERVICES: 'Υπηρεσίες ΟΠΑΠ & Τερματικά',
  BEVERAGES_FNB: 'Αναψυκτικά, Καφέδες & Τρόφιμα (FnB)',
  OFFICE_CONSUMABLES: 'Γραφική Ύλη & Αναλώσιμα',
  IT_EQUIPMENT: 'Εξοπλισμός IT & POS',
  UTILITIES: 'ΔΕΚΟ (Ρεύμα, Νερό, Τηλεφωνία)',
  CLEANING: 'Καθαριότητα & Υγιεινή',
  OTHER: 'Λοιποί Προμηθευτές',
};

export const SuppliersManager: React.FC = () => {
  const { organization, hasPermission } = useAuth();
  const orgId = organization?.id || 'org_opap_demo';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Add Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form Fields
  const [formCode, setFormCode] = useState('');
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formTradeName, setFormTradeName] = useState('');
  const [formVat, setFormVat] = useState('');
  const [formTaxOffice, setFormTaxOffice] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCategory, setFormCategory] = useState<Supplier['category']>('OPAP_SERVICES');
  const [formBalance, setFormBalance] = useState<number>(0);
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await fetchSuppliersFromFirestore(orgId);
      setSuppliers(data);
    } catch (e) {
      console.error('Error loading suppliers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [orgId]);

  const openAddModal = () => {
    setEditingSupplier(null);
    setFormCode(`SUP-${String(suppliers.length + 1).padStart(3, '0')}`);
    setFormCompanyName('');
    setFormTradeName('');
    setFormVat('');
    setFormTaxOffice('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormCategory('OPAP_SERVICES');
    setFormBalance(0);
    setFormNotes('');
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (sup: Supplier) => {
    setEditingSupplier(sup);
    setFormCode(sup.code || '');
    setFormCompanyName(sup.company_name || '');
    setFormTradeName(sup.trade_name || '');
    setFormVat(sup.vat_number || '');
    setFormTaxOffice(sup.tax_office || '');
    setFormPhone(sup.phone || '');
    setFormEmail(sup.email || '');
    setFormAddress(sup.address || '');
    setFormCategory(sup.category || 'OPAP_SERVICES');
    setFormBalance(sup.balance || 0);
    setFormNotes(sup.notes || '');
    setFormError(null);
    setShowAddModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formCompanyName.trim()) {
      setFormError('Παρακαλώ εισάγετε επωνυμία εταιρείας.');
      return;
    }

    try {
      if (editingSupplier) {
        await updateSupplierInFirestore(editingSupplier.id, {
          code: formCode,
          company_name: formCompanyName,
          trade_name: formTradeName,
          vat_number: formVat,
          tax_office: formTaxOffice,
          phone: formPhone,
          email: formEmail,
          address: formAddress,
          category: formCategory,
          balance: Number(formBalance) || 0,
          notes: formNotes,
        });
        setSuccessMsg(`Ο προμηθευτής "${formCompanyName}" ενημερώθηκε επιτυχώς!`);
      } else {
        await createSupplierInFirestore({
          organization_id: orgId,
          code: formCode,
          company_name: formCompanyName,
          trade_name: formTradeName,
          vat_number: formVat,
          tax_office: formTaxOffice,
          phone: formPhone,
          email: formEmail,
          address: formAddress,
          category: formCategory,
          balance: Number(formBalance) || 0,
          notes: formNotes,
          is_active: true,
          created_at: new Date().toISOString(),
        });
        setSuccessMsg(`Ο νέος προμηθευτής "${formCompanyName}" προστέθηκε επιτυχώς!`);
      }

      await loadSuppliers();
      setShowAddModal(false);
    } catch (err: any) {
      setFormError(err.message || 'Αποτυχία αποθήκευσης προμηθευτή');
    }
  };

  const handleDeleteSupplier = async (id: string, name: string) => {
    if (window.confirm(`Είστε βέβαιοι ότι θέλετε να διαγράψετε τον προμηθευτή "${name}";`)) {
      try {
        await deleteSupplierInFirestore(id);
        setSuccessMsg(`Ο προμηθευτής "${name}" διαγράφηκε.`);
        await loadSuppliers();
      } catch (e: any) {
        alert(e.message || 'Αποτυχία διαγραφής');
      }
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const matchesSearch =
      s.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.vat_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.trade_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'ALL' || s.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const totalBalance = filteredSuppliers.reduce((acc, curr) => acc + (curr.balance || 0), 0);

  return (
    <div className="space-y-6">
      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-600" />
            <span>Διαχείριση Προμηθευτών</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Καταχώρηση εταιρειών, στοιχείων ΑΦΜ, υπολοίπων οφειλών & κατηγοριών προμηθειών.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow-xs transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Νέος Προμηθευτής</span>
        </button>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Αναζήτηση με επωνυμία, ΑΦΜ ή κωδικό..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500"
          >
            <option value="ALL">Όλες οι Κατηγορίες ({suppliers.length})</option>
            {Object.entries(CATEGORY_LABELS).map(([catKey, label]) => (
              <option key={catKey} value={catKey}>
                {label}
              </option>
            ))}
          </select>

          <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 font-bold flex items-center gap-1.5 shrink-0">
            <Wallet className="w-3.5 h-3.5 text-amber-600" />
            <span>Συνολικό Υπόλοιπο: €{totalBalance.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Suppliers Table / List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Φόρτωση προμηθευτών...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Δεν βρέθηκαν προμηθευτές.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-4">Κωδικός & Επωνυμία</th>
                  <th className="p-4">Φορολογικά Στοιχεία</th>
                  <th className="p-4">Κατηγορία Προμηθειών</th>
                  <th className="p-4">Επικοινωνία</th>
                  <th className="p-4 text-right">Υπόλοιπο Οφειλής</th>
                  <th className="p-4 text-center">Ενέργειες</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-medium">
                      <div className="flex items-start space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                              {sup.code}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">{sup.company_name}</span>
                          </div>
                          {sup.trade_name && (
                            <p className="text-[11px] text-slate-400 italic mt-0.5">{sup.trade_name}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      {sup.vat_number ? (
                        <p className="font-mono font-bold text-slate-800">ΑΦΜ: {sup.vat_number}</p>
                      ) : (
                        <p className="text-slate-400 font-mono text-[11px]">-</p>
                      )}
                      {sup.tax_office && (
                        <p className="text-[11px] text-slate-400">{sup.tax_office}</p>
                      )}
                    </td>

                    <td className="p-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {CATEGORY_LABELS[sup.category] || sup.category}
                      </span>
                    </td>

                    <td className="p-4 space-y-0.5">
                      {sup.phone && (
                        <p className="flex items-center space-x-1 text-slate-700 font-medium">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{sup.phone}</span>
                        </p>
                      )}
                      {sup.email && (
                        <p className="flex items-center space-x-1 text-slate-500">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{sup.email}</span>
                        </p>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <span
                        className={`font-mono font-extrabold text-sm ${
                          sup.balance > 0 ? 'text-rose-600' : 'text-slate-700'
                        }`}
                      >
                        €{(sup.balance || 0).toFixed(2)}
                      </span>
                    </td>

                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => openEditModal(sup)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Επεξεργασία"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSupplier(sup.id, sup.company_name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Διαγραφή"
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

      {/* Add / Edit Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              {editingSupplier ? 'Επεξεργασία Προμηθευτή' : 'Προσθήκη Νέου Προμηθευτή'}
            </h2>

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSupplier} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Κωδικός</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Κατηγορία</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as Supplier['category'])}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([catKey, label]) => (
                      <option key={catKey} value={catKey}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Επωνυμία Εταιρείας</label>
                <input
                  type="text"
                  value={formCompanyName}
                  onChange={(e) => setFormCompanyName(e.target.value)}
                  placeholder="π.χ. Coca-Cola 3Ε Ελλάδος Α.Β.Ε.Ε."
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Διακριτικός Τίτλος (Προαιρετικό)</label>
                <input
                  type="text"
                  value={formTradeName}
                  onChange={(e) => setFormTradeName(e.target.value)}
                  placeholder="π.χ. Coca Cola 3E"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">ΑΦΜ (Προαιρετικό)</label>
                  <input
                    type="text"
                    value={formVat}
                    onChange={(e) => setFormVat(e.target.value)}
                    placeholder="094012345"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">ΔOΥ (Προαιρετικό)</label>
                  <input
                    type="text"
                    value={formTaxOffice}
                    onChange={(e) => setFormTaxOffice(e.target.value)}
                    placeholder="ΦΑΕ ΑΘΗΝΩΝ"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Τηλέφωνο (Προαιρετικό)</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+30 210 0000000"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Email (Προαιρετικό)</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="supplier@company.gr"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Διεύθυνση (Προαιρετικό)</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Λεωφ. Αθηνών 112, Αθήνα"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Αρχικό Υπόλοιπο Οφειλής (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formBalance}
                  onChange={(e) => setFormBalance(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Σημειώσεις</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="Στοιχεία επικοινωνίας πωλητή, ημέρες παράδοσης..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
                >
                  {editingSupplier ? 'Ενημέρωση' : 'Αποθήκευση'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
