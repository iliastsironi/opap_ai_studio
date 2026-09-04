import React, { useState, useEffect } from 'react';
import { Lock, Mail, ShieldCheck, ArrowRight, Building2, UserCheck, UserPlus, LogIn, KeyRound, CheckCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { supabase } from '../../services/supabase.ts';

export const LoginForm: React.FC = () => {
  const { loginWithEmail, loginWithGoogle, signUpWithEmail } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState('owner@shiftledger.gr');
  const [password, setPassword] = useState('password123');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
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
        await signUpWithEmail(email, password, firstName, lastName);
      } else {
        await loginWithEmail(email, password);
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

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Subtle Shapes */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-900/30 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        {/* Logo Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white font-extrabold text-2xl shadow-lg shadow-indigo-600/30 mb-3">
            SL
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">ShiftLedger</h1>
          <p className="text-xs text-slate-400 mt-1">
            Πλατφόρμα Διαχείρισης & Ταμειακού Ελέγχου Πρακτορείων ΟΠΑΠ
          </p>
        </div>

        {/* Tab Switcher: Sign In vs Sign Up */}
        <div className="flex bg-slate-800 p-1 rounded-xl mb-6 border border-slate-700/60">
          <button
            type="button"
            onClick={() => setIsSignUp(false)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              !isSignUp ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Σύνδεση</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(true)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
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
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Email Χρήστη
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="name@company.gr"
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

        {/* Google Authentication Option */}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center space-x-2.5 text-xs cursor-pointer"
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
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 text-center">
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
              <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded font-mono">
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
              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded font-mono">
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
              <span className="text-[10px] bg-sky-950 text-sky-300 px-2 py-0.5 rounded font-mono">
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
                  <p className="text-xs text-slate-400">Αποστολή οδηγιών στο email σας</p>
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
                  <p className="text-xs text-slate-400">
                    Ελέγξτε τα εισερχόμενά σας (και τον φάκελο ανεπιθύμητων) για τις οδηγίες ορισμού νέου κωδικού.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Επιστροφή στη Σύνδεση
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!resetEmail) return;
                    await supabase.auth.resetPasswordForEmail(resetEmail);
                    setResetSent(true);
                  }}
                  className="space-y-4"
                >
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
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                    >
                      Αποστολή Email
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
