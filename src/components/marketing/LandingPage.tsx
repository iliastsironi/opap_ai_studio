import React from 'react';
import {
  ArrowRight,
  Clock,
  Wallet,
  Ticket,
  Building2,
  CreditCard,
  BarChart3,
  ShieldCheck,
  CheckCircle2,
  LogIn,
} from 'lucide-react';

interface LandingPageProps {
  onStartTrial: () => void;
  onSignIn: () => void;
}

const FEATURES = [
  {
    icon: Wallet,
    title: 'Καταμέτρηση Ταμείου',
    description:
      'Έναρξη & κλείσιμο βάρδιας με πλήρη καταμέτρηση χαρτονομισμάτων και κερμάτων, και αυτόματο συμψηφισμό με το αναμενόμενο ταμείο.',
  },
  {
    icon: Ticket,
    title: 'Σκρατς & Λαχεία',
    description:
      'Παρακολούθηση αποθέματος ανά τεμάχιο, με ειδική υποστήριξη για πωλήσεις σε πεντάδες/κομμάτια και πώληση από μπροστά ή πίσω.',
  },
  {
    icon: Building2,
    title: 'Πολλαπλά Καταστήματα',
    description:
      'Διαχειριστείτε όσα καταστήματα και ταμεία χρειάζεστε, με ρόλους πρόσβασης για Ιδιοκτήτη, Διευθυντή και Υπάλληλο.',
  },
  {
    icon: CreditCard,
    title: 'Τεφτέρι & Πιστώσεις',
    description:
      'Ψηφιακό τεφτέρι πελατών με όρια πίστωσης ανά πελάτη, ορατό σε όλες τις συσκευές — όχι πια χαρτί.',
  },
  {
    icon: BarChart3,
    title: 'Αναφορές & KPIs',
    description:
      'Ημερήσιες και περιοδικές αναφορές εσόδων, εξόδων και αποκλίσεων ταμείου σε όλα τα καταστήματά σας.',
  },
  {
    icon: ShieldCheck,
    title: 'Ασφάλεια Δεδομένων',
    description:
      'Κάθε κατάστημα βλέπει μόνο τα δικά του δεδομένα, με πλήρες ιστορικό ενεργειών (audit log) για κάθε αλλαγή.',
  },
];

const PRICING_PLANS = [
  {
    name: 'Δοκιμή',
    price: 'Δωρεάν',
    period: 'για 30 ημέρες',
    highlight: false,
    cta: 'Ξεκινήστε Δωρεάν',
    perks: ['Πλήρης πρόσβαση σε όλες τις λειτουργίες', 'Χωρίς πιστωτική κάρτα', 'Όσα καταστήματα χρειάζεστε'],
  },
  {
    name: 'Μηνιαίο',
    price: '25€',
    period: '/ μήνα',
    highlight: true,
    cta: 'Ξεκινήστε Δωρεάν Δοκιμή',
    perks: ['Όλα όσα περιλαμβάνει η δοκιμή', 'Ακύρωση όποτε θέλετε', 'Υποστήριξη μέσω email'],
  },
  {
    name: 'Ετήσιο',
    price: '200€',
    period: '/ έτος',
    badge: '4 μήνες δώρο',
    highlight: false,
    cta: 'Ξεκινήστε Δωρεάν Δοκιμή',
    perks: ['Όλα όσα περιλαμβάνει το μηνιαίο', 'Εξοικονομήστε 100€ ετησίως', 'Υποστήριξη μέσω email'],
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onStartTrial, onSignIn }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top bar */}
      <header className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-extrabold text-lg flex items-center justify-center shadow-lg shadow-indigo-600/30">
            SL
          </div>
          <span className="font-extrabold text-lg tracking-tight">ShiftLedger</span>
        </div>
        <button
          onClick={onSignIn}
          className="inline-flex items-center space-x-1.5 text-sm font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>Σύνδεση</span>
        </button>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-900/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-20 -right-40 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-4xl mx-auto text-center px-4 sm:px-6 pt-10 pb-20">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Ο ψηφιακός συνεργάτης για το πρακτορείο σας
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Βάρδιες, ταμείο, Σκρατς &amp; Λαχεία, τεφτέρι πελατών και αναφορές — όλα σε ένα σύστημα,
            χτισμένο ειδικά για πρακτορεία ΟΠΑΠ.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onStartTrial}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
            >
              <span>Δωρεάν Δοκιμή 30 Ημερών</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onSignIn}
              className="w-full sm:w-auto inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold py-3.5 px-7 rounded-xl transition-all cursor-pointer"
            >
              Έχω ήδη λογαριασμό
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-500">Χωρίς πιστωτική κάρτα. Ακυρώστε όποτε θέλετε.</p>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-900">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Όλα όσα χρειάζεται το πρακτορείο σας</h2>
          <p className="mt-3 text-slate-400 max-w-xl mx-auto">
            Χτισμένο γύρω από την καθημερινή λειτουργία ενός πρακτορείου ΟΠΑΠ, όχι ένα γενικό εργαλείο ταμείου.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                <feature.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-900">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Απλή, καθαρή τιμολόγηση</h2>
          <p className="mt-3 text-slate-400 max-w-xl mx-auto">
            Ξεκινήστε με 30 ημέρες δωρεάν δοκιμή. Πληρώστε μόνο όταν είστε έτοιμοι.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-7 flex flex-col ${
                plan.highlight
                  ? 'bg-indigo-600 shadow-2xl shadow-indigo-600/30'
                  : 'bg-slate-900 border border-slate-800'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 right-6 bg-emerald-500 text-emerald-950 text-[11px] font-bold px-3 py-1 rounded-full">
                  {plan.badge}
                </span>
              )}
              <h3 className={`font-bold ${plan.highlight ? 'text-indigo-100' : 'text-slate-400'}`}>{plan.name}</h3>
              <div className="mt-2 flex items-baseline space-x-1.5">
                <span className="text-3xl font-extrabold">{plan.price}</span>
                <span className={plan.highlight ? 'text-indigo-200 text-sm' : 'text-slate-500 text-sm'}>
                  {plan.period}
                </span>
              </div>
              <ul className="mt-6 space-y-2.5 grow">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start space-x-2 text-sm">
                    <CheckCircle2
                      className={`w-4 h-4 mt-0.5 shrink-0 ${plan.highlight ? 'text-indigo-200' : 'text-emerald-500'}`}
                    />
                    <span className={plan.highlight ? 'text-indigo-50' : 'text-slate-300'}>{perk}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={onStartTrial}
                className={`mt-7 w-full py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
                  plan.highlight
                    ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-slate-900">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white mb-5">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Έτοιμοι να σταματήσετε να μετράτε ταμείο στο χαρτί;
          </h2>
          <button
            onClick={onStartTrial}
            className="mt-7 inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
          >
            <span>Ξεκινήστε τη Δωρεάν Δοκιμή σας</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-900 py-8">
        <p className="text-center text-xs text-slate-600">ShiftLedger — Πλατφόρμα Διαχείρισης &amp; Ταμειακού Ελέγχου Πρακτορείων ΟΠΑΠ</p>
      </footer>
    </div>
  );
};
