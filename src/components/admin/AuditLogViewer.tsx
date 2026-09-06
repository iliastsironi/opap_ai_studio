import React, { useEffect, useState } from 'react';
import { History, ShieldAlert, User, Clock, Terminal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AuditLog } from '../../types/index.js';
import { fetchAuditLogsFromFirestore } from '../../services/auditLogService.ts';

export const AuditLogViewer: React.FC = () => {
  const { organization } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAuditLogs = async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const data = await fetchAuditLogsFromFirestore(organization.id);
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [organization?.id]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Καταγραφές Ελέγχου & Ασφάλειας (Audit Trail)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Αμετάβλητο ιστορικό ενεργειών, συνδέσεων, τροποποιήσεων και δικαιωμάτων.
          </p>
        </div>

        <button
          onClick={fetchAuditLogs}
          className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          Ανανέωση
        </button>
      </div>

      {/* Audit Trail List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Φόρτωση καταγραφών ελέγχου...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Δεν υπάρχουν καταγραφές ελέγχου.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <span className="p-2 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-xs font-bold border border-indigo-100">
                      {log.action}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {log.user_email || 'Σύστημα'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Τύπος Entity: <strong className="text-slate-700">{log.entity_type}</strong> ({log.entity_id || '-'})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <Clock aria-hidden="true" className="w-3.5 h-3.5 text-slate-400" />
                    <span>{new Date(log.created_at).toLocaleString('el-GR')}</span>
                  </div>
                </div>

                {log.after_state && (
                  <div className="bg-slate-900 text-slate-200 text-[11px] font-mono p-3 rounded-lg overflow-x-auto max-h-28">
                    <pre>{JSON.stringify(log.after_state, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
