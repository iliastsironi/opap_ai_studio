import React, { Suspense, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { TenantProvider } from './context/TenantContext.tsx';
import { ProtectedLayout } from './components/layout/ProtectedLayout.tsx';
import { ShiftsManager } from './components/shifts/ShiftsManager.tsx';
import { ShieldAlert, Clock } from 'lucide-react';
import { lazyWithRetry, clearChunkReloadFlag } from './lib/lazyWithRetry.ts';

const ExpensesManager = lazyWithRetry(() => import('./components/modules/ExpensesManager.tsx').then((m) => ({ default: m.ExpensesManager })));
const IncidentsManager = lazyWithRetry(() => import('./components/modules/IncidentsManager.tsx').then((m) => ({ default: m.IncidentsManager })));
const NationalLotteryManager = lazyWithRetry(() => import('./components/national-lottery/NationalLotteryManager.tsx').then((m) => ({ default: m.NationalLotteryManager })));
const ReportsManager = lazyWithRetry(() => import('./components/modules/ReportsManager.tsx').then((m) => ({ default: m.ReportsManager })));
const RosterManager = lazyWithRetry(() => import('./components/modules/RosterManager.tsx').then((m) => ({ default: m.RosterManager })));
const DashboardOverview = lazyWithRetry(() => import('./components/admin/DashboardOverview.tsx').then((m) => ({ default: m.DashboardOverview })));
const StoresManager = lazyWithRetry(() => import('./components/admin/StoresManager.tsx').then((m) => ({ default: m.StoresManager })));
const UsersManager = lazyWithRetry(() => import('./components/admin/UsersManager.tsx').then((m) => ({ default: m.UsersManager })));
const RolesManager = lazyWithRetry(() => import('./components/admin/RolesManager.tsx').then((m) => ({ default: m.RolesManager })));
const AuditLogViewer = lazyWithRetry(() => import('./components/admin/AuditLogViewer.tsx').then((m) => ({ default: m.AuditLogViewer })));
const OrganizationSettings = lazyWithRetry(() => import('./components/admin/OrganizationSettings.tsx').then((m) => ({ default: m.OrganizationSettings })));
const SuppliersManager = lazyWithRetry(() => import('./components/admin/SuppliersManager.tsx').then((m) => ({ default: m.SuppliersManager })));
const OnboardingWizard = lazyWithRetry(() => import('./components/onboarding/OnboardingWizard.tsx').then((m) => ({ default: m.OnboardingWizard })));
const InstructionsPage = lazyWithRetry(() => import('./components/instructions/InstructionsPage.tsx').then((m) => ({ default: m.InstructionsPage })));
const CopilotPage = lazyWithRetry(() => import('./components/copilot/CopilotPage.tsx').then((m) => ({ default: m.CopilotPage })));

const ModuleLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center py-24">
    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const TAB_PERMISSIONS: Record<string, string> = {
  dashboard: 'dashboard.view',
  stores: 'store.view',
  users: 'users.view',
  roles: 'roles.manage',
  audit: 'audit.view',
  org_settings: 'org.settings',
  onboarding: 'org.settings',
  shifts: 'shifts.view',
  expenses: 'expenses.view',
  suppliers: 'suppliers.view',
  incidents: 'incidents.view',
  national_lottery: 'national_lottery.view',
  reports: 'reports.view',
  roster: 'roster.view',
  instructions: 'shifts.view',
  copilot: 'shifts.view',
};

function AppContent({ currentTab, setCurrentTab }: { currentTab: string; setCurrentTab: (t: string) => void }) {
  const { hasPermission } = useAuth();

  const requiredPerm = TAB_PERMISSIONS[currentTab];

  if (requiredPerm && !hasPermission(requiredPerm)) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-md mx-auto my-12 shadow-xs">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto font-bold">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-900">Περιορισμός Πρόσβασης</h3>
          {/* Deliberately does not enumerate the permitted modules. The old
              copy listed them by name and went stale the moment a module was
              added or removed; the sidebar already shows exactly what this
              user can reach. */}
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Δεν έχετε δικαίωμα πρόσβασης σε αυτή την ενότητα. Στο πλευρικό μενού
            βλέπετε τις ενότητες στις οποίες έχετε πρόσβαση.
          </p>
        </div>
        <button
          onClick={() => setCurrentTab('shifts')}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-2"
        >
          <Clock className="w-4 h-4" />
          <span>Μετάβαση σε "Βάρδιες & Ταμείο"</span>
        </button>
      </div>
    );
  }

  switch (currentTab) {
    case 'dashboard':
      return <DashboardOverview onNavigate={setCurrentTab} />;
    case 'shifts':
      return <ShiftsManager />;
    case 'expenses':
      return <ExpensesManager />;
    case 'suppliers':
      return <SuppliersManager />;
    case 'incidents':
      return <IncidentsManager />;
    case 'national_lottery':
      return <NationalLotteryManager />;
    case 'reports':
      return <ReportsManager onNavigate={setCurrentTab} />;
    case 'roster':
      return <RosterManager />;
    case 'instructions':
      return <InstructionsPage />;
    case 'copilot':
      return <CopilotPage />;
    case 'stores':
      return <StoresManager />;
    case 'users':
      return <UsersManager />;
    case 'roles':
      return <RolesManager />;
    case 'audit':
      return <AuditLogViewer />;
    case 'org_settings':
      return <OrganizationSettings />;
    case 'onboarding':
      return <OnboardingWizard onComplete={() => setCurrentTab('dashboard')} />;
    default:
      return <ShiftsManager />;
  }
}

export default function App() {
  // The app rendered, so whatever stale chunk forced a reload is behind us.
  // Re-arm the one-shot guard in lazyWithRetry so a LATER deploy can heal the
  // same tab too - without this, a long-lived tab only ever self-heals once.
  useEffect(() => {
    clearChunkReloadFlag();
  }, []);

  return (
    <AuthProvider>
      <TenantProvider>
        <ProtectedLayout>
          {(currentTab, setCurrentTab) => (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <AppContent currentTab={currentTab} setCurrentTab={setCurrentTab} />
            </Suspense>
          )}
        </ProtectedLayout>
      </TenantProvider>
    </AuthProvider>
  );
}

