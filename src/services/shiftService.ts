import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import { Shift, ShiftStatus, ShiftType } from '../types/index.ts';

const COLLECTION_NAME = 'shifts';

export const INITIAL_DEMO_SHIFTS: Shift[] = [
  {
    id: 'shift_demo_101',
    organization_id: 'org_opap_demo',
    store_id: 'store_opap_01',
    store_name: 'OPAP Agency - Κηφισίας',
    register_id: 'Ταμείο 1',
    shift_type: 'MORNING',
    status: 'APPROVED',
    opened_by_user_id: 'usr_owner',
    opened_by_user_name: 'Γιώργος Παπαδόπουλος',
    opened_at: new Date(Date.now() - 24 * 3600 * 1000 * 2).toISOString(),
    closed_by_user_id: 'usr_owner',
    closed_by_user_name: 'Γιώργος Παπαδόπουλος',
    closed_at: new Date(Date.now() - 24 * 3600 * 1000 * 2 + 8 * 3600 * 1000).toISOString(),
    opening_cash: 200,
    opening_operational_notes: 'Ταμείο σε πλήρη τάξη',
    opap_gross_sales: 1850,
    opap_payouts: 420,
    opap_net_sales: 1430,
    vlts_cash_in: 1100,
    vlts_cash_out: 650,
    vlts_net: 450,
    scratch_lotto_sales: 180,
    fnb_sales: 120,
    fnb_cash: 80,
    fnb_card: 40,
    card_payments: 240,
    expenses_paid_cash: 35,
    customer_credit_granted: 0,
    customer_credit_collected: 0,
    bank_deposits: 1000,
    counted_denominations: { '50': 10, '20': 15, '10': 10, '5': 10 },
    counted_cash: 900,
    expected_cash: 900,
    discrepancy: 0,
    discrepancy_percentage: 0,
    discrepancy_threshold: 15,
    is_unbalanced: false,
    employee_notes: 'Ομαλή πρωινή βάρδια χωρίς αποκλίσεις',
    manager_notes: 'Εγκρίθηκε από Διεύθυνση',
    created_at: new Date(Date.now() - 24 * 3600 * 1000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 24 * 3600 * 1000 * 2 + 8 * 3600 * 1000).toISOString(),
  },
  {
    id: 'shift_demo_102',
    organization_id: 'org_opap_demo',
    store_id: 'store_opap_01',
    store_name: 'OPAP Agency - Κηφισίας',
    register_id: 'Ταμείο 1',
    shift_type: 'AFTERNOON',
    status: 'OPEN',
    opened_by_user_id: 'usr_manager',
    opened_by_user_name: 'Δημήτρης Νικολάου',
    opened_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    opening_cash: 200,
    opening_operational_notes: 'Παραλαβή ταμείου με 200€',
    opap_gross_sales: 2100,
    opap_payouts: 580,
    opap_net_sales: 1520,
    vlts_cash_in: 1350,
    vlts_cash_out: 800,
    vlts_net: 550,
    scratch_lotto_sales: 220,
    fnb_sales: 150,
    fnb_cash: 100,
    fnb_card: 50,
    card_payments: 310,
    expenses_paid_cash: 25,
    customer_credit_granted: 0,
    customer_credit_collected: 0,
    bank_deposits: 0,
    counted_denominations: {},
    counted_cash: 0,
    expected_cash: 1205,
    discrepancy: 0,
    discrepancy_percentage: 0,
    discrepancy_threshold: 15,
    is_unbalanced: false,
    employee_notes: 'Ενεργή απογευματινή βάρδια',
    created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  },
];

