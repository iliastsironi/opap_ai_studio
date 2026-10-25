import React, { useState } from 'react';
import { AlertCircle, KeyRound, ShieldCheck } from 'lucide-react';
import { supabase } from '../../services/supabase.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { displayIdentifier } from '../../lib/staffIdentity.ts';

const MIN_LENGTH = 8;

/**
 * Shown instead of the app when an account still carries the password someone
 * else generated for it.
 *
 * A staff login is created by the Owner with a password they can read, so
 * until the employee replaces it, the person who issued it can sign in as
 * them - and this app charges employees for till shortages. The window has to
 * close at first use, which is why this blocks the whole app rather than
 * sitting in a settings page nobody opens.
 */
export const ForcePasswordChange: React.FC<{ reason?: 'ISSUED' | 'RECOVERY' }> = ({
  reason = 'ISSUED',
}) => {
  const { user, logout } = useAuth();
  const isRecovery = reason === 'RECOVERY';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem =
    password.length < MIN_LENGTH
      ? `Τουλάχιστον ${MIN_LENGTH} χαρακτήρες`
      : password !== confirm
      ? 'Οι δύο κωδικοί δεν ταιριάζουν'
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return;
    setSaving(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      // Only after Auth accepted it. Clearing the flag first would leave an
      // account whose password is still the issued one with nothing left to
      // prompt the user.
      const { error: flagError } = await supabase
        .from('users')
        .update({ must_change_password: false, updated_at: new Date().toISOString() })
        .eq('id', user?.id ?? '');
      // Fatal for an issued password - leaving the flag set would ask for a
      // new one at every sign-in forever. Incidental after a reset, where the
      // password is already changed and the flag was most likely false
      // anyway: failing here would show an error for something that worked.
      if (flagError) {
        if (!isRecovery) throw flagError;
        console.warn('[ForcePasswordChange] password changed, flag not cleared:', flagError);
      }
      // Re-read the profile the plain way: the app reloads and AuthContext
      // picks up the cleared flag.
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || 'Η αλλαγή κωδικού απέτυχε');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">
              {isRecovery ? 'Ορίστε νέο κωδικό' : 'Ορίστε τον δικό σας κωδικό'}
            </h1>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {isRecovery ? (
                <>
                  Ήρθατε από τον σύνδεσμο επαναφοράς για τον λογαριασμό{' '}
                  <span className="font-mono text-slate-200">{displayIdentifier(user?.email)}</span>.
                  Γράψτε τον καινούργιο σας κωδικό για να μπείτε.
                </>
              ) : (
                <>
                  Ο λογαριασμός <span className="font-mono text-slate-200">{displayIdentifier(user?.email)}</span>{' '}
                  χρησιμοποιεί ακόμα τον προσωρινό κωδικό που σας δόθηκε. Επιλέξτε έναν δικό σας
                  για να συνεχίσετε — κανείς άλλος δεν θα τον γνωρίζει.
                </>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="new-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Νέος κωδικός
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Επανάληψη
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {password.length > 0 && problem && <p className="text-xs text-amber-300">{problem}</p>}

          <button
            type="submit"
            disabled={saving || !!problem}
            className="transition w-full py-2.5 rounded-xl duration-150 ease-out active:scale-[0.99] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ShieldCheck className="w-4 h-4" />
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση κωδικού'}
          </button>
        </form>

        <button
          type="button"
          onClick={logout}
          className="w-full text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          Αποσύνδεση
        </button>
      </div>
    </div>
  );
};
