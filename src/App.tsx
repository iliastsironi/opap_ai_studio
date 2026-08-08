import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { TenantProvider } from './context/TenantContext.tsx';
import { ProtectedLayout } from './components/layout/ProtectedLayout.tsx';
import { DashboardOverview } from './components/admin/DashboardOverview.tsx';
import { StoresManager } from './components/admin/StoresManager.tsx';
import { UsersManager } from './components/admin/UsersManager.tsx';
import { RolesManager } from './components/admin/RolesManager.tsx';
import { AuditLogViewer } from './components/admin/AuditLogViewer.tsx';
import { OrganizationSettings } from './components/admin/OrganizationSettings.tsx';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard.tsx';
import { ShiftsManager } from './components/shifts/ShiftsManager.tsx';
import { ExpensesManager } from './components/modules/ExpensesManager.tsx';
import { SuppliersManager } from './components/admin/SuppliersManager.tsx';
import { OpapGamesManager } from './components/modules/OpapGamesManager.tsx';
import { VltManager } from './components/modules/VltManager.tsx';
import { FnbManager } from './components/modules/FnbManager.tsx';
import { IncidentsManager } from './components/modules/IncidentsManager.tsx';
import { ReportsManager } from './components/modules/ReportsManager.tsx';
import { InstructionsPage } from './components/instructions/InstructionsPage.tsx';
import { CopilotPage } from './components/copilot/CopilotPage.tsx';
import { ShieldAlert, Clock } from 'lucide-react';

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
  opap: 'opap.view',
  vlt: 'vlt.view',
  fnb: 'fnb.view',
  incidents: 'incidents.view',
  reports: 'reports.view',
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
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Ως υπάλληλος βάρδιας δεν έχετε δικαίωμα πρόσβασης σε αυτή την ενότητα. Έχετε πρόσβαση μόνο στις λειτουργικές ενότητες (Βάρδιες & Ταμείο, Έξοδα, Προμηθευτές, ΟΠΑΠ, VLTs, FnB, Συμβάντα).
          </p>
        </div>
        <button
          onClick={() => setCurrentTab('shifts')}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center space-x-2"
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
    case 'opap':
      return <OpapGamesManager />;
    case 'vlt':
      return <VltManager />;
    case 'fnb':
      return <FnbManager />;
    case 'incidents':
      return <IncidentsManager />;
    case 'reports':
      return <ReportsManager />;
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
  return (
    <AuthProvider>
      <TenantProvider>
        <ProtectedLayout>
          {(currentTab, setCurrentTab) => (
            <AppContent currentTab={currentTab} setCurrentTab={setCurrentTab} />
          )}
        </ProtectedLayout>
      </TenantProvider>
    </AuthProvider>
  );
}

