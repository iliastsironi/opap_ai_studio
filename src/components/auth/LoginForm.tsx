import React, { useState, useEffect } from 'react';
import { Lock, Mail, ShieldCheck, ArrowRight, Building2, UserCheck, UserPlus, LogIn, KeyRound, CheckCircle, Sparkles, ArrowLeft, MailCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { isStaffHandle, toAuthEmail } from '../../lib/staffIdentity.ts';
import { supabase } from '../../services/supabase.ts';
import { MAX_LABEL_LENGTH } from '../../lib/limits.ts';

interface LoginFormProps {
  initialMode?: 'signin' | 'signup';
  onBack?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ initialMode = 'signin', onBack }) => {
  const { loginWithEmail, loginWithGoogle, signUpWithEmail } = useAuth();
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  // Empty, not prefilled. The form used to open with owner@shiftledger.gr and
  // password123 already typed in - convenient during the build, and the first
  // thing a customer or a prospect would see on the sign-in screen of a product
  // that holds their cash records. The demo buttons below still sign in with
  // one click, so nothing is lost but the credentials sitting in the fields.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Whether Supabase will actually accept a Google sign-in. The button used to
  // be shown unconditionally while the provider was disabled in the project, so
  // clicking it answered with a raw English error from the API on the one
  // screen a prospective customer sees first. Asking the server means enabling
  // Google in Supabase makes the button appear on its own, with nothing to
  // change here.
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    let cancelled = false;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((settings) => {
        if (!cancelled) setGoogleEnabled(Boolean(settings?.external?.google));
      })
      .catch(() => {
        // Offline, or the endpoint moved. Hiding the button is the safe
        // failure: a missing option is better than one that errors.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const inviteEmail = params.get('email');

    if (action === 'accept_invite' && inviteEmail) {
      setEmail(inviteEmail);
      setIsSignUp(true);
      setInviteBanner(`🎉 Αποδοχή Πρόσκλησης για: ${inviteEmail}. Ορίστε το όνομα και τον κωδικό σας για να ενεργοποιήσετε τον λογαριασμό σας!`);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        if (!firstName || !lastName) {
          throw new Error('Παρακαλώ συμπληρώστε Όνομα και Επώνυμο');
        }
        const { needsEmailConfirmation } = await signUpWithEmail(
          toAuthEmail(email), password, firstName, lastName
        );
        // Without this the form just stopped: confirmation is required, so no
        // session is created and nothing on screen changes.
        if (needsEmailConfirmation) {
          setConfirmationSentTo(email.trim());
          return;
        }
      } else {
        // «giorgos» and «owner@shiftledger.gr» both work: a staff username
        // is turned into its auth handle here, so the employee never types a
        // domain they do not have.
        await loginWithEmail(toAuthEmail(email), password);
      }
    } catch (err: any) {
      setError(err.message || 'Αποτυχία αυθεντικοποίησης');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Αποτυχία σύνδεσης μέσω Google');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError(null);
    setLoading(true);
    try {
      await loginWithEmail(demoEmail, 'password123');
    } catch (err: any) {
      setError(err.message || 'Αποτυχία σύνδεσης');
    } finally {
      setLoading(false);
    }
  };

  if (confirmationSentTo) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5 shadow-xl text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center mx-auto">
            <MailCheck className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <h1 className="text-base font-black text-white">Ελέγξτε το email σας</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Στείλαμε έναν σύνδεσμο επιβεβαίωσης στο{' '}
              <span className="font-mono text-slate-200">{confirmationSentTo}</span>. Ανοίξτε τον
              για να ενεργοποιήσετε τον λογαριασμό σας — μέχρι τότε δεν είναι δυνατή η σύνδεση.
            </p>
            <p className="text-micro text-slate-500 leading-relaxed">
              Δεν ήρθε; Κοιτάξτε και στα ανεπιθύμητα. Αν η διεύθυνση χρησιμοποιείται ήδη, ο
              σύνδεσμος δεν ξαναστέλνεται — δοκιμάστε απευθείας σύνδεση.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setConfirmationSentTo(null);
              setIsSignUp(false);
              setPassword('');
            }}
            className="transition w-full py-2.5 rounded-xl duration-150 ease-out active:scale-[0.99] bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Προς τη σύνδεση
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Subtle Shapes */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-900/30 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Αρχική Σελίδα</span>
          </button>
        )}
        {/* Logo Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white font-extrabold text-2xl shadow-lg shadow-indigo-600/30 mb-3">
            SL
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">ShiftLedger</h1>
          <p className="text-xs text-slate-500 mt-1">
            Πλατφόρμα Διαχείρισης & Ταμειακού Ελέγχου Πρακτορείων ΟΠΑΠ
          </p>
        </div>

        {/* Tab Switcher: Sign In vs Sign Up */}
        <div className="flex bg-slate-800 p-1 rounded-xl mb-6 border border-slate-700/60">
          <button
            type="button"
            onClick={() => setIsSignUp(false)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer ${
              !isSignUp ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Σύνδεση</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(true)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer ${
              isSignUp ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Νέος Λογαριασμός</span>
          </button>
        </div>

        {inviteBanner && (
          <div className="mb-6 p-3.5 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-xs flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span className="font-medium">{inviteBanner}</span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
            <span className="font-bold">!</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Όνομα
                </label>
                <input
                  type="text"
                  maxLength={MAX_LABEL_LENGTH}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required={isSignUp}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-3 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                  placeholder="Γιώργος"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Επώνυμο
                </label>
                <input
                  type="text"
                  maxLength={MAX_LABEL_LENGTH}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required={isSignUp}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-3 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                  placeholder="Παπαδόπουλος"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="login-identifier" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              {isSignUp ? 'Email Χρήστη' : 'Email ή Username'}
            </label>
            <div className="relative">
              <Mail aria-hidden="true" className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              {/* type="text", not "email": staff sign in with a username and the
                  browser would refuse to submit «giorgos» as an address. */}
              <input
                id="login-identifier"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder={isSignUp ? 'name@company.gr' : 'name@company.gr ή giorgos'}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Κωδικός Πρόσβασης
              </label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setResetSent(false);
                    setResetError(null);
                    setShowForgotModal(true);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                >
                  Ξέχασα τον κωδικό
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer text-sm"
          >
            {loading ? (
              <span>Επεξεργασία...</span>
            ) : isSignUp ? (
              <>
                <span>Δημιουργία Λογαριασμού</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Σύνδεση στο Σύστημα</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Google Authentication Option - only when the project actually has it */}
        <div className={`mt-4 ${googleEnabled ? '' : 'hidden'}`}>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center space-x-2.5 text-xs cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.4 0 15.3s.7 5.6 1.9 8l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            <span>Σύνδεση μέσω Google Account</span>
          </button>
        </div>

        {/* Demo Accounts Quick Select */}
        <div className="mt-6 pt-5 border-t border-slate-800">
          <p className="text-micro font-bold text-slate-500 uppercase tracking-wider mb-2.5 text-center">
            Δοκιμαστικοί Λογαριασμοί Demo
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => handleDemoLogin('owner@shiftledger.gr')}
              className="w-full text-left p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 flex items-center justify-between transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-slate-200">Ιδιοκτήτης (Owner)</span>
              </div>
              <span className="text-micro bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded font-mono">
                owner@shiftledger.gr
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleDemoLogin('manager@shiftledger.gr')}
              className="w-full text-left p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 flex items-center justify-between transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-slate-200">Διευθυντής Καταστήματος</span>
              </div>
              <span className="text-micro bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded font-mono">
                manager@shiftledger.gr
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleDemoLogin('employee@shiftledger.gr')}
              className="w-full text-left p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 flex items-center justify-between transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span className="font-semibold text-slate-200">Υπάλληλος Βάρδιας</span>
              </div>
              <span className="text-micro bg-sky-950 text-sky-300 px-2 py-0.5 rounded font-mono">
                employee@shiftledger.gr
              </span>
            </button>
          </div>
        </div>

        {/* Forgot Password Modal */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-white">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Επαναφορά Κωδικού</h3>
                  <p className="text-xs text-slate-500">Αποστολή οδηγιών στο email σας</p>
                </div>
              </div>

              {resetSent ? (
                <div className="py-4 text-center space-y-3">
                  <div className="inline-flex p-3 bg-emerald-500/10 text-emerald-400 rounded-full">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-semibold text-slate-200">
                    Το email επαναφοράς στάλθηκε στο <span className="text-indigo-400 font-mono">{resetEmail}</span>!
                  </p>
                  <p className="text-xs text-slate-500">
                    Ελέγξτε τα εισερχόμενά σας (και τον φάκελο ανεπιθύμητων) για τις οδηγίες ορισμού νέου κωδικού.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Επιστροφή στη Σύνδεση
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!resetEmail) return;
                    setResetError(null);
                    // A staff handle has no mailbox behind it. Sending here
                    // would succeed, deliver nothing, and leave the employee
                    // waiting for an email that cannot arrive - worse than
                    // being told plainly who can help.
                    if (!resetEmail.includes('@') || isStaffHandle(toAuthEmail(resetEmail))) {
                      setResetError(
                        'Ο λογαριασμός σας δεν έχει email, οπότε δεν μπορεί να σταλεί επαναφορά. ' +
                          'Ζητήστε από τον υπεύθυνο να σας δώσει καινούργιο κωδικό.'
                      );
                      return;
                    }
                    setResettingPassword(true);
                    try {
                      await supabase.auth.resetPasswordForEmail(resetEmail);
                      setResetSent(true);
                    } catch (err: any) {
                      setResetError(err.message || 'Αποτυχία αποστολής email επαναφοράς');
                    } finally {
                      setResettingPassword(false);
                    }
                  }}
                  className="space-y-4"
                >
                  {resetError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                      <span className="font-bold">!</span>
                      <span>{resetError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Email Χρήστη
                    </label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      placeholder="name@company.gr"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                    >
                      Ακύρωση
                    </button>
                    <button
                      type="submit"
                      disabled={resettingPassword}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      {resettingPassword ? 'Αποστολή...' : 'Αποστολή Email'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
