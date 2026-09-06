import React, { useEffect, useState } from 'react';
import {
  Truck,
  Plus,
  Search,
  Building2,
  Phone,
  Mail,
  FileText,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Eye,
  ShoppingBag,
  Calendar,
  Clock,
  MapPin,
  Check,
  X,
  Filter,
  DollarSign,
  PackageCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Supplier, SupplierOrder } from '../../types/index.ts';
import {
  fetchSuppliersFromFirestore,
  createSupplierInFirestore,
  updateSupplierInFirestore,
  deleteSupplierInFirestore,
  fetchSupplierOrdersFromFirestore,
  createSupplierOrderInFirestore,
  updateSupplierOrderStatusInFirestore,
} from '../../services/supplierService.ts';
import { formatCurrency } from '../../lib/formatters.ts';

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
  const { organization } = useAuth();
  const orgId = organization?.id || 'org_opap_demo';

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<'suppliers' | 'orders'>('suppliers');

  // Suppliers State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Orders State
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [orderSearchTerm, setOrderSearchTerm] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');

  // Preview Modals State
  const [previewSupplier, setPreviewSupplier] = useState<Supplier | null>(null);
  const [previewOrder, setPreviewOrder] = useState<SupplierOrder | null>(null);

  // Add / Edit Supplier Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Supplier Form Fields
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

  // Add Order Modal State
  const [showOrderModal, setShowOrderModal] = useState<boolean>(false);
  const [orderSupplierId, setOrderSupplierId] = useState<string>('');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [orderExpectedDelivery, setOrderExpectedDelivery] = useState<string>('');
  const [orderAmount, setOrderAmount] = useState<number>(0);
  const [orderItemsDesc, setOrderItemsDesc] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [orderError, setOrderError] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingSupplier, setIsDeletingSupplier] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

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

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const data = await fetchSupplierOrdersFromFirestore(orgId);
      setOrders(data);
    } catch (e) {
      console.error('Error loading supplier orders:', e);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadOrders();
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

  const openNewOrderModal = (preselectedSupplierId?: string) => {
    const targetSupId = preselectedSupplierId || (suppliers[0]?.id || '');
    setOrderSupplierId(targetSupId);
    setOrderNumber(`ORD-2026-${String(orders.length + 101).padStart(3, '0')}`);
    setOrderDate(new Date().toISOString().split('T')[0]);

    const defaultDelivery = new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];
    setOrderExpectedDelivery(defaultDelivery);
    setOrderAmount(0);
    setOrderItemsDesc('');
    setOrderNotes('');
    setOrderError(null);
    setShowOrderModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formCompanyName.trim()) {
      setFormError('Παρακαλώ εισάγετε επωνυμία εταιρείας.');
      return;
    }

    setIsSavingSupplier(true);
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
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError(null);

    const selectedSup = suppliers.find((s) => s.id === orderSupplierId);
    if (!selectedSup) {
      setOrderError('Παρακαλώ επιλέξτε προμηθευτή.');
      return;
    }

    if (!orderItemsDesc.trim()) {
      setOrderError('Παρακαλώ συμπληρώστε την περιγραφή προϊόντων/υπηρεσιών.');
      return;
    }

    setIsSavingOrder(true);
    try {
      await createSupplierOrderInFirestore({
        organization_id: orgId,
        supplier_id: selectedSup.id,
        supplier_name: selectedSup.company_name,
        order_number: orderNumber,
        order_date: orderDate,
        expected_delivery: orderExpectedDelivery,
        status: 'PENDING',
        total_amount: Number(orderAmount) || 0,
        items_description: orderItemsDesc,
        notes: orderNotes,
      });

      setSuccessMsg(`Η παραγγελία "${orderNumber}" καταχωρήθηκε επιτυχώς!`);
      await loadOrders();
      setShowOrderModal(false);
    } catch (err: any) {
      setOrderError(err.message || 'Αποτυχία καταχώρησης παραγγελίας');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: SupplierOrder['status']) => {
    try {
      await updateSupplierOrderStatusInFirestore(orderId, newStatus);
      const statusLabels: Record<string, string> = {
        DELIVERED: 'Παραδόθηκε',
        PENDING: 'Εκκρεμεί',
        CANCELLED: 'Ακυρώθηκε',
      };
      setSuccessMsg(`Η κατάσταση της παραγγελίας ενημερώθηκε σε "${statusLabels[newStatus]}".`);
      await loadOrders();

      if (previewOrder && previewOrder.id === orderId) {
        setPreviewOrder({ ...previewOrder, status: newStatus });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Αποτυχία ενημέρωσης κατάστασης');
    }
  };

  const handleDeleteSupplier = (id: string, name: string) => {
    setSupplierToDelete({ id, name });
  };

  const handleConfirmDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    const { id, name } = supplierToDelete;
    setIsDeletingSupplier(true);
    try {
      await deleteSupplierInFirestore(id);
      setSuccessMsg(`Ο προμηθευτής "${name}" διαγράφηκε.`);
      await loadSuppliers();
      setSupplierToDelete(null);
    } catch (e: any) {
      setErrorMsg(e.message || 'Αποτυχία διαγραφής');
    } finally {
      setIsDeletingSupplier(false);
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

  const filteredOrders = orders.filter((ord) => {
    const matchesSearch =
      ord.order_number.toLowerCase().includes(orderSearchTerm.toLowerCase()) ||
      ord.supplier_name.toLowerCase().includes(orderSearchTerm.toLowerCase()) ||
      (ord.items_description && ord.items_description.toLowerCase().includes(orderSearchTerm.toLowerCase()));

    const matchesStatus = orderStatusFilter === 'ALL' || ord.status === orderStatusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalBalance = filteredSuppliers.reduce((acc, curr) => acc + (curr.balance || 0), 0);
  const pendingOrdersCount = orders.filter((o) => o.status === 'PENDING').length;
  const totalOrdersAmount = orders.reduce((acc, curr) => acc + (curr.total_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-2xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 aria-hidden="true" className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} aria-label="Κλείσιμο" className="text-emerald-700 font-bold hover:opacity-80 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-2xs">
          <div className="flex items-center space-x-2">
            <AlertCircle aria-hidden="true" className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} aria-label="Κλείσιμο" className="text-rose-700 font-bold hover:opacity-80 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header Card with Tabs */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'suppliers'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Προμηθευτές</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                activeTab === 'suppliers' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {suppliers.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'orders'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Παραγγελίες & Τιμολόγια</span>
              {pendingOrdersCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-extrabold whitespace-nowrap">
                  {pendingOrdersCount} εκκρεμείς
                </span>
              )}
            </button>
          </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          {activeTab === 'suppliers' ? (
            <button
              onClick={openAddModal}
              className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs shadow-sm hover:shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Νέος Προμηθευτής</span>
            </button>
          ) : (
            <button
              onClick={() => openNewOrderModal()}
              className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs shadow-sm hover:shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Νέα Παραγγελία</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: SUPPLIERS VIEW */}
      {activeTab === 'suppliers' && (
        <>
          {/* Filter & Summary Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <label htmlFor="suppliers-search" className="sr-only">Αναζήτηση προμηθευτών</label>
              <input
                id="suppliers-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Αναζήτηση με επωνυμία, ΑΦΜ ή κωδικό..."
                className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <label htmlFor="suppliers-category-filter" className="sr-only">Φίλτρο κατηγορίας</label>
              <select
                id="suppliers-category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500 transition-all cursor-pointer"
              >
                <option value="ALL">Όλες οι Κατηγορίες ({suppliers.length})</option>
                {Object.entries(CATEGORY_LABELS).map(([catKey, label]) => (
                  <option key={catKey} value={catKey}>
                    {label}
                  </option>
                ))}
              </select>

              <div className="px-3.5 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-bold flex items-center gap-2 shrink-0">
                <Wallet className="w-4 h-4 text-amber-600" />
                <span>Συνολικό Υπόλοιπο: {formatCurrency(totalBalance)}</span>
              </div>
            </div>
          </div>

          {/* Suppliers Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400 text-xs font-semibold">Φόρτωση προμηθευτών...</div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs font-semibold">Δεν βρέθηκαν προμηθευτές.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                    <tr>
                      <th scope="col" className="p-4">Κωδικός & Επωνυμία</th>
                      <th scope="col" className="p-4">Φορολογικά Στοιχεία</th>
                      <th scope="col" className="p-4">Κατηγορία Προμηθειών</th>
                      <th scope="col" className="p-4">Επικοινωνία</th>
                      <th scope="col" className="p-4 text-right">Υπόλοιπο Οφειλής</th>
                      <th scope="col" className="p-4 text-center">Ενέργειες</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSuppliers.map((sup) => (
                      <tr key={sup.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-medium">
                          <div className="flex items-start space-x-3">
                            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0 shadow-2xs">
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
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{sup.phone}</span>
                            </p>
                          )}
                          {sup.email && (
                            <p className="flex items-center space-x-1 text-slate-500">
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
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
                            {formatCurrency(sup.balance || 0)}
                          </span>
                        </td>

                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => setPreviewSupplier(sup)}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Προεπισκόπηση & Καρτέλα"
                              aria-label="Προεπισκόπηση & Καρτέλα"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openNewOrderModal(sup.id)}
                              className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              title="Νέα Παραγγελία"
                              aria-label="Νέα Παραγγελία"
                            >
                              <ShoppingBag className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEditModal(sup)}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Επεξεργασία"
                              aria-label="Επεξεργασία"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSupplier(sup.id, sup.company_name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Διαγραφή"
                              aria-label="Διαγραφή"
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
        </>
      )}

      {/* TAB 2: ORDERS & INVOICES VIEW */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Order KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Συνολικες Παραγγελιες</p>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">{orders.length}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Εκκρεμεις Παραγγελιες</p>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-amber-600 mt-2">{pendingOrdersCount}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Παραδοθεισες</p>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                  <PackageCheck className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-emerald-600 mt-2">
                {orders.filter((o) => o.status === 'DELIVERED').length}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Συνολικη Αξια (€)</p>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">{formatCurrency(totalOrdersAmount)}</p>
            </div>
          </div>

          {/* Orders Search and Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <label htmlFor="orders-search" className="sr-only">Αναζήτηση παραγγελιών</label>
              <input
                id="orders-search"
                type="text"
                value={orderSearchTerm}
                onChange={(e) => setOrderSearchTerm(e.target.value)}
                placeholder="Αναζήτηση κωδικού παραγγελίας ή προμηθευτή..."
                className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  onClick={() => setOrderStatusFilter('ALL')}
                  className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                    orderStatusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Όλες ({orders.length})
                </button>
                <button
                  onClick={() => setOrderStatusFilter('PENDING')}
                  className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                    orderStatusFilter === 'PENDING' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600 hover:text-amber-600'
                  }`}
                >
                  Εκκρεμείς ({pendingOrdersCount})
                </button>
                <button
                  onClick={() => setOrderStatusFilter('DELIVERED')}
                  className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                    orderStatusFilter === 'DELIVERED' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-emerald-600'
                  }`}
                >
                  Παραδόθηκαν
                </button>
              </div>
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {loadingOrders ? (
              <div className="p-12 text-center text-slate-400 text-xs font-semibold">Φόρτωση παραγγελιών...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs font-semibold">Δεν βρέθηκαν παραγγελίες.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                    <tr>
                      <th scope="col" className="p-4">Κωδικός & Ημερομηνία</th>
                      <th scope="col" className="p-4">Προμηθευτής</th>
                      <th scope="col" className="p-4">Περιγραφή Ειδών</th>
                      <th scope="col" className="p-4">Κατάσταση</th>
                      <th scope="col" className="p-4 text-right">Συνολικό Ποσό</th>
                      <th scope="col" className="p-4 text-center">Ενέργειες</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-medium">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                              {ord.order_number}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{ord.order_date}</span>
                          </p>
                        </td>

                        <td className="p-4 font-bold text-slate-900">
                          {ord.supplier_name}
                        </td>

                        <td className="p-4 max-w-xs">
                          <p className="text-slate-700 line-clamp-2 text-xs">{ord.items_description || '-'}</p>
                          {ord.expected_delivery && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Αναμ. παράδοση: {ord.expected_delivery}
                            </p>
                          )}
                        </td>

                        <td className="p-4">
                          {ord.status === 'DELIVERED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Παραδόθηκε</span>
                            </span>
                          )}
                          {ord.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Εκκρεμεί</span>
                            </span>
                          )}
                          {ord.status === 'CANCELLED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <X className="w-3 h-3 text-rose-600" />
                              <span>Ακυρώθηκε</span>
                            </span>
                          )}
                        </td>

                        <td className="p-4 text-right">
                          <span className="font-mono font-extrabold text-slate-900 text-sm">
                            {formatCurrency(ord.total_amount || 0)}
                          </span>
                        </td>

                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => setPreviewOrder(ord)}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Προεπισκόπηση Παραγγελίας"
                              aria-label="Προεπισκόπηση Παραγγελίας"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {ord.status === 'PENDING' && (
                              <button
                                onClick={() => handleUpdateOrderStatus(ord.id, 'DELIVERED')}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                                title="Σήμανση ως Παραδόθηκε"
                              >
                                Παράδοση
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUPPLIER PREVIEW SLIDE-OVER MODAL */}
      {previewSupplier && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setPreviewSupplier(null)}
              aria-label="Κλείσιμο"
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-start space-x-3 pr-8">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg shrink-0 shadow-2xs">
                <Building2 aria-hidden="true" className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                    {previewSupplier.code}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {CATEGORY_LABELS[previewSupplier.category] || previewSupplier.category}
                  </span>
                </div>
                <h2 className="text-lg font-extrabold text-slate-900 mt-1">{previewSupplier.company_name}</h2>
                {previewSupplier.trade_name && (
                  <p className="text-xs text-slate-500 italic">{previewSupplier.trade_name}</p>
                )}
              </div>
            </div>

            {/* Tax & Contact Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Φορολογικα Στοιχεία</p>
                <p className="font-mono font-bold text-slate-900">ΑΦΜ: {previewSupplier.vat_number || '-'}</p>
                <p className="text-slate-600">ΔΟΥ: {previewSupplier.tax_office || '-'}</p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Στοιχεία Επικοινωνίας</p>
                <p className="text-slate-900 font-medium">{previewSupplier.phone || '-'}</p>
                <p className="text-slate-600 truncate">{previewSupplier.email || '-'}</p>
              </div>
            </div>

            {previewSupplier.address && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center gap-2 text-slate-700">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{previewSupplier.address}</span>
              </div>
            )}

            {/* Financial Balance Banner */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">Υπόλοιπο Οφειλής</p>
                <p className="text-xl font-black text-amber-900 font-mono mt-0.5">
                  {formatCurrency(previewSupplier.balance || 0)}
                </p>
              </div>
              <button
                onClick={() => {
                  setPreviewSupplier(null);
                  openNewOrderModal(previewSupplier.id);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Νέα Παραγγελία</span>
              </button>
            </div>

            {previewSupplier.notes && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Σημειώσεις</p>
                <p className="text-slate-700">{previewSupplier.notes}</p>
              </div>
            )}

            {/* Recent Orders for this Supplier */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                <span>Ιστορικό Παραγγελιών Εταιρείας</span>
              </h3>
              {orders.filter((o) => o.supplier_id === previewSupplier.id).length === 0 ? (
                <p className="text-xs text-slate-400 italic">Δεν υπάρχουν πρόσφατες καταχωρημένες παραγγελίες.</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {orders
                    .filter((o) => o.supplier_id === previewSupplier.id)
                    .map((ord) => (
                      <div
                        key={ord.id}
                        className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-slate-900">{ord.order_number}</span>
                          <span className="text-[11px] text-slate-400 ml-2">({ord.order_date})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-slate-900">{formatCurrency(ord.total_amount)}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              ord.status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ord.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {ord.status === 'DELIVERED' ? 'Παραδόθηκε' : ord.status === 'PENDING' ? 'Εκκρεμεί' : 'Ακυρώθηκε'}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setPreviewSupplier(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Κλείσιμο
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ORDER DETAIL PREVIEW MODAL */}
      {previewOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 relative">
            <button
              onClick={() => setPreviewOrder(null)}
              aria-label="Κλείσιμο"
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShoppingBag aria-hidden="true" className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-extrabold text-slate-900">Δελτίο Παραγγελίας #{previewOrder.order_number}</h2>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Προμηθευτής</p>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{previewOrder.supplier_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Ημερομηνία</p>
                  <p className="font-medium text-slate-800 mt-0.5">{previewOrder.order_date}</p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Περιγραφή Παραγγελίας / Ειδών</p>
                <p className="text-slate-800 leading-relaxed">{previewOrder.items_description}</p>
              </div>

              {previewOrder.notes && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                  <span className="font-bold">Σημειώσεις: </span>
                  <span>{previewOrder.notes}</span>
                </div>
              )}

              <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Συνολική Αξία</p>
                  <p className="text-xl font-black font-mono">{formatCurrency(previewOrder.total_amount)}</p>
                </div>
                <div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      previewOrder.status === 'DELIVERED'
                        ? 'bg-emerald-500 text-white'
                        : previewOrder.status === 'PENDING'
                        ? 'bg-amber-500 text-white'
                        : 'bg-rose-500 text-white'
                    }`}
                  >
                    {previewOrder.status === 'DELIVERED' ? 'Παραδόθηκε' : previewOrder.status === 'PENDING' ? 'Εκκρεμεί' : 'Ακυρώθηκε'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              {previewOrder.status === 'PENDING' && (
                <button
                  onClick={() => handleUpdateOrderStatus(previewOrder.id, 'DELIVERED')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs cursor-pointer"
                >
                  Σήμανση ως Παραδόθηκε
                </button>
              )}
              <button
                onClick={() => setPreviewOrder(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Κλείσιμο
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW ORDER MODAL */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h2 className="text-lg font-extrabold text-slate-900">Καταχώρηση Νέας Παραγγελίας</h2>

            {orderError && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{orderError}</span>
              </div>
            )}

            <form onSubmit={handleSaveOrder} className="space-y-3.5">
              <div>
                <label htmlFor="order-supplier" className="block text-xs font-bold text-slate-700 uppercase mb-1">Προμηθευτής</label>
                <select
                  id="order-supplier"
                  value={orderSupplierId}
                  onChange={(e) => setOrderSupplierId(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-indigo-500"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.company_name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="order-number" className="block text-xs font-bold text-slate-700 uppercase mb-1">Αρ. Παραγγελίας</label>
                  <input
                    id="order-number"
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="order-date" className="block text-xs font-bold text-slate-700 uppercase mb-1">Ημερομηνία</label>
                  <input
                    id="order-date"
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="order-items-desc" className="block text-xs font-bold text-slate-700 uppercase mb-1">Περιγραφή Ειδών / Ποσότητες</label>
                <textarea
                  id="order-items-desc"
                  value={orderItemsDesc}
                  onChange={(e) => setOrderItemsDesc(e.target.value)}
                  rows={3}
                  placeholder="π.χ. 20x Κιβώτια Αναψυκτικά 330ml, 5x Ρολά θερμικού χαρτιού..."
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="order-expected-delivery" className="block text-xs font-bold text-slate-700 uppercase mb-1">Αναμενόμενη Παράδοση</label>
                  <input
                    id="order-expected-delivery"
                    type="date"
                    value={orderExpectedDelivery}
                    onChange={(e) => setOrderExpectedDelivery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="order-amount" className="block text-xs font-bold text-slate-700 uppercase mb-1">Συνολικό Ποσό (€)</label>
                  <input
                    id="order-amount"
                    type="number"
                    step="0.01"
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="order-notes" className="block text-xs font-bold text-slate-700 uppercase mb-1">Σημειώσεις / Οδηγίες Παράδοσης</label>
                <input
                  id="order-notes"
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="π.χ. Παράδοση πρωινές ώρες"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={isSavingOrder}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingOrder ? 'Καταχώρηση...' : 'Καταχώρηση'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT SUPPLIER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              {editingSupplier ? 'Επεξεργασία Προμηθευτή' : 'Προσθήκη Νέου Προμηθευτή'}
            </h2>

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSupplier} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="supplier-code" className="block text-xs font-bold text-slate-700 uppercase mb-1">Κωδικός</label>
                  <input
                    id="supplier-code"
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="supplier-category" className="block text-xs font-bold text-slate-700 uppercase mb-1">Κατηγορία</label>
                  <select
                    id="supplier-category"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as Supplier['category'])}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-indigo-500"
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
                <label htmlFor="supplier-company-name" className="block text-xs font-bold text-slate-700 uppercase mb-1">Επωνυμία Εταιρείας</label>
                <input
                  id="supplier-company-name"
                  type="text"
                  value={formCompanyName}
                  onChange={(e) => setFormCompanyName(e.target.value)}
                  placeholder="π.χ. Coca-Cola 3Ε Ελλάδος Α.Β.Ε.Ε."
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="supplier-trade-name" className="block text-xs font-bold text-slate-700 uppercase mb-1">Διακριτικός Τίτλος (Προαιρετικό)</label>
                <input
                  id="supplier-trade-name"
                  type="text"
                  value={formTradeName}
                  onChange={(e) => setFormTradeName(e.target.value)}
                  placeholder="π.χ. Coca Cola 3E"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="supplier-vat" className="block text-xs font-bold text-slate-700 uppercase mb-1">ΑΦΜ (Προαιρετικό)</label>
                  <input
                    id="supplier-vat"
                    type="text"
                    value={formVat}
                    onChange={(e) => setFormVat(e.target.value)}
                    placeholder="094012345"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="supplier-tax-office" className="block text-xs font-bold text-slate-700 uppercase mb-1">ΔOΥ (Προαιρετικό)</label>
                  <input
                    id="supplier-tax-office"
                    type="text"
                    value={formTaxOffice}
                    onChange={(e) => setFormTaxOffice(e.target.value)}
                    placeholder="ΦΑΕ ΑΘΗΝΩΝ"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="supplier-phone" className="block text-xs font-bold text-slate-700 uppercase mb-1">Τηλέφωνο (Προαιρετικό)</label>
                  <input
                    id="supplier-phone"
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+30 210 0000000"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="supplier-email" className="block text-xs font-bold text-slate-700 uppercase mb-1">Email (Προαιρετικό)</label>
                  <input
                    id="supplier-email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="supplier@company.gr"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="supplier-address" className="block text-xs font-bold text-slate-700 uppercase mb-1">Διεύθυνση (Προαιρετικό)</label>
                <input
                  id="supplier-address"
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Λεωφ. Αθηνών 112, Αθήνα"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="supplier-balance" className="block text-xs font-bold text-slate-700 uppercase mb-1">Αρχικό Υπόλοιπο Οφειλής (€)</label>
                <input
                  id="supplier-balance"
                  type="number"
                  step="0.01"
                  value={formBalance}
                  onChange={(e) => setFormBalance(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="supplier-notes" className="block text-xs font-bold text-slate-700 uppercase mb-1">Σημειώσεις</label>
                <textarea
                  id="supplier-notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="Στοιχεία επικοινωνίας πωλητή, ημέρες παράδοσης..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingSupplier ? 'Αποθήκευση...' : editingSupplier ? 'Ενημέρωση' : 'Αποθήκευση'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Supplier Confirmation Modal */}
      {supplierToDelete && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
          onClick={() => setSupplierToDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Διαγραφή Προμηθευτή</h4>
            </div>
            <p className="text-xs text-slate-600">
              Είστε βέβαιοι ότι θέλετε να διαγράψετε τον προμηθευτή «{supplierToDelete.name}»; Το ιστορικό
              παραγγελιών του θα παραμείνει, αλλά η καρτέλα του θα διαγραφεί οριστικά.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeletingSupplier}
                onClick={() => setSupplierToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                disabled={isDeletingSupplier}
                onClick={handleConfirmDeleteSupplier}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingSupplier ? (
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
