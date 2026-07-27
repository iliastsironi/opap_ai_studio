import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { LoginForm } from '../auth/LoginForm.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Topbar } from './Topbar.tsx';
import { ErrorBoundary } from '../common/ErrorBoundary.tsx';
import { GlobalLoadingSkeleton } from '../common/LoadingSkeleton.tsx';

interface ProtectedLayoutProps {
  children: (tab: string, setTab: (t: string) => void) => React.ReactNode;
}

export const ProtectedLayout: React.FC<ProtectedLayoutProps> = ({ children }) => {
  const { token, isLoading } = useAuth();
  const { isLoadingStores } = useTenant();
  const [currentTab, setCurrentTab] = useState('shifts');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-300 font-medium">Φόρτωση ShiftLedger...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <Topbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {isLoadingStores ? (
            <GlobalLoadingSkeleton />
          ) : (
            <ErrorBoundary>
              {children(currentTab, setCurrentTab)}
            </ErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
};

