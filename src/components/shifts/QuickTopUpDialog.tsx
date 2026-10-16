import React, { useEffect, useState } from 'react';
import { Banknote, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase.ts';
import { fetchActiveShiftFromFirestore } from '../../services/shiftService.ts';
import { getShiftTemplateConfig } from '../../services/shiftTemplateService.ts';
import { readTopUps, topUpsForLegacyFields } from '../../lib/shiftTopUps.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { MAX_CURRENCY_AMOUNT } from '../../lib/limits.ts';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import type { Shift } from '../../types/index.ts';

/**
 * Put money in the till, without opening the closing wizard to do it.
 *
 * A προσαύξηση happens mid-shift and takes five seconds; reaching it meant
 * walking back through the whole close. This writes to the shift that is
 * actually open, and refuses when there is not one - a top-up recorded against
 * no shift is money that lands nowhere.
 */
export const QuickTopUpDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  storeId?: string;
  canManage: boolean;
}> = ({ isOpen, onClose, orgId, storeId, canManage }) => {
  const [shift, setShift] = useState<Shift | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDone(null);
    setAmount('');
    setNote('');

    Promise.all([
      fetchActiveShiftFromFirestore(orgId, storeId ?? ''),
      getShiftTemplateConfig(orgId, storeId).catch(() => null),
    ])
      .then(([active, config]) => {
        if (cancelled) return;
        setShift(active);
        setAllowed(canManage || config?.topup_employee_allowed === true);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Δεν ήταν δυνατή η ανάγνωση της βάρδιας');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, orgId, storeId, canManage]);

  const value = Number(String(amount).replace(',', '.'));
  const invalid = !Number.isFinite(value) || value <= 0 || value > MAX_CURRENCY_AMOUNT;

  const submit = async () => {
    if (!shift || invalid) return;
    setSaving(true);
    setError(null);
    try {
      const custom = (shift.custom_field_values ?? {}) as Record<string, any>;
      // Append rather than replace, so a top-up entered here and one entered
      // in the wizard do not overwrite each other.
      const existing = readTopUps(custom).filter((v) => Number(v) > 0);
      const next = [...existing, String(value)];

      const { error: writeErr } = await supabase
        .from('shifts')
        .update({
          custom_field_values: {
            ...custom,
            opening_topups: next.map((v) => Number(v)),
            ...topUpsForLegacyFields(next),
            ...(note.trim() ? { opening_topup_notes: [...(custom.opening_topup_notes ?? []), note.trim()] } : {}),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', shift.id);
      if (writeErr) throw writeErr;

      setDone(`Καταχωρήθηκε προσαύξηση ${formatCurrency(value)}.`);
      setAmount('');
      setNote('');
    } catch (err: any) {
      setError(err?.message || 'Η καταχώρηση απέτυχε');
    } finally {
      setSaving(false);
    }
  };

  const blocked = !loading && (!shift || !allowed);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Προσαύξηση Ταμείου"
      icon={Banknote}
      size="sm"
      footer={
        <ModalActions
          onCancel={onClose}
          cancelLabel="Κλείσιμο"
          onSave={blocked ? undefined : submit}
          saveLabel="Καταχώρηση"
          isSaving={saving}
          disabled={invalid || blocked}
        />
      }
    >
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Αναζήτηση ανοιχτής βάρδιας…
          </div>
        ) : !shift ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
            Δεν υπάρχει ανοιχτή βάρδια σε αυτό το κατάστημα. Η προσαύξηση καταχωρείται πάνω στη
            βάρδια που τρέχει — ανοίξτε πρώτα βάρδια.
          </p>
        ) : !allowed ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
            Οι προσαυξήσεις καταχωρούνται από τον υπεύθυνο. Μπορεί να αλλάξει στη Διαμόρφωση.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-600 leading-relaxed">
              Προστίθεται στο αρχικό ταμείο της ανοιχτής βάρδιας
              {shift.register_id ? <> στο <span className="font-bold">{shift.register_id}</span></> : null}.
            </p>

            <div>
              <label htmlFor="quick-topup-amount" className="block text-xs font-bold text-slate-700 mb-1">
                Ποσό (€)
              </label>
              <input
                id="quick-topup-amount"
                type="number"
                step="0.01"
                min="0"
                max={MAX_CURRENCY_AMOUNT}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-extrabold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="quick-topup-note" className="block text-xs font-bold text-slate-700 mb-1">
                Σημείωση (προαιρετικά)
              </label>
              <input
                id="quick-topup-note"
                type="text"
                maxLength={120}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="π.χ. ψιλά από το χρηματοκιβώτιο"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </>
        )}

        {error && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>
        )}
        {done && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{done}</p>
        )}
      </div>
    </Modal>
  );
};
