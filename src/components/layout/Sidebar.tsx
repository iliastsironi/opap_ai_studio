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
  Truck
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
    { id: 'dashboard', label: 'Επισκόπηση (Dashboard)', icon: LayoutDashboard, perm: 'org.view' },
    { id: 'stores', label: 'Καταστήματα & Τμήματα', icon: StoreIcon, perm: 'store.view' },
    { id: 'users', label: 'Χρήστες & Αναθέσεις', icon: Users, perm: 'users.view' },
    { id: 'roles', label: 'Ρόλοι & Δικαιώματα', icon: ShieldCheck, perm: 'roles.manage' },
    { id: 'audit', label: 'Καταγραφές Ελέγχου (Audit)', icon: History, perm: 'audit.view' },
    { id: 'org_settings', label: 'Ρυθμίσεις Οργανισμού', icon: Settings, perm: 'org.settings' },
    { id: 'onboarding', label: 'Νέο Κατάστημα / Οργανισμός', icon: PlusCircle, perm: 'org.settings' },
  ];

  const operationalModules = [
    { id: 'shifts', label: 'Βάρδιες & Ταμείο', icon: Clock },
    { id: 'expenses', label: 'Έξοδα & Δαπάνες', icon: Receipt },
    { id: 'suppliers', label: 'Προμηθευτές (Suppliers)', icon: Truck },
    { id: 'opap', label: 'Παιχνίδια ΟΠΑΠ', icon: Ticket },
    { id: 'vlt', label: 'Τερματικά PLAY VLT', icon: Gamepad2 },
    { id: 'fnb', label: 'FnB & Αναψυκτήριο', icon: Coffee },
    { id: 'incidents', label: 'Συμβάντα & Αποκλίσεις', icon: AlertTriangle },
    { id: 'reports', label: 'Αναφορές & Analytics', icon: BarChart3 },
  ];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 bg-white text-slate-900 transform transition-transform duration-200 ease-in-out md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } flex flex-col border-r border-slate-200 shadow-sm`}
    >
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-xs">
          SL
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-900 leading-tight">ShiftLedger</h1>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Διαχείριση Ταμείου & Βαρδιών</p>
        </div>
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
        <div>
          <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Διαχείριση & Ασφάλεια
          </p>
          <div className="space-y-1">
            {navItems.map((item) => {
              if (item.perm && !hasPermission(item.perm)) return null;
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 text-indigo-600" />}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Λειτουργικές Ενότητες
          </p>
          <div className="space-y-1">
            {operationalModules.map((mod) => {
              const Icon = mod.icon;
              const isActive = currentTab === mod.id;
              return (
                <button
                  key={mod.id}
                  onClick={() => {
                    setCurrentTab(mod.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-500'}`} />
                    <span>{mod.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 text-indigo-600" />}
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
  );
};
