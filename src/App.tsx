import React from 'react';
import { AuthProvider } from './context/AuthContext.tsx';
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

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <ProtectedLayout>
          {(currentTab, setCurrentTab) => {
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
          }}
        </ProtectedLayout>
      </TenantProvider>
    </AuthProvider>
  );
}

