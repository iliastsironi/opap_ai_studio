import React, { useState } from 'react';
import { Building2, Store as StoreIcon, Layers, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';
import { StoreType } from '../../types/index.js';

export const OnboardingWizard: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { token, refreshUser } = useAuth();
  const { refreshStores } = useTenant();

  const [step, setStep] = useState<number>(1);

  // Form State
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  const [storeName, setStoreName] = useState('');
  const [storeCode, setStoreCode] = useState('STR-001');
  const [storeType, setStoreType] = useState<StoreType>('OPAP_AGENCY');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitOnboarding = async () => {
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/orgs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          legal_name: legalName,
          trade_name: tradeName,
          vat_number: vatNumber,
          tax_office: taxOffice,
          address,
          phone,
          initial_store_name: storeName,
          initial_store_code: storeCode,
          initial_store_type: storeType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Αποτυχία ολοκλήρωσης εγγραφής');
      }

      await refreshUser();
      await refreshStores();
      onComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-xl p-8 space-y-6">
      {/* Wizard Progress */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-extrabold flex items-center justify-center text-lg">
            SL
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Οδηγός Onboarding Νέου Οργανισμού</h2>
            <p className="text-xs text-slate-500">Βήμα {step} από 3</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
          <div className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
          <div className={`w-3 h-3 rounded-full ${step >= 3 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Step 1: Org Details */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-indigo-700 font-bold text-sm">
            <Building2 className="w-5 h-5" />
            <span>1. Στοιχεία Εταιρείας / Οργανισμού</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Εταιρική Επωνυμία</label>
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="π.χ. Gaming Retail Α.Ε."
              required
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Διακριτικός Τίτλος</label>
            <input
              type="text"
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              placeholder="π.χ. OPAP Store Network Athens"
              required
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">ΑΦΜ (VAT)</label>
              <input
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="094883920"
                required
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">ΔΟΫ</label>
              <input
                type="text"
                value={taxOffice}
                onChange={(e) => setTaxOffice(e.target.value)}
                placeholder="ΦΑΕ ΑΘΗΝΩΝ"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => {
                if (!legalName || !tradeName || !vatNumber) {
                  setError('Παρακαλώ συμπληρώστε τα υποχρεωτικά πεδία.');
                  return;
                }
                setError(null);
                setStep(2);
              }}
              className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm shadow-sm transition-all cursor-pointer"
            >
              <span>Επόμενο: Αρχικό Κατάστημα</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Store Details */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-indigo-700 font-bold text-sm">
            <StoreIcon className="w-5 h-5" />
            <span>2. Στοιχεία Αρχικού Καταστήματος</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Κωδικός Καταστήματος</label>
            <input
              type="text"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              placeholder="STR-001"
              required
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Όνομα Καταστήματος</label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="π.χ. Πρακτορείο ΟΠΑΠ - Κέντρο"
              required
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Τύπος Λειτουργίας</label>
            <select
              value={storeType}
              onChange={(e) => setStoreType(e.target.value as StoreType)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="OPAP_AGENCY">Πρακτορείο ΟΠΑΠ (OPAP Agency)</option>
              <option value="PLAY_STORE">PLAY OPAP Store (VLTs)</option>
              <option value="OPAP_FNB">OPAP & FnB Lounge</option>
              <option value="GAMING_HALL">Gaming Hall</option>
              <option value="RETAIL">Κατάστημα Λιανικής (Retail)</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Πίσω</span>
            </button>

            <button
              onClick={() => {
                if (!storeName || !storeCode) {
                  setError('Παρακαλώ συμπληρώστε τα στοιχεία καταστήματος.');
                  return;
                }
                setError(null);
                setStep(3);
              }}
              className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm shadow-sm transition-all cursor-pointer"
            >
              <span>Επόμενο: Επιβεβαίωση</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-indigo-700 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            <span>3. Επιβεβαίωση & Δημιουργία</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs text-slate-700">
            <p>Εταιρεία: <strong>{legalName}</strong> ({tradeName})</p>
            <p>ΑΦΜ: <strong className="font-mono">{vatNumber}</strong></p>
            <p>Αρχικό Κατάστημα: <strong>{storeCode} - {storeName}</strong> ({storeType})</p>
            <p>Προεπιλεγμένο Τμήμα: <strong>OPAP - Τμήμα Παιχνιδιών ΟΠΑΠ</strong></p>
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Πίσω</span>
            </button>

            <button
              onClick={handleSubmitOnboarding}
              disabled={submitting}
              className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Δημιουργία...' : 'Ολοκλήρωση Onboarding'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
