import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../services/firebase.ts';
import { Organization, Role, User, UserStoreAssignment } from '../types/index.ts';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  token: string | null;
  user: User | null;
  organization: Organization | null;
  roles: Role[];
  permissions: string[];
  assignedStores: UserStoreAssignment[];
  isLoading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  login: (token: string, user: User, organization: Organization, roles: Role[], permissions: string[], assignedStores: UserStoreAssignment[]) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_ORG: Organization = {
  id: 'org_opap_demo',
  legal_name: 'ΟΠΑΠ Πρακτορείο Α.Ε.',
  trade_name: 'ShiftLedger OPAP Demo Store',
  vat_number: 'EL998877665',
  tax_office: 'ΔΟΥ Αθηνών',
  address: 'Λεωφ. Κηφισίας 100, Αθήνα',
  phone: '+30 210 1234567',
  email: 'contact@shiftledger.gr',
  timezone: 'Europe/Athens',
  currency: 'EUR',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const EMPLOYEE_PERMISSIONS = [
  'shifts.view',
  'shift.create',
  'expenses.view',
  'suppliers.view',
  'fnb.view',
  'incidents.view',
];

export const MANAGER_PERMISSIONS = [
  'dashboard.view',
  'store.view',
  'users.view',
  'shifts.view',
  'shift.create',
  'shift.approve',
  'shift.reopen',
  'expenses.view',
  'suppliers.view',
  'fnb.view',
  'incidents.view',
  'reports.view',
];

export const OWNER_PERMISSIONS = ['*'];

const DEFAULT_OWNER_ROLE: Role = {
  id: 'role_owner',
  code: 'ORG_OWNER',
  name: 'Ιδιοκτήτης (Owner)',
  description: 'Πλήρη δικαιώματα διαχείρισης οργανισμού και καταστημάτων',
  is_system: true,
  created_at: new Date().toISOString(),
};

const DEFAULT_MANAGER_ROLE: Role = {
  id: 'role_manager',
  code: 'STORE_MANAGER',
  name: 'Διευθυντής Καταστήματος',
  description: 'Διαχείριση βαρδιών, ταμείων & αναφορών καταστήματος',
  is_system: true,
  created_at: new Date().toISOString(),
};

const DEFAULT_EMPLOYEE_ROLE: Role = {
  id: 'role_employee',
  code: 'EMPLOYEE',
  name: 'Υπάλληλος Βάρδιας',
  description: 'Άνοιγμα & κλείσιμο βαρδιών, καταχώρηση εσόδων/εξόδων',
  is_system: true,
  created_at: new Date().toISOString(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('shiftledger_token'));
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(DEFAULT_ORG);
  const [roles, setRoles] = useState<Role[]>([DEFAULT_OWNER_ROLE]);
  const [permissions, setPermissions] = useState<string[]>(['*']);
  const [assignedStores, setAssignedStores] = useState<UserStoreAssignment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync profile when Firebase User changes
  const syncUserProfile = async (fbUser: FirebaseUser) => {
    try {
      const idToken = await fbUser.getIdToken();
      setToken(idToken);
      localStorage.setItem('shiftledger_token', idToken);

      // Check if user exists in Firestore
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);

      let activeRole = DEFAULT_OWNER_ROLE;
      let activePerms = OWNER_PERMISSIONS;

      let detectedRoleCode = '';
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (uData.role_code) {
          detectedRoleCode = uData.role_code;
        }
      }

      if (!detectedRoleCode) {
        if (fbUser.email?.includes('employee') || fbUser.email?.includes('cashier')) {
          detectedRoleCode = 'EMPLOYEE';
        } else if (fbUser.email?.includes('manager') || fbUser.email?.includes('leader')) {
          detectedRoleCode = 'STORE_MANAGER';
        } else {
          detectedRoleCode = 'ORG_OWNER';
        }
      }

      if (detectedRoleCode === 'EMPLOYEE' || detectedRoleCode === 'CASHIER' || detectedRoleCode === 'SHIFT_OPERATOR') {
        activeRole = DEFAULT_EMPLOYEE_ROLE;
        activePerms = EMPLOYEE_PERMISSIONS;
      } else if (detectedRoleCode === 'STORE_MANAGER' || detectedRoleCode === 'SHIFT_SUPERVISOR' || detectedRoleCode === 'SHIFT_LEADER' || detectedRoleCode === 'AREA_MANAGER') {
        activeRole = DEFAULT_MANAGER_ROLE;
        activePerms = MANAGER_PERMISSIONS;
      } else {
        activeRole = DEFAULT_OWNER_ROLE;
        activePerms = OWNER_PERMISSIONS;
      }

      // Check if user is a demo account
      const isDemoUser = fbUser.email && (
        fbUser.email.includes('shiftledger.gr') ||
        fbUser.email.includes('opap.gr') ||
        fbUser.email === 'owner@shiftledger.gr' ||
        fbUser.email === 'manager@shiftledger.gr' ||
        fbUser.email === 'employee@shiftledger.gr'
      );

      let activeOrg = DEFAULT_ORG;

      if (userSnap.exists()) {
        const uData = userSnap.data();
        const userOrgId = uData.organization_id || (isDemoUser ? 'org_opap_demo' : `org_${fbUser.uid}`);

        setUser({
          id: fbUser.uid,
          email: fbUser.email || uData.email || '',
          first_name: uData.first_name || fbUser.displayName?.split(' ')[0] || 'Χρήστης',
          last_name: uData.last_name || fbUser.displayName?.split(' ').slice(1).join(' ') || 'ShiftLedger',
          status: 'ACTIVE',
          created_at: uData.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (userOrgId !== 'org_opap_demo') {
          try {
            const orgSnap = await getDoc(doc(db, 'organizations', userOrgId));
            if (orgSnap.exists()) {
              activeOrg = orgSnap.data() as Organization;
            } else {
              activeOrg = {
                id: userOrgId,
                legal_name: `${uData.first_name || 'Χρήστης'} ${uData.last_name || 'ShiftLedger'}`,
                trade_name: `Πρακτορείο ${uData.first_name || 'ΟΠΑΠ'}`,
                vat_number: '',
                tax_office: '',
                address: '',
                phone: '',
                email: fbUser.email || '',
                timezone: 'Europe/Athens',
                currency: 'EUR',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              await setDoc(doc(db, 'organizations', userOrgId), activeOrg);
            }
          } catch (orgErr) {
            console.warn('Error fetching custom org:', orgErr);
          }
        }
      } else {
        const nameParts = fbUser.displayName ? fbUser.displayName.split(' ') : ['Χρήστης', 'ShiftLedger'];
        const firstName = nameParts[0] || 'Χρήστης';
        const lastName = nameParts.slice(1).join(' ') || 'ShiftLedger';
        const newOrgId = isDemoUser ? 'org_opap_demo' : `org_${fbUser.uid}`;

        const newUserObj: User = {
          id: fbUser.uid,
          email: fbUser.email || '',
          first_name: firstName,
          last_name: lastName,
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (!isDemoUser) {
          activeOrg = {
            id: newOrgId,
            legal_name: `${firstName} ${lastName}`,
            trade_name: `Πρακτορείο ${firstName}`,
            vat_number: '',
            tax_office: '',
            address: '',
            phone: '',
            email: fbUser.email || '',
            timezone: 'Europe/Athens',
            currency: 'EUR',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await setDoc(doc(db, 'organizations', newOrgId), activeOrg);
        }

        // Write user profile to Firestore
        await setDoc(userRef, {
          id: newUserObj.id,
          email: newUserObj.email,
          first_name: newUserObj.first_name,
          last_name: newUserObj.last_name,
          organization_id: newOrgId,
          status: 'ACTIVE',
          created_at: newUserObj.created_at,
          updated_at: newUserObj.updated_at,
        });

        setUser(newUserObj);
      }

      setRoles([activeRole]);
      setOrganization(activeOrg);
      setPermissions(activePerms);
    } catch (err) {
      console.error('Error syncing user profile with Firebase:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setIsLoading(true);
      if (fbUser) {
        setFirebaseUser(fbUser);
        await syncUserProfile(fbUser);
      } else {
        setFirebaseUser(null);
        // Fallback to demo token if exists from local storage login without Firebase
        const storedToken = localStorage.getItem('shiftledger_token');
        if (storedToken && !storedToken.startsWith('eyJ') && storedToken.length < 50) {
          // Demo fallback
          setToken(storedToken);
          setUser({
            id: 'usr_owner',
            email: 'owner@shiftledger.gr',
            first_name: 'Γιώργος',
            last_name: 'Παπαδόπουλος',
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } else {
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed' || err.message?.includes('operation-not-allowed')) {
        // Fallback login when Email/Password provider is not enabled in Firebase Auth Console
        const fakeUid = `usr_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const nameParts = email.split('@')[0].split('.');
        const firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'Χρήστης';
        const lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : 'ShiftLedger';
        
        const fallbackUser: User = {
          id: fakeUid,
          email,
          first_name: firstName,
          last_name: lastName,
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        try {
          await setDoc(doc(db, 'users', fakeUid), {
            id: fakeUid,
            email,
            first_name: firstName,
            last_name: lastName,
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('Firestore setDoc fallback error:', e);
        }

        login(
          `token_${fakeUid}_${Date.now()}`,
          fallbackUser,
          DEFAULT_ORG,
          [DEFAULT_OWNER_ROLE],
          ['*'],
          []
        );
        return;
      }

      // If user not found in demo environment, auto create user in Firebase Auth
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        const nameParts = email.split('@')[0].split('.');
        const firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'Χρήστης';
        const lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : 'ShiftLedger';
        
        try {
          await createUserWithEmailAndPassword(auth, email, pass);
          return;
        } catch (createErr: any) {
          if (createErr.code === 'auth/operation-not-allowed' || createErr.message?.includes('operation-not-allowed')) {
            const fakeUid = `usr_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
            login(
              `token_${fakeUid}_${Date.now()}`,
              {
                id: fakeUid,
                email,
                first_name: firstName,
                last_name: lastName,
                status: 'ACTIVE',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              DEFAULT_ORG,
              [DEFAULT_OWNER_ROLE],
              ['*'],
              []
            );
            return;
          }
          throw new Error(createErr.message || 'Αποτυχία αυθεντικοποίησης μέσω Firebase');
        }
      }
      throw new Error(err.message || 'Αποτυχία σύνδεσης');
    }
  };

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed' || err.message?.includes('operation-not-allowed')) {
        const fakeUid = `usr_google_user`;
        login(
          `token_google_${Date.now()}`,
          {
            id: fakeUid,
            email: 'google.user@shiftledger.gr',
            first_name: 'Google',
            last_name: 'User',
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          DEFAULT_ORG,
          [DEFAULT_OWNER_ROLE],
          ['*'],
          []
        );
        return;
      }
      throw new Error(err.message || 'Αποτυχία σύνδεσης μέσω Google');
    }
  };

  const signUpWithEmail = async (email: string, pass: string, firstName: string, lastName: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (cred.user) {
        const userRef = doc(db, 'users', cred.user.uid);
        await setDoc(userRef, {
          id: cred.user.uid,
          email,
          first_name: firstName,
          last_name: lastName,
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed' || err.message?.includes('operation-not-allowed')) {
        const fakeUid = `usr_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const newUserObj: User = {
          id: fakeUid,
          email,
          first_name: firstName,
          last_name: lastName,
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        try {
          await setDoc(doc(db, 'users', fakeUid), {
            id: fakeUid,
            email,
            first_name: firstName,
            last_name: lastName,
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('Firestore setDoc signup fallback error:', e);
        }

        login(
          `token_${fakeUid}_${Date.now()}`,
          newUserObj,
          DEFAULT_ORG,
          [DEFAULT_OWNER_ROLE],
          ['*'],
          []
        );
        return;
      }
      throw new Error(err.message || 'Αποτυχία εγγραφής χρήστη');
    }
  };

  const login = (
    newToken: string,
    newUser: User,
    newOrg: Organization,
    newRoles: Role[],
    newPerms: string[],
    newStores: UserStoreAssignment[]
  ) => {
    localStorage.setItem('shiftledger_token', newToken);
    setToken(newToken);
    setUser(newUser);
    setOrganization(newOrg);
    setRoles(newRoles);
    setPermissions(newPerms);
    setAssignedStores(newStores);
  };

  const logout = async () => {
    localStorage.removeItem('shiftledger_token');
    setToken(null);
    setUser(null);
    setFirebaseUser(null);
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      await syncUserProfile(auth.currentUser);
    } else {
      setIsLoading(false);
    }
  };

  const hasPermission = (permissionCode: string): boolean => {
    if (!permissionCode) return true;
    if (roles.some((r) => r.code === 'ORG_OWNER' || r.code === 'PLATFORM_ADMIN' || r.code === 'ORG_ADMIN')) {
      return true;
    }
    return permissions.includes('*') || permissions.includes(permissionCode);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        token,
        user,
        organization,
        roles,
        permissions,
        assignedStores,
        isLoading,
        loginWithEmail,
        loginWithGoogle,
        signUpWithEmail,
        login,
        logout,
        refreshUser,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
