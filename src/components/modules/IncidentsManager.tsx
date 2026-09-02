import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, CheckCircle, Search, X } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  fetchIncidentsFromFirestore,
  createIncidentInFirestore,
  updateIncidentStatusInFirestore,
  IncidentRecord,
} from '../../services/moduleServices.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';

export const IncidentsManager: React.FC = () => {
  const { selectedStoreId, stores } = useTenant();
  const { user, organization } = useAuth();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // New Incident Modal
  const [showModal, setShowModal] = useState(false);
  const [targetStoreId, setTargetStoreId] = useState(stores[0]?.id || 'store_opap_01');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'EQUIPMENT' | 'SECURITY' | 'DISCREPANCY' | 'STAFF' | 'OTHER'>('DISCREPANCY');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const orgId = organization?.id || 'org_opap_demo';

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const records = await fetchIncidentsFromFirestore(orgId, selectedStoreId);
      setIncidents(records);
    } catch (e) {
      console.error(e);
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
    } catch (err) {
      console.error('Incident creation error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await updateIncidentStatusInFirestore(id, 'RESOLVED', 'Διευθετήθηκε από υπεύθυνο');
      await loadIncidents();
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = incidents.filter(
    (inc) =>
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
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
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Καταχώρηση Συμβάντος</span>
        </button>
      </div>

      {/* Filter and Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">
                    Δεν βρέθηκαν καταγεγραμμένα συμβάντα.
                  </td>
                </tr>
              ) : (
                filtered.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono">
                      <p className="font-bold text-slate-900">{inc.id}</p>
                      <p className="text-[10px] text-slate-400">{new Date(inc.created_at).toLocaleString('el-GR')}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{inc.title}</p>
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                        {inc.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? (
                        <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px] font-bold">
                          {inc.severity}
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">
                          {inc.severity}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs">{inc.description}</td>
                    <td className="px-4 py-3 text-slate-700">{inc.reported_by}</td>
                    <td className="px-4 py-3">
                      {inc.status === 'RESOLVED' ? (
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          ΕΠΙΛΥΘΗΚΕ
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">
                          ΕΚΚΡΕΜΕΣ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inc.status !== 'RESOLVED' && (
                        <button
                          onClick={() => handleResolve(inc.id)}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 cursor-pointer"
                        >
                          Επίλυση
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

      {/* New Incident Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Καταγραφή Νέου Συμβάντος / Αποκλίσεως
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateIncident} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Κατάστημα</label>
                <select
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
                <label className="block text-slate-700 font-semibold mb-1">Τίτλος Συμβάντος</label>
                <input
                  type="text"
                  placeholder="π.χ. Χρηματική Απόκλιση στο Κλείσιμο"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Κατηγορία</label>
                  <select
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
                  <label className="block text-slate-700 font-semibold mb-1">Σοβαρότητα</label>
                  <select
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
                <label className="block text-slate-700 font-semibold mb-1">Περιγραφή</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Αναλυτικές πληροφορίες για το συμβάν..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>
              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold"
                >
                  {submitting ? 'Αποθήκευση...' : 'Καταχώρηση'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
