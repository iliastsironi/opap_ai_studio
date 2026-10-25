import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Check, X, Send } from 'lucide-react';
import { MoneyField } from '../ui/MoneyField.tsx';
import { formatCurrency } from '../../lib/formatters.ts';
import { parseNonNegativeAmount, MAX_CURRENCY_AMOUNT, MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import { canSettleTransfer, checkSettlement } from '../../lib/storeTransfer.ts';
import {
  sendStoreTransfer, fetchIncomingTransfers, fetchOutgoingTransfers,
  acceptStoreTransfer, rejectStoreTransfer, StoreTransfer,
} from '../../services/storeTransferService.ts';
import type { Shift } from '../../types/index.ts';

/**
 * Μεταφορές μετρητών μεταξύ καταστημάτων.
 *
 * Deliberately its own section rather than a category in the expense
 * dropdown. A transfer is not a kind of expense - it needs a destination and
 * a signature from the other end - and putting it in that list would have
 * shown it, half-working, in the till's expense rows and the P&L modal too.
 *
 * What it is NOT: the money arriving here. A pending transfer is money in
 * neither till. It appears so somebody can sign for it, and only then does
 * it become a προσαύξηση on the receiving shift.
 */
export const StoreTransfersPanel: React.FC<{
  orgId: string;
  storeId: string;
  stores: Array<{ id: string; name?: string; code?: string }>;
  user: { id: string; first_name?: string; last_name?: string; role_code?: string } | null;
  activeShift: Shift | null;
  onSettled?: () => void;
}> = ({ orgId, storeId, stores, user, activeShift, onSettled }) => {
  const [incoming, setIncoming] = useState<StoreTransfer[]>([]);
  const [outgoing, setOutgoing] = useState<StoreTransfer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [toStoreId, setToStoreId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const userName = user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() : '';
  const maySettle = canSettleTransfer({ roleCode: user?.role_code });

  // Every shop in the company except this one. A shop cannot send to itself -
  // that is a safe drop, and the database refuses it too.
  const others = stores.filter((s) => s.id !== storeId);

  const refresh = useCallback(async () => {
    if (!orgId || !storeId || storeId === 'ALL') return;
    try {
      const [inc, out] = await Promise.all([
        fetchIncomingTransfers(orgId, storeId),
        fetchOutgoingTransfers(orgId, storeId),
      ]);
      setIncoming(inc);
      setOutgoing(out);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Αποτυχία φόρτωσης μεταφορών');
    }
  }, [orgId, storeId]);

  useEffect(() => { refresh(); }, [refresh]);

  const nameOf = (id: string) => {
    const s = stores.find((x) => x.id === id);
    return s ? `${s.code ? `${s.code} ` : ''}${s.name ?? id}` : id;
  };

  const handleSend = async () => {
    const parsed = parseNonNegativeAmount(amount, MAX_CURRENCY_AMOUNT);
    if (!toStoreId) { setError('Επιλέξτε κατάστημα προορισμού.'); return; }
    if (!parsed.isValid || parsed.value <= 0) { setError('Γράψτε ποσό μεγαλύτερο από 0.'); return; }
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await sendStoreTransfer({
        organization_id: orgId,
        from_store_id: storeId,
        to_store_id: toStoreId,
        amount: parsed.value,
        notes: notes.trim() || undefined,
        user_id: user.id,
        user_name: userName,
      }, activeShift);
      setSending(false);
      setAmount(''); setNotes(''); setToStoreId('');
      await refresh();
      onSettled?.();
    } catch (e: any) {
      setError(e?.message ?? 'Η μεταφορά δεν καταχωρήθηκε');
    } finally {
      setBusy(false);
    }
  };

  const settle = async (t: StoreTransfer, action: 'ACCEPT' | 'REJECT') => {
    if (!user) return;
    const reason = action === 'REJECT'
      ? (window.prompt('Γιατί απορρίπτεται; (π.χ. «παρέλαβα 1.500, όχι 2.000»)') ?? '')
      : '';
    // The same rules the database enforces, so the operator is told why
    // rather than shown a raw error from a refused write.
    const check = checkSettlement({
      status: t.status, action, signer: { roleCode: user.role_code }, reason,
    });
    if (!check.allowed) { setError(check.problem ?? null); return; }

    setBusy(true);
    setError(null);
    try {
      if (action === 'ACCEPT') {
        await acceptStoreTransfer(t.id, {
          user_id: user.id, user_name: userName, shift_id: activeShift?.id ?? null,
        });
      } else {
        await rejectStoreTransfer(t.id, reason, { user_id: user.id, user_name: userName });
      }
      await refresh();
      onSettled?.();
    } catch (e: any) {
      setError(e?.message ?? 'Η ενέργεια απέτυχε');
    } finally {
      setBusy(false);
    }
  };

  const pending = incoming.filter((t) => t.status === 'PENDING');
  const badge = (status: string) =>
    status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : status === 'REJECTED' ? 'bg-rose-100 text-rose-800 border-rose-300'
    : status === 'CANCELLED' ? 'bg-slate-100 text-slate-600 border-slate-300'
    : 'bg-amber-100 text-amber-900 border-amber-300';
  const label = (status: string) =>
    status === 'ACCEPTED' ? 'Αποδεκτή'
    : status === 'REJECTED' ? 'Απορρίφθηκε'
    : status === 'CANCELLED' ? 'Ακυρώθηκε'
    : 'Εκκρεμεί';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="font-black text-slate-900 text-sm">Μεταφορές Μετρητών μεταξύ Καταστημάτων</h3>
            <p className="text-micro text-slate-500">
              Δεν είναι έξοδο της εταιρείας — τα λεφτά αλλάζουν συρτάρι. Μετράνε στο
              ταμείο του παραλήπτη μόνο αφού τα αποδεχτεί.
            </p>
          </div>
        </div>
        {others.length > 0 && (
          <button
            type="button"
            onClick={() => { setSending((v) => !v); setError(null); }}
            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer transition-colors"
          >
            {sending ? 'Άκυρο' : '+ Νέα Μεταφορά'}
          </button>
        )}
      </div>

      {others.length === 0 && (
        <p className="text-micro text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
          Χρειάζονται τουλάχιστον δύο καταστήματα για να γίνει μεταφορά.
        </p>
      )}

      {error && (
        <p className="text-micro font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
          {error}
        </p>
      )}

      {sending && (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="sm:col-span-4">
            <label htmlFor="transfer-to" className="block text-micro font-bold text-slate-600 mb-1">
              Προς κατάστημα
            </label>
            <select
              id="transfer-to"
              value={toStoreId}
              onChange={(e) => setToStoreId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            >
              <option value="">-- Επιλέξτε --</option>
              {others.map((s) => (
                <option key={s.id} value={s.id}>{nameOf(s.id)}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="transfer-amount" className="block text-micro font-bold text-slate-600 mb-1">
              Ποσό (€)
            </label>
            <MoneyField
              id="transfer-amount"
              value={amount}
              onChange={setAmount}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-black font-mono bg-white"
            />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="transfer-notes" className="block text-micro font-bold text-slate-600 mb-1">
              Σημείωση
            </label>
            <input
              id="transfer-notes"
              type="text"
              maxLength={MAX_NOTES_LENGTH}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="προαιρετικό"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
            />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button
              type="button"
              disabled={busy}
              onClick={handleSend}
              className="w-full px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" /> Αποστολή
            </button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-micro font-black text-amber-900 uppercase tracking-wider">
            Εισερχόμενες προς αποδοχή ({pending.length})
          </p>
          {pending.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex-wrap">
              <div className="min-w-0">
                <span className="font-black font-mono text-amber-950">{formatCurrency(t.amount)}</span>
                <span className="text-micro text-amber-900 ml-2">
                  από {nameOf(t.from_store_id)} · {t.sent_by_user_name ?? ''} ·{' '}
                  {new Date(t.sent_at).toLocaleDateString('el-GR')}
                </span>
                {t.notes && <p className="text-micro text-amber-800 mt-0.5">{t.notes}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {maySettle ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => settle(t, 'ACCEPT')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-micro flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Αποδοχή
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => settle(t, 'REJECT')}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-black text-micro flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" /> Απόρριψη
                    </button>
                  </>
                ) : (
                  // Said rather than silently hidden, so nobody waits for a
                  // button that is never going to appear for them.
                  <span className="text-micro font-bold text-amber-900">
                    Χρειάζεται διευθυντή ή ιδιοκτήτη
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(incoming.length > 0 || outgoing.length > 0) && (
        <div className="space-y-1">
          <p className="text-micro font-black text-slate-500 uppercase tracking-wider">Ιστορικό</p>
          {[...outgoing.map((t) => ({ t, out: true })), ...incoming.filter((t) => t.status !== 'PENDING').map((t) => ({ t, out: false }))]
            .sort((a, b) => b.t.sent_at.localeCompare(a.t.sent_at))
            .slice(0, 12)
            .map(({ t, out }) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-micro py-1.5 border-b border-slate-100 last:border-0 flex-wrap">
                <span className="text-slate-600">
                  {new Date(t.sent_at).toLocaleDateString('el-GR')} ·{' '}
                  {out ? `προς ${nameOf(t.to_store_id)}` : `από ${nameOf(t.from_store_id)}`}
                  {t.rejection_reason && (
                    <span className="text-rose-700"> · {t.rejection_reason}</span>
                  )}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded-full border font-black ${badge(t.status)}`}>
                    {label(t.status)}
                  </span>
                  <span className="font-mono font-black text-slate-900">{formatCurrency(t.amount)}</span>
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