export async function seedInitialShiftsIfEmpty(orgId: string): Promise<void> {
  if (orgId !== 'org_opap_demo') return;
  try {
    const q = query(collection(db, COLLECTION_NAME), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    if (snap.empty) {
      for (const shift of INITIAL_DEMO_SHIFTS) {
        const ref = doc(db, COLLECTION_NAME, shift.id);
        await setDoc(ref, shift);
      }
    }
  } catch (err) {
    console.error('Error seeding initial shifts to Firestore:', err);
  }
}

export async function fetchShiftsFromFirestore(
  orgId: string,
  storeId?: string,
  status?: string
): Promise<Shift[]> {
  try {
    if (orgId === 'org_opap_demo') {
      await seedInitialShiftsIfEmpty(orgId);
    }

    const shiftsRef = collection(db, COLLECTION_NAME);
    let q = query(shiftsRef, where('organization_id', '==', orgId));

    if (storeId && storeId !== 'ALL') {
      q = query(q, where('store_id', '==', storeId));
    }

    if (status && status !== 'ALL') {
      q = query(q, where('status', '==', status));
    }

    const snapshot = await getDocs(q);
    const shifts: Shift[] = [];
    snapshot.forEach((docSnap) => {
      shifts.push(docSnap.data() as Shift);
    });

    // Sort client side by opened_at descending
    shifts.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
    return shifts;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
    return [];
  }
}

export async function fetchActiveShiftFromFirestore(
  orgId: string,
  storeId: string,
  registerId: string = 'REG-01'
): Promise<Shift | null> {
  try {
    const shiftsRef = collection(db, COLLECTION_NAME);
    const q = query(
      shiftsRef,
      where('organization_id', '==', orgId),
      where('store_id', '==', storeId),
      where('register_id', '==', registerId),
      where('status', 'in', ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'])
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const activeShifts: Shift[] = [];
    snapshot.forEach((docSnap) => activeShifts.push(docSnap.data() as Shift));
    activeShifts.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

    return activeShifts[0] || null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
    return null;
  }
}

export async function fetchLatestShiftForRegister(
  orgId: string,
  storeId: string,
  registerId: string = 'Ταμείο 1'
): Promise<Shift | null> {
  try {
    const shiftsRef = collection(db, COLLECTION_NAME);
    const q = query(
      shiftsRef,
      where('organization_id', '==', orgId),
      where('store_id', '==', storeId)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const matchedShifts: Shift[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Shift;
      if (
        data.register_id === registerId &&
        ['SUBMITTED', 'APPROVED', 'DRAFT_CLOSING', 'OPEN'].includes(data.status)
      ) {
        matchedShifts.push(data);
      }
    });

    if (matchedShifts.length === 0) return null;

    matchedShifts.sort((a, b) => {
      const timeA = new Date(a.closed_at || a.opened_at).getTime();
      const timeB = new Date(b.closed_at || b.opened_at).getTime();
      return timeB - timeA;
    });

    return matchedShifts[0] || null;
  } catch (error) {
    console.warn('Error fetching latest shift for register:', error);
    return null;
  }
}

export async function createShiftInFirestore(shiftData: Omit<Shift, 'id'>): Promise<Shift> {
  try {
    const newId = `shift_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const nowIso = new Date().toISOString();

    const newShift: Shift = {
      ...shiftData,
      id: newId,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const docRef = doc(db, COLLECTION_NAME, newId);
    await setDoc(docRef, newShift);
    return newShift;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
    throw error;
  }
}

export async function updateShiftInFirestore(
  shiftId: string,
  updateData: Partial<Shift>
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, shiftId);
    const payload = {
      ...updateData,
      updated_at: new Date().toISOString(),
    };
    await updateDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${shiftId}`);
    throw error;
  }
}

export function subscribeToShifts(
  orgId: string,
  storeId: string,
  onUpdate: (shifts: Shift[]) => void
) {
  const shiftsRef = collection(db, COLLECTION_NAME);
  let q = query(shiftsRef, where('organization_id', '==', orgId));

  if (storeId && storeId !== 'ALL') {
    q = query(q, where('store_id', '==', storeId));
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const shifts: Shift[] = [];
      snapshot.forEach((docSnap) => shifts.push(docSnap.data() as Shift));
      shifts.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
      onUpdate(shifts);
    },
    (err) => {
      console.error('Firestore Shifts subscription error:', err);
    }
  );
}
