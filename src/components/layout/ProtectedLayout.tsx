import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { LoginForm } from '../auth/LoginForm.tsx';
import { ForcePasswordChange } from '../auth/ForcePasswordChange.tsx';
import { AccessDisabled } from '../auth/AccessDisabled.tsx';
import { OrganizationUnavailable } from '../auth/OrganizationUnavailable.tsx';
import { LandingPage } from '../marketing/LandingPage.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Topbar } from './Topbar.tsx';
import { ErrorBoundary } from '../common/ErrorBoundary.tsx';
import { GlobalLoadingSkeleton } from '../common/LoadingSkeleton.tsx';
import { NotificationPopupHost } from '../notifications/NotificationPopupHost.tsx';

interface ProtectedLayoutProps {
  children: (tab: string, setTab: (t: string) => void) => React.ReactNode;
}

// An invite link (?action=accept_invite&email=...) must land straight on the
// sign-up form, never the marketing page - the invited user already decided.
const hasInviteLink = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('action') === 'accept_invite';

export const ProtectedLayout: React.FC<ProtectedLayoutProps> = ({ children }) => {
  const { token, isLoading, user, organization } = useAuth();
  const { isLoadingStores } = useTenant();
  const [currentTab, setCurrentTab] = useState('shifts');
  const [authScreen, setAuthScreen] = useState<'landing' | 'signin' | 'signup'>(
    hasInviteLink() ? 'signup' : 'landing'
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white" role="status" aria-live="polite">
        <div className="flex flex-col items-center space-y-4">
          <div aria-hidden="true" className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-300 font-medium">Φόρτωση ShiftLedger...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    if (authScreen === 'landing') {
      return (
        <LandingPage
          onStartTrial={() => setAuthScreen('signup')}
          onSignIn={() => setAuthScreen('signin')}
        />
      );
    }
    return (
      <LoginForm
        initialMode={authScreen}
        onBack={hasInviteLink() ? undefined : () => setAuthScreen('landing')}
      />
    );
  }

  // First of all, before even the password prompt. 0027 denies a deactivated
  // account every row in the database, so without this the app renders empty
  // everywhere and the person rings whoever deactivated them to ask what broke.
  if (user?.status === 'INACTIVE') {
    return <AccessDisabled />;
  }

  // Before anything else loads. A staff account starts with a password the
  // Owner generated and could read, and this app charges employees for till
  // shortages - so that window closes at first sign-in, not whenever someone
  // happens to open a settings page.
  if (user?.must_change_password) {
    return <ForcePasswordChange />;
  }

  // After the two above, both of which are reasons an organisation legitimately
  // cannot be read - 0027 denies a deactivated account every row, this one
  // included - and before anything that queries.
  //
  // This is what lets every screen below assume an organisation instead of
  // falling back to `organization!.id`, which aimed a
  // default at one real agency.
  if (!organization) {
    return <OrganizationUnavailable />;
  }

  return (
    <div className="h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900 overflow-hidden">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      {/* Main Content Area */}
      <div className={`flex-1 transition-all duration-200 ease-in-out ${sidebarOpen ? 'md:ml-64' : 'md:ml-0'} flex flex-col h-screen w-full overflow-hidden`}>
        <Topbar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
          {isLoadingStores ? (
            <GlobalLoadingSkeleton />
          ) : (
            <ErrorBoundary>
              {children(currentTab, setCurrentTab)}
            </ErrorBoundary>
          )}
        </main>
      </div>

      <NotificationPopupHost onNavigate={setCurrentTab} />
    </div>
  );
};
