import React from 'react';
import { ShieldCheck, Lock, Check } from 'lucide-react';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '../../lib/rbac.ts';

export const RolesManager: React.FC = () => {
  const roles = SYSTEM_ROLES;
  const permissions = SYSTEM_PERMISSIONS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Ρόλοι & Δικαιώματα (RBAC Matrix)
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Επισκόπηση συστημικών ρόλων, επιπέδων πρόσβασης και δικαιωμάτων λειτουργίας.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {roles.map((r) => (
              <div key={r.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-900 text-sm">{r.name}</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1 min-h-[36px]">{r.description}</p>
                <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-indigo-700 font-bold">{r.code}</span>
                  {r.is_system && <span className="text-slate-400 font-medium">Συστημικός</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Granular Permissions Table */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Πίνακας Δικαιωμάτων Λειτουργίας</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 border border-slate-200 rounded-xl">
                <thead className="bg-slate-100 text-slate-800 font-bold">
                  <tr>
                    <th className="p-3 border-b">Module</th>
                    <th className="p-3 border-b">Κωδικός Δικαιώματος</th>
                    <th className="p-3 border-b">Περιγραφή</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {permissions.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-indigo-700">{p.module}</td>
                      <td className="p-3 font-mono text-slate-800 font-semibold">{p.code}</td>
                      <td className="p-3 text-slate-600">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
    </div>
  );
};
