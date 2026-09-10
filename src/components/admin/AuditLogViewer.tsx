import React, { useEffect, useState } from 'react';
import { History, ShieldAlert, User, Clock, Terminal, ChevronLeft, ChevronRight, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AuditLog } from '../../types/index.js';
import { fetchAuditLogsFromFirestore, AUDIT_LOGS_PAGE_SIZE } from '../../services/auditLogService.ts';

export const AuditLogViewer: React.FC = () => {
  const { organization } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / AUDIT_LOGS_PAGE_SIZE));
  const pageSafe = Math.min(currentPage, totalPages);

  const fetchAuditLogs = async (page: number) => {
    if (!organization?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { logs: data, totalCount: count } = await fetchAuditLogsFromFirestore(organization.id, page);
      setLogs(data);
      setTotalCount(count);
    } catch (err: any) {
      console.error('Failed to fetch audit logs:', err);
      setError(err.message || 'Αποτυχία φόρτωσης καταγραφών ελέγχου');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs(pageSafe);
  }, [organization?.id, pageSafe]);

  const handleRefresh = () => {
    if (currentPage === 1) {
      fetchAuditLogs(1);
    } else {
      setCurrentPage(1);
    }
  };

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
          onClick={handleRefresh}
          className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          Ανανέωση
        </button>
      </div>

      {error && (
        <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 flex items-start justify-between gap-3">
          <div className="flex items-start space-x-2 text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-xs font-semibold">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Κλείσιμο"
            className="text-rose-400 hover:text-rose-700 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Audit Trail List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Φόρτωση καταγραφών ελέγχου...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <History className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-700">Δεν υπάρχουν καταγραφές ελέγχου</p>
            <p className="text-xs text-slate-400">Οι ενέργειες χρηστών και συστήματος θα εμφανίζονται εδώ.</p>
          </div>
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
                      <p className="text-micro text-slate-500">
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
                  <div className="bg-slate-900 text-slate-200 text-micro font-mono p-3 rounded-lg overflow-x-auto max-h-28">
                    <pre>{JSON.stringify(log.after_state, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {totalCount > AUDIT_LOGS_PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
          <span>
            {(pageSafe - 1) * AUDIT_LOGS_PAGE_SIZE + 1}-
            {Math.min(pageSafe * AUDIT_LOGS_PAGE_SIZE, totalCount)} από {totalCount} καταγραφές
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={loading || pageSafe <= 1}
              aria-label="Προηγούμενη σελίδα"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-700">Σελίδα {pageSafe} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={loading || pageSafe >= totalPages}
              aria-label="Επόμενη σελίδα"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
