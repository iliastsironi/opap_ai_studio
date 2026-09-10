import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, CheckCircle, Search, ChevronLeft, ChevronRight, AlertCircle, X } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Modal } from '../ui/Modal.tsx';
import {
  fetchIncidentsFromFirestore,
  createIncidentInFirestore,
  updateIncidentStatusInFirestore,
  IncidentRecord,
} from '../../services/moduleServices.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { MAX_LABEL_LENGTH, MAX_NOTES_LENGTH } from '../../lib/limits.ts';

export const IncidentsManager: React.FC = () => {
  const { selectedStoreId, stores } = useTenant();
  const { user, organization } = useAuth();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const INCIDENTS_PAGE_SIZE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // New Incident Modal
  const [showModal, setShowModal] = useState(false);
  const [targetStoreId, setTargetStoreId] = useState(stores[0]?.id || 'store_opap_01');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'EQUIPMENT' | 'SECURITY' | 'DISCREPANCY' | 'STAFF' | 'OTHER'>('DISCREPANCY');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const orgId = organization?.id || 'org_opap_demo';

  const loadIncidents = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const records = await fetchIncidentsFromFirestore(orgId, selectedStoreId);
      setIncidents(records);
    } catch (e: any) {
      console.error(e);
      setPageError(e.message || 'Αποτυχία φόρτωσης συμβάντων');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, [selectedStoreId, orgId]);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      await createIncidentInFirestore({
        organization_id: orgId,
        store_id: targetStoreId,
        title,
        category,
        severity,
        status: 'OPEN',
        description,
        reported_by: user ? `${user.first_name} ${user.last_name}` : 'Υπάλληλος',
      });
      await loadIncidents();
      setShowModal(false);
      setTitle('');
      setDescription('');
    } catch (err: any) {
      console.error('Incident creation error:', err);
      setCreateError(err.message || 'Αποτυχία καταχώρησης συμβάντος');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id: string) => {
    setResolvingId(id);
    setPageError(null);
    try {
      await updateIncidentStatusInFirestore(id, 'RESOLVED', 'Διευθετήθηκε από υπεύθυνο');
      await loadIncidents();
    } catch (e: any) {
      console.error(e);
      setPageError(e.message || 'Αποτυχία επίλυσης συμβάντος');
    } finally {
      setResolvingId(null);
    }
  };

  const filteredIncidents = incidents.filter(
    (inc) =>
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / INCIDENTS_PAGE_SIZE));
  const pageSafe = Math.min(currentPage, totalPages);
  const paginatedIncidents = filteredIncidents.slice((pageSafe - 1) * INCIDENTS_PAGE_SIZE, pageSafe * INCIDENTS_PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-xl flex items-center justify-center text-rose-600 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Συμβάντα & Αναφορές Αποκλίσεων</h1>
              <span className="text-xs font-mono font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded">
                LIVE PERSISTENCE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Αρχείο ελέγχου χρηματικών αποκλίσεων (discrepancies), αιτήσεων reopening & τεχνικών συμβάντων.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setCreateError(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Καταχώρηση Συμβάντος</span>
        </button>
      </div>

      {pageError && (
        <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 flex items-start justify-between gap-3">
          <div className="flex items-start space-x-2 text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-xs font-semibold">{pageError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPageError(null)}
            aria-label="Κλείσιμο"
            className="text-rose-400 hover:text-rose-700 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <label htmlFor="incidents-search" className="sr-only">Αναζήτηση συμβάντων</label>
            <input
              id="incidents-search"
              type="text"
              placeholder="Αναζήτηση συμβάντων..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-full border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="px-4 py-3">{toGreekUpper('ID / Ημερομηνια')}</th>
                <th className="px-4 py-3">{toGreekUpper('Τιτλος / Κατηγορια')}</th>
                <th className="px-4 py-3">{toGreekUpper('Σοβαροτητα')}</th>
                <th className="px-4 py-3">{toGreekUpper('Περιγραφη')}</th>
                <th className="px-4 py-3">{toGreekUpper('Αναφερθηκε απο')}</th>
                <th className="px-4 py-3">{toGreekUpper('Κατασταση')}</th>
                <th className="px-4 py-3 text-right">{toGreekUpper('Ενεργεια')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    <AlertTriangle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-700">Δεν βρέθηκαν καταγεγραμμένα συμβάντα</p>
                    <p className="text-xs text-slate-400 mt-1">Η καταχώρηση νέου συμβάντος θα εμφανίζεται εδώ.</p>
                  </td>
                </tr>
              ) : (
                paginatedIncidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono">
                      <p className="font-bold text-slate-900">{inc.id}</p>
                      <p className="text-micro text-slate-400">{new Date(inc.created_at).toLocaleString('el-GR')}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{inc.title}</p>
                      <span className="text-micro bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                        {inc.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? (
                        <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-micro font-bold">
                          {inc.severity}
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-micro font-bold">
                          {inc.severity}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs">{inc.description}</td>
                    <td className="px-4 py-3 text-slate-700">{inc.reported_by}</td>
                    <td className="px-4 py-3">
                      {inc.status === 'RESOLVED' ? (
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-micro font-bold inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          ΕΠΙΛΥΘΗΚΕ
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-micro font-bold">
                          ΕΚΚΡΕΜΕΣ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inc.status !== 'RESOLVED' && (
                        <button
                          onClick={() => handleResolve(inc.id)}
                          disabled={resolvingId === inc.id}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-micro font-bold hover:bg-emerald-700 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {resolvingId === inc.id ? 'Επίλυση...' : 'Επίλυση'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredIncidents.length > INCIDENTS_PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
          <span>
            {(pageSafe - 1) * INCIDENTS_PAGE_SIZE + 1}-
            {Math.min(pageSafe * INCIDENTS_PAGE_SIZE, filteredIncidents.length)} από {filteredIncidents.length} συμβάντα
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
              aria-label="Προηγούμενη σελίδα"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-700">Σελίδα {pageSafe} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
              aria-label="Επόμενη σελίδα"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* New Incident Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        icon={AlertTriangle}
        iconClassName="text-rose-400"
        title="Καταγραφή Νέου Συμβάντος / Αποκλίσεως"
        size="md"
        bodyAsForm
        onSubmit={handleCreateIncident}
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Αποθήκευση...' : 'Καταχώρηση'}
            </button>
          </>
        }
      >
            <div className="space-y-3 text-xs">
              {createError && (
                <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 flex items-center space-x-2 text-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-semibold">{createError}</span>
                </div>
              )}

              <div>
                <label htmlFor="incident-store" className="block text-slate-700 font-semibold mb-1">Κατάστημα</label>
                <select
                  id="incident-store"
                  value={targetStoreId}
                  onChange={(e) => setTargetStoreId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="incident-title" className="block text-slate-700 font-semibold mb-1">Τίτλος Συμβάντος</label>
                <input
                  id="incident-title"
                  type="text"
                  maxLength={MAX_LABEL_LENGTH}
                  placeholder="π.χ. Χρηματική Απόκλιση στο Κλείσιμο"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="incident-category" className="block text-slate-700 font-semibold mb-1">Κατηγορία</label>
                  <select
                    id="incident-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="DISCREPANCY">Χρηματική Απόκλιση</option>
                    <option value="EQUIPMENT">Εξοπλισμός / VLT</option>
                    <option value="SECURITY">Ασφάλεια</option>
                    <option value="STAFF">Προσωπικό</option>
                    <option value="OTHER">Άλλο</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="incident-severity" className="block text-slate-700 font-semibold mb-1">Σοβαρότητα</label>
                  <select
                    id="incident-severity"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="LOW">Χαμηλή (Low)</option>
                    <option value="MEDIUM">Μεσαία (Medium)</option>
                    <option value="HIGH">Υψηλή (High)</option>
                    <option value="CRITICAL">Κρίσιμη (Critical)</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="incident-description" className="block text-slate-700 font-semibold mb-1">Περιγραφή</label>
                <textarea
                  id="incident-description"
                  rows={3}
                  maxLength={MAX_NOTES_LENGTH}
                  required
                  placeholder="Αναλυτικές πληροφορίες για το συμβάν..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>
            </div>
      </Modal>
    </div>
  );
};
