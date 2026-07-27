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
import { User, Role } from '../types/index.ts';

const USERS_COLLECTION = 'users';

export const INITIAL_DEMO_USERS: any[] = [
  {
    id: 'usr_admin',
    organization_id: 'org_opap_demo',
    email: 'admin@opap.gr',
    first_name: 'Νικόλαος',
    last_name: 'Παπαδόπουλος',
    phone: '+30 697 1234567',
    is_active: true,
    is_verified: true,
    role_code: 'ORG_ADMIN',
    role_name: 'Διευθυντής / Admin',
    stores: [
      { store_id: 'store_opap_01', store_code: 'STR-01', store_name: 'OPAP Agency - Κηφισίας' },
      { store_id: 'store_play_02', store_code: 'PLAY-02', store_name: 'PLAY Store - Γλυφάδα' },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'usr_shift_leader',
    organization_id: 'org_opap_demo',
    email: 'leader@opap.gr',
    first_name: 'Γεώργιος',
    last_name: 'Αθανασίου',
    phone: '+30 698 2345678',
    is_active: true,
    is_verified: true,
    role_code: 'SHIFT_LEADER',
    role_name: 'Υπεύθυνος Βάρδιας',
    stores: [{ store_id: 'store_opap_01', store_code: 'STR-01', store_name: 'OPAP Agency - Κηφισίας' }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'usr_cashier',
    organization_id: 'org_opap_demo',
    email: 'cashier@opap.gr',
    first_name: 'Μαρία',
    last_name: 'Κωνσταντίνου',
    phone: '+30 699 3456789',
    is_active: true,
    is_verified: true,
    role_code: 'CASHIER',
    role_name: 'Ταμίας / Υπάλληλος',
    stores: [{ store_id: 'store_opap_01', store_code: 'STR-01', store_name: 'OPAP Agency - Κηφισίας' }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const DEMO_ROLES: Role[] = [
  { id: 'r1', code: 'ORG_ADMIN', name: 'Διευθυντής / Admin', permissions: ['*'], is_system: true, created_at: new Date().toISOString() },
  { id: 'r2', code: 'STORE_MANAGER', name: 'Διαχειριστής Καταστήματος', permissions: ['shifts.*', 'stores.view', 'reports.view'], is_system: true, created_at: new Date().toISOString() },
  { id: 'r3', code: 'SHIFT_LEADER', name: 'Υπεύθυνος Βάρδιας', permissions: ['shifts.open', 'shifts.close', 'expenses.create'], is_system: true, created_at: new Date().toISOString() },
  { id: 'r4', code: 'CASHIER', name: 'Ταμίας / Υπάλληλος', permissions: ['shifts.close'], is_system: true, created_at: new Date().toISOString() },
];

export async function fetchUsersFromFirestore(orgId: string): Promise<any[]> {
  try {
    const q = query(collection(db, USERS_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    const usersList: any[] = [];
    snap.forEach((d) => usersList.push(d.data()));
    if (usersList.length === 0) {
      for (const u of INITIAL_DEMO_USERS) {
        await setDoc(doc(db, USERS_COLLECTION, u.id), u);
      }
      return INITIAL_DEMO_USERS;
    }
    return usersList;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, USERS_COLLECTION);
    return INITIAL_DEMO_USERS;
  }
}

export async function createUserInFirestore(userData: any): Promise<any> {
  try {
    const id = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    const newUser = {
      ...userData,
      id,
      created_at: nowIso,
      updated_at: nowIso,
    };
    await setDoc(doc(db, USERS_COLLECTION, id), newUser);
    return newUser;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, USERS_COLLECTION);
    throw error;
  }
}

export async function updateUserInFirestore(userId: string, updateData: any): Promise<void> {
  try {
    const ref = doc(db, USERS_COLLECTION, userId);
    await updateDoc(ref, {
      ...updateData,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${USERS_COLLECTION}/${userId}`);
    throw error;
  }
}

export async function deleteUserInFirestore(userId: string): Promise<void> {
  try {
    const ref = doc(db, USERS_COLLECTION, userId);
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${USERS_COLLECTION}/${userId}`);
    throw error;
  }
}
