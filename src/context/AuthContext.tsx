import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase } from '../services/supabase.ts';
import { Organization, Role, User, UserStoreAssignment } from '../types/index.ts';
import { getPermissionsForRole, getRoleByCode, normalizeRoleCode } from '../lib/rbac.ts';

interface AuthContextType {
  supabaseUser: SupabaseAuthUser | null;
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

// The 3 fixed demo accounts advertised on the login screen. Kept as an exact,
// narrow lookup (not a substring match on the email) so nothing else gets an
// elevated role just for sharing a domain with them.
const DEMO_ACCOUNT_ROLE_OVERRIDES: Record<string, string> = {
  'owner@shiftledger.gr': 'ORG_OWNER',
  'manager@shiftledger.gr': 'STORE_MANAGER',
  'employee@shiftledger.gr': 'EMPLOYEE',
};

const DEFAULT_OWNER_ROLE: Role = {
  id: 'role_owner',
  code: 'ORG_OWNER',
  name: 'Ιδιοκτήτης (Owner)',
  description: 'Πλήρη δικαιώματα διαχείρισης οργανισμού και καταστημάτων',
  is_system: true,
  created_at: new Date().toISOString(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseAuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(DEFAULT_ORG);
  const [roles, setRoles] = useState<Role[]>([DEFAULT_OWNER_ROLE]);
  const [permissions, setPermissions] = useState<string[]>(['*']);
  const [assignedStores, setAssignedStores] = useState<UserStoreAssignment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync profile whenever the Supabase session changes.
  const syncUserProfile = async (authUser: SupabaseAuthUser) => {
    try {
      const meta = authUser.user_metadata || {};
      const firstName = meta.first_name || 'Χρήστης';
      const lastName = meta.last_name || 'ShiftLedger';
      const defaultUserObj: User = {
        id: authUser.id,
        email: authUser.email || '',
        first_name: firstName,
        last_name: lastName,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let activeOrg = DEFAULT_ORG;

      let uData: Record<string, any> | null = null;
      try {
        const { data, error } = await supabase.from('users').select('*').eq('id', authUser.id).maybeSingle();
        if (error) throw error;
        uData = data;
      } catch (fsErr) {
        console.warn('Supabase offline or read timeout, falling back to cached user state:', fsErr);
      }

      // Check if user is a demo account
      const isDemoUser = !!(authUser.email && (
        authUser.email.includes('shiftledger.gr') ||
        authUser.email.includes('opap.gr') ||
        authUser.email === 'owner@shiftledger.gr' ||
        authUser.email === 'manager@shiftledger.gr' ||
        authUser.email === 'employee@shiftledger.gr'
      ));

      const hasExistingRow = !!uData;
      const storedRoleCode: string | undefined = uData?.role_code ?? undefined;
      // A signed-in user with no profile row yet and no demo-account match
      // is about to have a brand-new organization created for them below -
      // they genuinely are that org's sole owner. Everyone else with a
      // missing/unrecognized role_code gets the least-privilege default
      // (EMPLOYEE) inside normalizeRoleCode(), not an elevated one.
      const isBrandNewOrgOwner = !hasExistingRow && !isDemoUser;

      const canonicalRoleCode = storedRoleCode
        ? normalizeRoleCode(storedRoleCode)
        : isBrandNewOrgOwner
        ? 'ORG_OWNER'
        : normalizeRoleCode(authUser.email ? DEMO_ACCOUNT_ROLE_OVERRIDES[authUser.email] : undefined);

      const activeRole = getRoleByCode(canonicalRoleCode);
      const activePerms = getPermissionsForRole(canonicalRoleCode);

      if (uData) {
        const userOrgId = uData.organization_id || (isDemoUser ? 'org_opap_demo' : `org_${authUser.id}`);

        setUser({
          id: authUser.id,
          email: authUser.email || uData.email || '',
          first_name: uData.first_name || firstName,
          last_name: uData.last_name || lastName,
          status: 'ACTIVE',
          created_at: uData.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        // Self-heal: this row predates role_code/organization_id tracking,
        // or was created before this device ever resolved them. RLS only
        // trusts *stored* values (never the client's own fallback guess)
        // for anything beyond reading your own profile, so a role/org
        // computed above but never persisted would show correct-looking UI
        // that then fails every real write. The bootstrap trigger
        // (0002_rls.sql) explicitly allows setting either field exactly
        // once, from unset.
        if (!storedRoleCode || !uData.organization_id) {
          supabase.from('users').update({ role_code: canonicalRoleCode, organization_id: userOrgId })
            .eq('id', authUser.id).then(({ error }) => {
              if (error) console.warn('Could not self-heal role_code/organization_id:', error.message);
            });
        }

        if (userOrgId !== 'org_opap_demo') {
          try {
            const { data: orgData } = await supabase.from('organizations').select('*').eq('id', userOrgId).maybeSingle();
            if (orgData) {
              activeOrg = orgData as Organization;
            } else {
              activeOrg = {
                id: userOrgId,
                legal_name: `${uData.first_name || 'Χρήστης'} ${uData.last_name || 'ShiftLedger'}`,
                trade_name: `Πρακτορείο ${uData.first_name || 'ΟΠΑΠ'}`,
                vat_number: '',
                tax_office: '',
                address: '',
                phone: '',
                email: authUser.email || '',
                timezone: 'Europe/Athens',
                currency: 'EUR',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              supabase.from('organizations').insert(activeOrg).then(({ error }) => {
                if (error) console.warn('Could not create fallback organization row:', error.message);
              });
            }
          } catch (orgErr) {
            console.warn('Error fetching custom org:', orgErr);
          }
        }
      } else {
        const newOrgId = isDemoUser ? 'org_opap_demo' : `org_${authUser.id}`;
        setUser(defaultUserObj);

        // users.organization_id is a real foreign key in Postgres (Firestore
        // never enforced this) - the org row must exist before the user row
        // can reference it, for demo users too. Plain insert, not upsert:
        // PostgREST's ON CONFLICT resolution for upsert needs the SELECT
        // policy to see the existing row, and a brand-new user can't
        // satisfy belongs_to_org() yet (no users row of their own committed
        // either), so it gets rejected by RLS before ever reaching the
        // conflict check. A plain insert only needs the INSERT policy
        // (any signed-in user, per 0002_rls.sql) - a 23505 conflict just
        // means another of the 3 demo accounts already created this same
        // 'org_opap_demo' row moments earlier, which is fine.
        activeOrg = isDemoUser
          ? { ...DEFAULT_ORG, updated_at: new Date().toISOString() }
          : {
              id: newOrgId,
              legal_name: `${firstName} ${lastName}`,
              trade_name: `Πρακτορείο ${firstName}`,
              vat_number: '',
              tax_office: '',
              address: '',
              phone: '',
              email: authUser.email || '',
              timezone: 'Europe/Athens',
              currency: 'EUR',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
        const { error: orgInsertErr } = await supabase.from('organizations').insert(activeOrg);
        if (orgInsertErr && orgInsertErr.code !== '23505') {
          console.warn('Could not create organization row:', orgInsertErr.message);
        }

        const { error: userInsertErr } = await supabase.from('users').insert({
          id: defaultUserObj.id,
          email: defaultUserObj.email,
          first_name: defaultUserObj.first_name,
          last_name: defaultUserObj.last_name,
          organization_id: newOrgId,
          role_code: canonicalRoleCode,
          status: 'ACTIVE',
          created_at: defaultUserObj.created_at,
          updated_at: defaultUserObj.updated_at,
        });
        if (userInsertErr) console.warn('Could not create user profile row:', userInsertErr.message);
      }

      setRoles([activeRole]);
      setOrganization(activeOrg);
      setPermissions(activePerms);
    } catch (err) {
      console.error('Error syncing user profile with Supabase:', err);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setIsLoading(true);
      if (session?.user) {
        setSupabaseUser(session.user);
        setToken(session.access_token);
        await syncUserProfile(session.user);
      } else {
        setSupabaseUser(null);
        setToken(null);
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || 'Αποτυχία σύνδεσης');
  };

  const loginWithGoogle = async () => {
    // Redirect-based (Supabase has no popup mode): the browser navigates to
    // Google's login and back, and onAuthStateChange picks up the new
    // session on return - this call not "resolving" in the usual sense
    // (the page unloads) is expected.
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) throw new Error(error.message || 'Αποτυχία σύνδεσης μέσω Google');
  };

  const signUpWithEmail = async (email: string, password: string, firstName: string, lastName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName } },
    });
    if (error) throw new Error(error.message || 'Αποτυχία εγγραφής χρήστη');
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    setSupabaseUser(null);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const refreshUser = async () => {
    const { data: { user: currentAuthUser } } = await supabase.auth.getUser();
    if (currentAuthUser) {
      await syncUserProfile(currentAuthUser);
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
        supabaseUser,
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
