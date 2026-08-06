import React from 'react';
import {
  Building2,
  Store as StoreIcon,
  Users,
  ShieldCheck,
  History,
  Settings,
  PlusCircle,
  LayoutDashboard,
  Clock,
  Receipt,
  Wallet,
  Gamepad2,
  Ticket,
  Coffee,
  AlertTriangle,
  ChevronRight,
  BarChart3,
  Truck,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab, isOpen, setIsOpen }) => {
  const { organization, roles, hasPermission } = useAuth();

  const primaryRole = roles[0]?.name || 'Χρήστης';

  const navItems = [
    { id: 'dashboard', label: 'Επισκόπηση (Dashboard)', icon: LayoutDashboard, perm: 'dashboard.view' },
    { id: 'stores', label: 'Καταστήματα & Τμήματα', icon: StoreIcon, perm: 'store.view' },
    { id: 'users', label: 'Χρήστες & Αναθέσεις', icon: Users, perm: 'users.view' },
    { id: 'roles', label: 'Ρόλοι & Δικαιώματα', icon: ShieldCheck, perm: 'roles.manage' },
    { id: 'audit', label: 'Καταγραφές Ελέγχου (Audit)', icon: History, perm: 'audit.view' },
    { id: 'org_settings', label: 'Ρυθμίσεις Οργανισμού', icon: Settings, perm: 'org.settings' },
    { id: 'onboarding', label: 'Νέο Κατάστημα / Οργανισμός', icon: PlusCircle, perm: 'org.settings' },
  ];

  const operationalModules = [
    { id: 'shifts', label: 'Βάρδιες & Ταμείο', icon: Clock, perm: 'shifts.view' },
    { id: 'expenses', label: 'Έξοδα & Δαπάνες', icon: Receipt, perm: 'expenses.view' },
    { id: 'suppliers', label: 'Προμηθευτές', icon: Truck, perm: 'suppliers.view' },
    { id: 'fnb', label: 'FnB & Αναψυκτήριο', icon: Coffee, perm: 'fnb.view' },
    { id: 'incidents', label: 'Συμβάντα & Αποκλίσεις', icon: AlertTriangle, perm: 'incidents.view' },
    { id: 'reports', label: 'Αναφορές & Analytics', icon: BarChart3, perm: 'reports.view' },
  ];

  const visibleNavItems = navItems.filter((item) => !item.perm || hasPermission(item.perm));
  const visibleOperationalModules = operationalModules.filter((mod) => !mod.perm || hasPermission(mod.perm));

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-30 md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white text-slate-900 transform transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } flex flex-col border-r border-slate-200 shadow-sm`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-xs">
              SL
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">ShiftLedger</h1>
              <p className="text-[10px] tracking-wider text-slate-400 font-semibold">ΔΙΑΧΕΙΡΙΣΗ ΤΑΜΕΙΟΥ & ΒΑΡΔΙΩΝ</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close sidebar"
            title="Απόκρυψη πλευρικού πάνελ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

      {/* Tenant Badge */}
      <div className="mx-3 my-3 p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center space-x-3">
        <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-900 truncate">{organization?.trade_name || 'Οργανισμός'}</p>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">ΑΦΜ: {organization?.vat_number || '-'}</p>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
        {visibleNavItems.length > 0 && (
          <div>
            <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 tracking-widest">
              ΔΙΑΧΕΙΡΙΣΗ & ΑΣΦΑΛΕΙΑ
            </p>
            <div className="space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentTab(item.id);
                      if (window.innerWidth < 768) {
                        setIsOpen(false);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-1">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-500'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4 text-indigo-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 tracking-widest">
            ΛΕΙΤΟΥΡΓΙΚΕΣ ΕΝΟΤΗΤΕΣ
          </p>
          <div className="space-y-1">
            {visibleOperationalModules.map((mod) => {
              const Icon = mod.icon;
              const isActive = currentTab === mod.id;
              return (
                <button
                  key={mod.id}
                  onClick={() => {
                    setCurrentTab(mod.id);
                    if (window.innerWidth < 768) {
                      setIsOpen(false);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-1">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-500'}`} />
                    <span className="truncate">{mod.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 text-indigo-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Role Footer */}
      <div className="p-3 border-t border-slate-100 bg-white">
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
            {primaryRole[0]}
          </div>
          <div className="overflow-hidden min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 truncate">{primaryRole}</p>
            <p className="text-[10px] text-slate-500 truncate">Δικαιώματα: {hasPermission('org.settings') ? 'Admin' : 'Staff'}</p>
          </div>
        </div>
      </div>
    </aside>
  </>
  );
};
