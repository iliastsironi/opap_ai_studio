import React, { useState } from 'react';
import { Store as StoreIcon, User as UserIcon, LogOut, Menu, PanelLeft, ChevronDown, Check, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';

interface TopbarProps {
  sidebarOpen?: boolean;
  onToggleSidebar: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ sidebarOpen, onToggleSidebar }) => {
  const { user, logout, roles } = useAuth();
  const { stores, activeStoreId, setActiveStoreId } = useTenant();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const activeStoreName =
    activeStoreId === 'ALL'
      ? 'Όλα τα Καταστήματα'
      : stores.find((s) => s.id === activeStoreId)?.name || 'Επιλέξτε Κατάστημα';

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between shadow-xs">
      {/* Left section: Hamburger & Store Selector & Breadcrumb */}
      <div className="flex items-center space-x-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-600 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Toggle sidebar"
          title={sidebarOpen ? "Απόκρυψη πλευρικού πάνελ" : "Εμφάνιση πλευρικού πάνελ"}
        >
          <PanelLeft className="w-5 h-5" />
        </button>

        {/* Store Selector Dropdown */}
        <div className="relative">
          <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-xs font-medium text-slate-800">
            <StoreIcon className="w-3.5 h-3.5 text-indigo-600" />
            <select
              value={activeStoreId}
              onChange={(e) => setActiveStoreId(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer pr-2 text-xs"
            >
              <option value="ALL">Όλα τα Καταστήματα ({stores.length})</option>
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.code} - {st.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Middle/Right Status Pill & User Menu */}
      <div className="flex items-center space-x-4">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold shadow-2xs">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          <span>Online • Live System</span>
        </div>

        {/* User Dropdown Button */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center space-x-2.5 p-1 rounded-lg hover:bg-slate-50 transition-colors focus:outline-hidden cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {user?.first_name?.[0]}
              {user?.last_name?.[0]}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-900 leading-tight">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-[10px] text-slate-400 font-medium">{roles[0]?.name || 'Χρήστης'}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* User Dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Συνδεδεμένος ως</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-slate-500">{user?.email}</p>
                <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  <Shield className="w-3 h-3 mr-1" />
                  {roles[0]?.name || 'Χρήστης'}
                </div>
              </div>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  logout();
                }}
                className="w-full text-left px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center space-x-2 transition-colors cursor-pointer mt-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Αποσύνδεση (Logout)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
