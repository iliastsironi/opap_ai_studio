import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from './firebase.ts';
import { Supplier, SupplierOrder } from '../types/index.ts';

const SUPPLIERS_COLLECTION = 'suppliers';
const SUPPLIER_ORDERS_COLLECTION = 'supplier_orders';

export const INITIAL_DEMO_ORDERS: SupplierOrder[] = [
  {
    id: 'ord_demo_01',
    organization_id: 'org_opap_demo',
    supplier_id: 'sup_coca_cola',
    supplier_name: 'Coca-Cola 3Ε Ελλάδος Α.Β.Ε.Ε.',
    order_number: 'ORD-2026-089',
    order_date: '2026-07-28',
    expected_delivery: '2026-08-01',
    status: 'PENDING',
    total_amount: 320.00,
    items_description: '24x Κιβώτια Coca-Cola 330ml, 10x Κιβώτια Amita Motion 250ml',
    notes: 'Παράδοση πρωινές ώρες (09:00 - 12:00)',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'ord_demo_02',
    organization_id: 'org_opap_demo',
    supplier_id: 'sup_opap_heq',
    supplier_name: 'ΟΠΑΠ Α.Ε. - Κεντρικά',
    order_number: 'ORD-2026-074',
    order_date: '2026-07-20',
    expected_delivery: '2026-07-22',
    status: 'DELIVERED',
    total_amount: 1450.00,
    items_description: '10x Ρολά Θερμικού Χαρτιού Τερματικών, 5x Πακέτα Δελτίων Στοίχημα',
    notes: 'Παραλήφθηκε & πιστοποιήθηκε από υπεύθυνο βάρδιας',
    created_at: new Date(Date.now() - 86400000 * 11).toISOString(),
  },
];

export const INITIAL_DEMO_SUPPLIERS: Supplier[] = [
  {
    id: 'sup_opap_heq',
    organization_id: 'org_opap_demo',
    code: 'SUP-001',
    company_name: 'ΟΠΑΠ Α.Ε. - Κεντρικά',
    trade_name: 'OPAP S.A.',
    vat_number: '090027380',
    tax_office: 'ΦΑΕ ΑΘΗΝΩΝ',
    phone: '+30 210 5798000',
    email: 'contact@opap.gr',
    address: 'Λεωφ. Αθηνών 112, Αθήνα',
    category: 'OPAP_SERVICES',
    balance: 0,
    notes: 'Προμηθευτής τερματικών & παιχνιδιών ΟΠΑΠ',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'sup_coca_cola',
    organization_id: 'org_opap_demo',
    code: 'SUP-002',
    company_name: 'Coca-Cola 3Ε Ελλάδος Α.Β.Ε.Ε.',
    trade_name: 'Coca-Cola 3E',
    vat_number: '094012345',
    tax_office: 'ΦΑΕ ΑΘΗΝΩΝ',
    phone: '+30 210 6381111',
    email: 'orders@coca-cola.gr',
    address: 'Φραγκοκλησιάς 9, Μαρούσι',
    category: 'BEVERAGES_FNB',
    balance: 145.50,
    notes: 'Προμήθεια αναψυκτικών, χυμών & νερού',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'sup_tora_wallet',
    organization_id: 'org_opap_demo',
    code: 'SUP-003',
    company_name: 'Tora Wallet Α.Ε. - Υπηρεσίες Πληρωμών',
    trade_name: 'TORA WALLET',
    vat_number: '997812341',
    tax_office: 'ΔOΥ ΧΑΛΑΝΔΡΙΟΥ',
    phone: '+30 210 6830900',
    email: 'support@torawallet.gr',
    address: 'Λεωφ. Κηφισίας 220, Χαλάνδρι',
    category: 'IT_EQUIPMENT',
    balance: 0,
    notes: 'Συντήρηση & εκκαθάριση Tora POS',
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

export async function fetchSuppliersFromFirestore(orgId: string): Promise<Supplier[]> {
  try {
    const q = query(collection(db, SUPPLIERS_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    const result: Supplier[] = [];
    snap.forEach((d) => result.push(d.data() as Supplier));
    if (result.length === 0) {
      if (orgId === 'org_opap_demo') {
        for (const sup of INITIAL_DEMO_SUPPLIERS) {
          await setDoc(doc(db, SUPPLIERS_COLLECTION, sup.id), sup);
        }
        return INITIAL_DEMO_SUPPLIERS;
      }
      return [];
    }
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, SUPPLIERS_COLLECTION);
    return orgId === 'org_opap_demo' ? INITIAL_DEMO_SUPPLIERS : [];
  }
}

export async function createSupplierInFirestore(supData: Omit<Supplier, 'id'>): Promise<Supplier> {
  try {
    const newId = `sup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    const newSupplier: Supplier = {
      ...supData,
      id: newId,
      created_at: nowIso,
      updated_at: nowIso,
    };
    await setDoc(doc(db, SUPPLIERS_COLLECTION, newId), cleanFirestoreData(newSupplier));
    return newSupplier;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, SUPPLIERS_COLLECTION);
    throw error;
  }
}

export async function updateSupplierInFirestore(supplierId: string, updateData: Partial<Supplier>): Promise<void> {
  try {
    const ref = doc(db, SUPPLIERS_COLLECTION, supplierId);
    await updateDoc(ref, cleanFirestoreData({
      ...updateData,
      updated_at: new Date().toISOString(),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SUPPLIERS_COLLECTION}/${supplierId}`);
    throw error;
  }
}

export async function deleteSupplierInFirestore(supplierId: string): Promise<void> {
  try {
    const ref = doc(db, SUPPLIERS_COLLECTION, supplierId);
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${SUPPLIERS_COLLECTION}/${supplierId}`);
    throw error;
  }
}

export async function fetchSupplierOrdersFromFirestore(orgId: string): Promise<SupplierOrder[]> {
  try {
    const q = query(collection(db, SUPPLIER_ORDERS_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    const result: SupplierOrder[] = [];
    snap.forEach((d) => result.push(d.data() as SupplierOrder));
    if (result.length === 0) {
      if (orgId === 'org_opap_demo') {
        for (const ord of INITIAL_DEMO_ORDERS) {
          await setDoc(doc(db, SUPPLIER_ORDERS_COLLECTION, ord.id), cleanFirestoreData(ord));
        }
        return INITIAL_DEMO_ORDERS;
      }
      return [];
    }
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, SUPPLIER_ORDERS_COLLECTION);
    return orgId === 'org_opap_demo' ? INITIAL_DEMO_ORDERS : [];
  }
}

export async function createSupplierOrderInFirestore(orderData: Omit<SupplierOrder, 'id' | 'created_at'>): Promise<SupplierOrder> {
  try {
    const newId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    const newOrder: SupplierOrder = {
      ...orderData,
      id: newId,
      created_at: nowIso,
    };
    await setDoc(doc(db, SUPPLIER_ORDERS_COLLECTION, newId), cleanFirestoreData(newOrder));
    return newOrder;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, SUPPLIER_ORDERS_COLLECTION);
    throw error;
  }
}

export async function updateSupplierOrderStatusInFirestore(orderId: string, status: SupplierOrder['status']): Promise<void> {
  try {
    const ref = doc(db, SUPPLIER_ORDERS_COLLECTION, orderId);
    await updateDoc(ref, { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SUPPLIER_ORDERS_COLLECTION}/${orderId}`);
    throw error;
  }
}
