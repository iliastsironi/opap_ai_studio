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
  signUpWithEmail: (email: string, password: string, firstName: string, lastName: string) => Promise<{ needsEmailConfirmation: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// There was a DEFAULT_ORG here: a hardcoded organisation - «ShiftLedger OPAP
// Demo Store», ΑΦΜ EL998877665, an invented Κηφισίας address - used both as
// the initial state and as the value whenever a real row was not read. Since
// the live tenant's row was never read at all (see below), that hardcoded copy
// was what the app displayed, always.

// The 3 fixed demo accounts advertised on the login screen. Kept as an exact,
// narrow lookup (not a substring match on the email) so nothing else gets an
// elevated role just for sharing a domain with them.
const DEMO_ACCOUNT_ROLE_OVERRIDES: Record<string, string> = {
  'owner@shiftledger.gr': 'ORG_OWNER',
  'manager@shiftledger.gr': 'STORE_MANAGER',
  'employee@shiftledger.gr': 'EMPLOYEE',
};

/**
 * One of the three seeded demo accounts, and nothing else.
 *
 * Deliberately an exact, case-insensitive match on the full address rather
 * than a test on the domain: the demo organisation holds real financial data,
 * and anything looser decides who gets to walk into it. Delete these accounts
 * and this returns false for everyone, which is the intended end state - see
 * DEPLOYMENT.md.
 */
export function isDemoAccountEmail(email: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    DEMO_ACCOUNT_ROLE_OVERRIDES,
    email.trim().toLowerCase()
  );
}

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
  const [organization, setOrganization] = useState<Organization | null>(null);
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

      let activeOrg: Organization | null = null;

      let uData: Record<string, any> | null = null;
      try {
        const { data, error } = await supabase.from('users').select('*').eq('id', authUser.id).maybeSingle();
        if (error) throw error;
        uData = data;
      } catch (fsErr) {
        console.warn('Supabase offline or read timeout, falling back to cached user state:', fsErr);
      }

      // Exactly the three seeded demo accounts, matched in full.
      //
      // This used to be a substring test - email.includes('opap.gr') ||
      // email.includes('shiftledger.gr') - which is not a domain check. It
      // matched «opap.gr@gmail.com», «x@opap.gr.evil.com» and anyone at OPAP's
      // own real domain, and every one of them was then placed into
      // org_opap_demo rather than a tenant of their own. That organisation
      // holds live financial records, so a stranger who could register any
      // address containing that substring landed inside it as an EMPLOYEE,
      // able to see open shifts and suppliers and to create shifts and
      // expenses against real stores.
      //
      // An exact match against the known seed accounts is the whole of what
      // this check was ever meant to do.
      const isDemoUser = !!(authUser.email && isDemoAccountEmail(authUser.email));

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
          // The row's real status, not an assumption. This was hardcoded to
          // ACTIVE, so a deactivated account looked perfectly normal to the
          // client while 0027 quietly denied it every row - an empty app with
          // no explanation, which becomes a phone call.
          status: uData.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
          must_change_password: uData.must_change_password === true,
          has_placeholder_email: uData.has_placeholder_email === true,
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

        // Read the organisation row, whatever its id.
        //
        // This was `if (userOrgId !== 'org_opap_demo')`, so the live tenant -
        // whose id IS org_opap_demo and keeps it, because every row references
        // it - never had its row read at all. The app showed a hardcoded
        // DEFAULT_ORG instead, and changing trade_name or vat_number in the
        // database changed nothing anyone could see: not the sidebar, not a
        // shift receipt, not the Excel the accountant receives. The go-live
        // step in DEPLOYMENT.md that updates those fields would have appeared
        // to do nothing at all.
        {
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
        // One shape for everybody. The demo branch used to seed this from a
        // hardcoded DEFAULT_ORG; its row exists in the database like any
        // other, so it is read back below with the rest.
        const seedOrg: Organization = {
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
        const { error: orgInsertErr } = await supabase.from('organizations').insert(seedOrg);
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

        // Read back what is actually stored rather than trusting the object we
        // tried to insert, since a 23505 on the insert means a row was already
        // there and may differ from what we sent.
        //
        // This has to come after the users insert, not before it. The SELECT
        // policy on organizations is belongs_to_org(id), which resolves through
        // auth_org_id() - and that reads the caller's own users row. Run it
        // first and a brand-new owner cannot see the organisation they just
        // created, so activeOrg came back null and they were shown
        // «Δεν φορτώθηκαν τα στοιχεία του πρακτορείου» on their very first
        // sign-in.
        const { data: storedOrg } = await supabase
          .from('organizations').select('*').eq('id', newOrgId).maybeSingle();
        activeOrg = (storedOrg as Organization) ?? seedOrg;
        if (!storedOrg) {
          console.warn(
            `Organisation ${newOrgId} could not be read back` +
              (orgInsertErr ? ` (${orgInsertErr.code}: ${orgInsertErr.message})` : '')
          );
        }
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Come back to wherever the app is actually being served from. Without
      // this, Supabase returns everyone to the project's single configured Site
      // URL, so signing in from a Vercel preview or a custom domain lands on
      // whichever origin happened to be set there. Each origin still has to be
      // listed under Authentication -> URL Configuration -> Redirect URLs;
      // this only picks the right one from that list.
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) throw new Error(error.message || 'Αποτυχία σύνδεσης μέσω Google');
  };

  const signUpWithEmail = async (email: string, password: string, firstName: string, lastName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName } },
    });
    if (error) throw new Error(error.message || 'Αποτυχία εγγραφής χρήστη');

    // This project requires email confirmation (mailer_autoconfirm is false),
    // so signUp returns a user but no session: nothing signs in, no auth state
    // changes, and the app has nothing to react to. The caller has to say so,
    // or the person presses «Εγγραφή» and watches nothing happen.
    //
    // Supabase also returns success for an address that is already registered,
    // deliberately, so that signing up cannot be used to discover who has an
    // account. Telling both cases to go and check their email is therefore the
    // honest answer as well as the private one.
    return { needsEmailConfirmation: !data.session };
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
