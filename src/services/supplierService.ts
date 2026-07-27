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
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import { Supplier } from '../types/index.ts';

const SUPPLIERS_COLLECTION = 'suppliers';

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
    await setDoc(doc(db, SUPPLIERS_COLLECTION, newId), newSupplier);
    return newSupplier;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, SUPPLIERS_COLLECTION);
    throw error;
  }
}

export async function updateSupplierInFirestore(supplierId: string, updateData: Partial<Supplier>): Promise<void> {
  try {
    const ref = doc(db, SUPPLIERS_COLLECTION, supplierId);
    await updateDoc(ref, {
      ...updateData,
      updated_at: new Date().toISOString(),
    });
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
