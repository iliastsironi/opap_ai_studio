import React, { useEffect, useState } from 'react';
import { Banknote, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase.ts';
import { fetchActiveShiftFromFirestore } from '../../services/shiftService.ts';
import { getShiftTemplateConfig } from '../../services/shiftTemplateService.ts';
import { readTopUps, topUpsForLegacyFields } from '../../lib/shiftTopUps.ts';
import { readSafeDrops, safeDropShiftFields, sortSafeDrops } from '../../lib/shiftSafeDrops.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { MAX_CURRENCY_AMOUNT } from '../../lib/limits.ts';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import type { Shift } from '../../types/index.ts';
import { MoneyField } from '../ui/MoneyField.tsx';

/** `YYYY-MM-DDTHH:mm` in local time, which is what datetime-local wants. */
function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type QuickCashKind = 'TOPUP' | 'SAFEDROP';

const COPY: Record<QuickCashKind, {
  title: string;
  verb: string;
  blurb: string;
  denied: string;
}> = {
  TOPUP: {
    title: 'Προσαύξηση Ταμείου',
    verb: 'Καταχωρήθηκε προσαύξηση',
    blurb: 'Προστίθεται στο αρχικό ταμείο της ανοιχτής βάρδιας',
    denied: 'Οι προσαυξήσεις καταχωρούνται από τον υπεύθυνο. Μπορεί να αλλάξει στη Διαμόρφωση.',
  },
  SAFEDROP: {
    title: 'Κατάθεση Χρηματοκιβωτίου',
    verb: 'Καταχωρήθηκε κατάθεση',
    blurb: 'Βγαίνει από το συρτάρι της ανοιχτής βάρδιας και μπαίνει στο χρηματοκιβώτιο',
    denied: 'Οι καταθέσεις χρηματοκιβωτίου καταχωρούνται από τον υπεύθυνο. Μπορεί να αλλάξει στη Διαμόρφωση.',
  },
};

/**
 * Move money into the till, or out of it into the safe, without opening the
 * closing wizard to do it.
 *
 * Both happen mid-shift and take five seconds; reaching either meant walking
 * back through the whole close. This writes to the shift that is actually
 * open, and refuses when there is not one - money recorded against no shift
 * lands nowhere.
 *
 * A safe drop is not money leaving: the reconciliation adds bank_deposits back
 * when working out what the drawer should hold, so it stays money the shift
 * took.
 */
export const QuickCashDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  kind: QuickCashKind;
  orgId: string;
  storeId?: string;
  canManage: boolean;
}> = ({ isOpen, onClose, kind, orgId, storeId, canManage }) => {
  const copy = COPY[kind];
  const [shift, setShift] = useState<Shift | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  // When the money actually moved. Defaults to now; a manager can date it
  // back, because cash is often recorded after the fact rather than as it
  // happens.
  const [movedAt, setMovedAt] = useState('');
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
    setMovedAt(localDateTimeValue(new Date()));

    Promise.all([
      fetchActiveShiftFromFirestore(orgId, storeId ?? ''),
      getShiftTemplateConfig(orgId, storeId).catch(() => null),
    ])
      .then(([active, config]) => {
        if (cancelled) return;
        setShift(active);
        setAllowed(
          canManage ||
            (kind === 'TOPUP'
              ? config?.topup_employee_allowed === true
              : (config as any)?.safedrop_employee_allowed === true)
        );
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
  }, [isOpen, orgId, storeId, canManage, kind]);

  const value = Number(String(amount).replace(',', '.'));
  const invalid = !Number.isFinite(value) || value <= 0 || value > MAX_CURRENCY_AMOUNT;

  const submit = async () => {
    if (!shift || invalid) return;
    setSaving(true);
    setError(null);
    try {
      const custom = (shift.custom_field_values ?? {}) as Record<string, any>;

      // Appending, not replacing: an entry made here and one made in the
      // wizard must not overwrite each other.
      let patch: Record<string, any>;
      if (kind === 'TOPUP') {
        const existing = readTopUps(custom).filter((v) => Number(v) > 0);
        const next = [...existing, String(value)];
        patch = {
          custom_field_values: {
            ...custom,
            opening_topups: next.map((v) => Number(v)),
            ...topUpsForLegacyFields(next),
            ...(note.trim() ? { opening_topup_notes: [...(custom.opening_topup_notes ?? []), note.trim()] } : {}),
          },
        };
      } else {
        const drops = sortSafeDrops([
          ...readSafeDrops(custom),
          {
            amount: value,
            note: note.trim() || undefined,
            at: (movedAt ? new Date(movedAt) : new Date()).toISOString(),
          },
        ]);
        patch = {
          custom_field_values: { ...custom, safe_drops: drops },
          ...safeDropShiftFields(drops),
        };
      }

      const { error: writeErr } = await supabase
        .from('shifts')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', shift.id);
      if (writeErr) throw writeErr;

      setDone(`${copy.verb} ${formatCurrency(value)}.`);
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
      title={copy.title}
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
            {copy.denied}
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-600 leading-relaxed">
              {copy.blurb}
              {shift.register_id ? <> στο <span className="font-bold">{shift.register_id}</span></> : null}.
            </p>

            <div>
              <label htmlFor="quick-cash-amount" className="block text-xs font-bold text-slate-700 mb-1">
                Ποσό (€)
              </label>
              <MoneyField
                id="quick-cash-amount"
                value={amount}
                onChange={(next) => setAmount(next)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-extrabold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {canManage && (
              <div>
                <label htmlFor="quick-cash-when" className="block text-xs font-bold text-slate-700 mb-1">
                  Πότε
                </label>
                <input
                  id="quick-cash-when"
                  type="datetime-local"
                  value={movedAt}
                  max={localDateTimeValue(new Date())}
                  onChange={(e) => setMovedAt(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-micro text-slate-500 mt-1">
                  Η ώρα που κινήθηκαν τα χρήματα, όχι η ώρα καταχώρησης.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="quick-cash-note" className="block text-xs font-bold text-slate-700 mb-1">
                Σημείωση (προαιρετικά)
              </label>
              <input
                id="quick-cash-note"
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
