import React, { useState } from 'react';
import { AlertCircle, KeyRound } from 'lucide-react';
import { supabase } from '../../services/supabase.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { displayIdentifier, isStaffHandle } from '../../lib/staffIdentity.ts';
import { Modal, ModalActions } from '../ui/Modal.tsx';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Anyone, any time, from the profile menu.
 *
 * Separate from ForcePasswordChange, which blocks the whole app at first
 * sign-in. This is the voluntary path, and it is the only one a staff account
 * has: with no mailbox there is no reset email, so if they never get to change
 * their password here, the one the Owner issued is the one they keep.
 */
export const ChangePasswordModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problem =
    password.length < MIN_PASSWORD_LENGTH
      ? `Τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες`
      : password !== confirm
      ? 'Οι δύο κωδικοί δεν ταιριάζουν'
      : null;

  const submit = async () => {
    if (problem) return;
    setSaving(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      // Harmless when it is already false, and the one line that matters when
      // this is reached from an Owner-issued reset.
      await supabase
        .from('users')
        .update({ must_change_password: false, updated_at: new Date().toISOString() })
        .eq('id', user?.id ?? '');
      setDone(true);
      setPassword('');
      setConfirm('');
    } catch (err: any) {
      setError(err?.message || 'Η αλλαγή κωδικού απέτυχε');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setDone(false);
    setError(null);
    setPassword('');
    setConfirm('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Αλλαγή κωδικού"
      icon={KeyRound}
      size="sm"
      footer={
        done ? (
          <ModalActions onCancel={close} cancelLabel="Κλείσιμο" />
        ) : (
          <ModalActions
            onCancel={close}
            onSave={submit}
            saveLabel="Αποθήκευση"
            isSaving={saving}
            disabled={!!problem}
          />
        )
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-600 leading-relaxed">
          Λογαριασμός: <span className="font-mono font-bold text-slate-900">{displayIdentifier(user?.email)}</span>
        </p>

        {isStaffHandle(user?.email) && !done && (
          /* Staff have no mailbox, so there is no «ξέχασα τον κωδικό» for them -
             only the Owner issuing a new one. Saying so here is the difference
             between a careful choice and a support call. */
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
            Ο λογαριασμός σας δεν έχει email, οπότε δεν υπάρχει αυτόματη επαναφορά κωδικού.
            Διαλέξτε κάτι που θα θυμάστε — αν τον ξεχάσετε, θα χρειαστεί να σας δώσει
            καινούργιο ο υπεύθυνος.
          </p>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {done ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            Ο κωδικός άλλαξε. Θα τον χρειαστείτε στην επόμενη σύνδεση.
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="change-password" className="block text-xs font-bold text-slate-700 mb-1">
                Νέος κωδικός
              </label>
              <input
                id="change-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="change-password-confirm" className="block text-xs font-bold text-slate-700 mb-1">
                Επανάληψη
              </label>
              <input
                id="change-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {password.length > 0 && problem && <p className="text-xs text-amber-700">{problem}</p>}
          </>
        )}
      </div>
    </Modal>
  );
};
