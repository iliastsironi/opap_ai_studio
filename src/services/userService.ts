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
import { User, Role } from '../types/index.ts';
import { SYSTEM_ROLES } from '../lib/rbac.ts';

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

// Re-exported for existing importers - this used to be its own hardcoded
// list with role codes and permission strings that didn't match anything
// else in the app. SYSTEM_ROLES (src/lib/rbac.ts) is now the one canonical
// source, shared with AuthContext and RolesManager.
export const DEMO_ROLES: Role[] = SYSTEM_ROLES;

export async function fetchUsersFromFirestore(orgId: string): Promise<any[]> {
  try {
    const q = query(collection(db, USERS_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    const usersList: any[] = [];
    snap.forEach((d) => usersList.push(d.data()));
    if (usersList.length === 0) {
      if (orgId === 'org_opap_demo') {
        for (const u of INITIAL_DEMO_USERS) {
          await setDoc(doc(db, USERS_COLLECTION, u.id), u);
        }
        return INITIAL_DEMO_USERS;
      }
      return [];
    }
    return usersList;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, USERS_COLLECTION);
    return orgId === 'org_opap_demo' ? INITIAL_DEMO_USERS : [];
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
    await setDoc(doc(db, USERS_COLLECTION, id), cleanFirestoreData(newUser));
    return newUser;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, USERS_COLLECTION);
    throw error;
  }
}

export async function updateUserInFirestore(userId: string, updateData: any): Promise<void> {
  try {
    const ref = doc(db, USERS_COLLECTION, userId);
    await updateDoc(ref, cleanFirestoreData({
      ...updateData,
      updated_at: new Date().toISOString(),
    }));
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
