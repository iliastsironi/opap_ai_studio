import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Lock, Trash2 } from 'lucide-react';
import { Modal } from './Modal.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { hasSudo, reauthenticate, sudoGrantedAt } from '../../services/reauthService.ts';
import { sudoRemainingLabel } from '../../lib/sudoWindow.ts';
import type { DeletionLine } from '../../lib/shiftDeletion.ts';

/**
 * Το παράθυρο που στέκεται μπροστά από κάθε οριστική διαγραφή.
 *
 * Τρία πράγματα, με αυτή τη σειρά: τι ακριβώς χάνεται, ποια απόφαση μένει
 * ανοιχτή, και ο κωδικός. Ο κωδικός τελευταίος επίτηδες - ζητιέται αφού
 * έχει διαβαστεί τι υπογράφεται, όχι πριν.
 *
 * Ο κωδικός δεν ξαναζητιέται για πέντε λεπτά μετά την πρώτη φορά. Ένα
 * καθάρισμα είναι συνήθως τρεις-τέσσερις διαγραφές στη σειρά, και ο
 * γρηγορότερος τρόπος να μάθει κανείς να πληκτρολογεί τον κωδικό του χωρίς
 * να διαβάζει είναι να του τον ζητάς κάθε φορά.
 */

export interface ConfirmDestructiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Τι σβήνεται, σε μία φράση: «τη βάρδια της 27/10/2026, πρωινή». */
  what: React.ReactNode;
  /** Τι φεύγει μαζί. Κενό = τίποτα εξαρτημένο. */
  lines?: DeletionLine[];
  /** Μια ακόμα απόφαση, όταν υπάρχει (π.χ. οι χρεώσεις πελατών). */
  choice?: React.ReactNode;
  /**
   * Γιατί ΑΥΤΗ η διαγραφή βαραίνει περισσότερο από μια συνηθισμένη.
   *
   * null όταν δεν βαραίνει. Μια προειδοποίηση που εμφανίζεται πάντα παύει
   * να διαβάζεται, και παρασύρει μαζί της εκείνη που είχε σημασία.
   */
  warning?: string | null;
  /** Εκτελείται μόνο αφού επαληθευτεί ο κωδικός. */
  onConfirm: () => Promise<void>;
  confirmLabel?: string;
}

const FATE_STYLE: Record<string, { chip: string; word: string }> = {
  GOES: { chip: 'bg-rose-100 text-rose-800 border-rose-200', word: 'σβήνεται' },
  DETACHES: { chip: 'bg-amber-100 text-amber-900 border-amber-200', word: 'μένει' },
  STAYS: { chip: 'bg-slate-100 text-slate-700 border-slate-200', word: 'μένει' },
};

export const ConfirmDestructiveModal: React.FC<ConfirmDestructiveModalProps> = ({
  isOpen, onClose, what, lines = [], choice, warning, onConfirm, confirmLabel = 'Οριστική διαγραφή',
}) => {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Ο υπολογισμός γίνεται μία φορά στο άνοιγμα: ένα παράθυρο που λήγει ενώ
  // το διαβάζεις και ξαφνικά ζητάει κωδικό είναι χειρότερο από το να τον
  // ζητήσει από την αρχή.
  const [alreadyVerified] = useState(() => hasSudo());

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setProblem(null);
      setBusy(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const run = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (!alreadyVerified) {
        const result = await reauthenticate(user?.email ?? '', password);
        if (!result.ok) {
          setProblem(result.problem);
          setBusy(false);
          return;
        }
      }
      await onConfirm();
      onClose();
    } catch (err: any) {
      setProblem(err?.message || 'Η διαγραφή απέτυχε.');
    } finally {
      setBusy(false);
    }
  };

  const remaining = sudoRemainingLabel(sudoGrantedAt(), Date.now());

  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      headerStyle="bordered"
      icon={AlertTriangle}
      iconClassName="text-rose-600"
      title="Οριστική διαγραφή"
      size="sm"
      footer={
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer text-sm font-bold disabled:opacity-50"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            disabled={busy || (!alreadyVerified && password.trim() === '')}
            onClick={run}
            className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <span>Διαγραφή…</span> : (<><Trash2 className="w-3.5 h-3.5" /><span>{confirmLabel}</span></>)}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-800">
          Πρόκειται να διαγράψετε {what}. <span className="font-bold">Δεν αναιρείται.</span>
        </p>

        {warning && (
          <p className="text-xs font-bold text-rose-900 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{warning}</span>
          </p>
        )}

        {lines.length > 0 && (
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {lines.map((line) => {
              const style = FATE_STYLE[line.fate] ?? FATE_STYLE.STAYS;
              return (
                <div key={line.label} className="px-3 py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900">{line.label}</p>
                    <p className="text-micro text-slate-500">{line.detail}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-lg border text-micro font-bold ${style.chip}`}>
                    {style.word}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {choice}

        {alreadyVerified ? (
          <p className="text-micro text-slate-500 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            Ο κωδικός επαληθεύτηκε{remaining ? ` — ισχύει ακόμα ${remaining}` : ''}.
          </p>
        ) : (
          <div>
            <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              Ο κωδικός σας
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password.trim() !== '' && !busy) run();
              }}
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
            />
            <p className="text-micro text-slate-500 mt-1">
              Επιβεβαιώνει ότι είστε εσείς. Ισχύει για 5 λεπτά.
            </p>
          </div>
        )}

        {problem && (
          <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
};
