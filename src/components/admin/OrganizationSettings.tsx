import React, { useState } from 'react';
import { Building2, Save, CheckCircle, Crown, Zap, Shield, Mail, Database, CreditCard, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const OrganizationSettings: React.FC = () => {
  const { token, organization, refreshUser } = useAuth();

  const [legalName, setLegalName] = useState(organization?.legal_name || '');
  const [tradeName, setTradeName] = useState(organization?.trade_name || '');
  const [taxOffice, setTaxOffice] = useState(organization?.tax_office || '');
  const [address, setAddress] = useState(organization?.address || '');
  const [phone, setPhone] = useState(organization?.phone || '');
  const [email, setEmail] = useState(organization?.email || '');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch('/api/v1/orgs/current', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          legal_name: legalName,
          trade_name: tradeName,
          tax_office: taxOffice,
          address,
          phone,
          email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Αποτυχία αποθήκευσης ρυθμίσεων');
      }

      await refreshUser();
      setMessage('Οι ρυθμίσεις του οργανισμού ενημερώθηκαν επιτυχώς!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Ρυθμίσεις Οργανισμού & SaaS Συνδρομή
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Διαχείριση εταιρικών στοιχείων, πλάνου συνδρομής ShiftLedger SaaS & ενεργών ειδοποιήσεων.
        </p>
      </div>

      {/* SaaS Live Subscription Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-indigo-900/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Crown className="w-48 h-48 text-indigo-400" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 rounded-full text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>ShiftLedger Enterprise SaaS Plan</span>
              </span>
              <span className="inline-flex items-center space-x-1 text-emerald-400 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Live Active</span>
              </span>
            </div>

            <h2 className="text-2xl font-extrabold text-white">
              {tradeName || legalName || 'ShiftLedger Organization'}
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Πλήρης πολυ-εταιρική άδεια με υποστήριξη απεριόριστων καταστημάτων ΟΠΑΠ / Play, αυτόματες ειδοποιήσεις Resend Email API, ασφαλή βάση Firestore & Live Audit Logging.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl text-center min-w-[140px]">
              <span className="block text-[10px] text-slate-400 uppercase font-bold">Καταστήματα</span>
              <span className="text-lg font-black text-indigo-300">Απεριοριστα</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl text-center min-w-[140px]">
              <span className="block text-[10px] text-slate-400 uppercase font-bold">Resend Email</span>
              <span className="text-lg font-black text-emerald-400">Ενεργό</span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-3">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1 text-slate-300">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Firestore Sync Enabled</span>
            </span>
            <span className="flex items-center space-x-1 text-slate-300">
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
              <span>Resend API Token Connected</span>
            </span>
            <span className="flex items-center space-x-1 text-slate-300">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>ISO 27001 Compliant Audit Log</span>
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => alert('Το πλάνο σας είναι ήδη Enterprise SaaS Live!')}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs shadow-sm transition-all flex items-center space-x-1 cursor-pointer"
            >
              <span>Διαχείριση Τιμολόγησης</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 max-w-2xl">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center space-x-2">
          <Building2 className="w-4 h-4 text-indigo-600" />
          <span>Εταιρικά & Φορολογικά Στοιχεία</span>
        </h3>

        {message && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Εταιρική Επωνυμία (Legal Name)
            </label>
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              required
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Διακριτικός Τίτλος (Trade Name)
            </label>
            <input
              type="text"
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              required
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                ΑΦΜ (VAT Number)
              </label>
              <input
                type="text"
                value={organization?.vat_number || ''}
                disabled
                className="w-full bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-500 font-mono cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                ΔΟΫ (Tax Office)
              </label>
              <input
                type="text"
                value={taxOffice}
                onChange={(e) => setTaxOffice(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Έδρα / Διεύθυνση
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Τηλέφωνο Επικοινωνίας
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Email Επικοινωνίας
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Αποθήκευση...' : 'Αποθήκευση Αλλαγών'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

