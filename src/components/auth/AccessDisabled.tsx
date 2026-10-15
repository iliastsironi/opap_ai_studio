import React, { useEffect, useState } from 'react';
import { LogOut, ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { displayIdentifier } from '../../lib/staffIdentity.ts';

const SIGN_OUT_AFTER_SECONDS = 15;

/**
 * Shown instead of the app to an account whose status is INACTIVE.
 *
 * 0027 makes auth_org_id() and auth_role_code() return NULL for such an
 * account, so every policy in the database refuses it. Without this screen the
 * app would simply render empty everywhere and the person would ring whoever
 * deactivated them to ask what broke.
 *
 * They are signed out rather than left sitting here: nothing on this screen
 * needs a session, and a session left open is one more thing to go wrong. The
 * delay exists only so the message can be read first.
 */
export const AccessDisabled: React.FC = () => {
  const { user, logout } = useAuth();
  const [seconds, setSeconds] = useState(SIGN_OUT_AFTER_SECONDS);

  useEffect(() => {
    if (seconds <= 0) {
      logout();
      return;
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, logout]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5 shadow-xl text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center mx-auto">
          <ShieldOff className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <h1 className="text-base font-black text-white">Η πρόσβασή σας έχει απενεργοποιηθεί</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Ο λογαριασμός{' '}
            <span className="font-mono text-slate-200">{displayIdentifier(user?.email)}</span>{' '}
            δεν έχει πλέον πρόσβαση στην εφαρμογή. Αν πιστεύετε ότι πρόκειται για λάθος,
            επικοινωνήστε με τον υπεύθυνο του καταστήματος ή τον ιδιοκτήτη.
          </p>
          {/* Said plainly, because the alternative is someone assuming their
              work was deleted. Deactivation hides nothing that was recorded. */}
          <p className="text-micro text-slate-500 leading-relaxed">
            Οι βάρδιες και οι καταχωρήσεις σας παραμένουν καταγεγραμμένες — δεν διαγράφεται τίποτα.
          </p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="transition w-full py-2.5 rounded-xl duration-150 ease-out active:scale-[0.99] bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Αποσύνδεση
        </button>

        <p className="text-micro text-slate-500" aria-live="polite">
          Αυτόματη αποσύνδεση σε {seconds} {seconds === 1 ? 'δευτερόλεπτο' : 'δευτερόλεπτα'}.
        </p>
      </div>
    </div>
  );
};
