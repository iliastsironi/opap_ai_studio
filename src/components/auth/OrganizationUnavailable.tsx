import React from 'react';
import { Building2, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

/**
 * Shown instead of the app when someone is signed in but their organisation
 * row could not be read.
 *
 * It exists so that the rest of the app may assume an organisation. Every
 * screen used to carry `organization!.id` for this case,
 * which aimed a default at a real, specific agency: a second tenant whose row
 * failed to load would silently query somebody else's data. The database
 * refuses it - proved by cases 4c-4e in the RLS harness - so the result was
 * empty screens and rejected writes with no explanation rather than a breach.
 *
 * Saying so once, here, is both more honest and less code than thirty-eight
 * guesses.
 */
export const OrganizationUnavailable: React.FC = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5 shadow-xl text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center mx-auto">
          <Building2 className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <h1 className="text-base font-black text-white">Δεν φορτώθηκαν τα στοιχεία του πρακτορείου</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Συνδεθήκατε κανονικά, αλλά η εφαρμογή δεν μπόρεσε να διαβάσει το πρακτορείο σας —
            συνήθως πρόκειται για προσωρινό πρόβλημα σύνδεσης.
          </p>
          {/* The thing anyone actually wants to know at this point. */}
          <p className="text-micro text-slate-500 leading-relaxed">
            Δεν έχει χαθεί τίποτα. Οι βάρδιες, τα έξοδα και οι καταχωρήσεις σας παραμένουν όπως ήταν.
          </p>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="transition w-full py-2.5 rounded-xl duration-150 ease-out active:scale-[0.99] bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Δοκιμάστε ξανά
          </button>
          <button
            type="button"
            onClick={logout}
            className="transition w-full py-2.5 rounded-xl duration-150 ease-out active:scale-[0.99] bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Αποσύνδεση
          </button>
        </div>

        <p className="text-micro text-slate-500 leading-relaxed">
          Αν επιμείνει, επικοινωνήστε με τον ιδιοκτήτη ή την υποστήριξη.
        </p>
      </div>
    </div>
  );
};
