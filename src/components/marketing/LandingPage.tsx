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
  UserPlus,
  Settings,
  PlayCircle,
  HelpCircle,
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
      'Έναρξη & κλείσιμο βάρδιας με πλήρη καταμέτρηση χαρτονομισμάτων και κερμάτων, και αυτόματο συμψηφισμό με το αναμενόμενο ταμείο. Κάθε απόκλιση επισημαίνεται αμέσως, όχι στο τέλος του μήνα.',
  },
  {
    icon: Ticket,
    title: 'Σκρατς & Λαχεία',
    description:
      'Παρακολούθηση αποθέματος ανά τεμάχιο, με ειδική υποστήριξη για πωλήσεις σε πεντάδες/κομμάτια (Λαϊκό Λαχείο) και πώληση από μπροστά ή πίσω. Το απόθεμα ενημερώνεται αυτόματα, χωρίς χειροκίνητους υπολογισμούς.',
  },
  {
    icon: Building2,
    title: 'Πολλαπλά Καταστήματα',
    description:
      'Διαχειριστείτε όσα καταστήματα και ταμεία χρειάζεστε, με ρόλους πρόσβασης για Ιδιοκτήτη, Διευθυντή και Υπάλληλο. Δείτε ενοποιημένη εικόνα ή ανά κατάστημα, ανά πάσα στιγμή.',
  },
  {
    icon: CreditCard,
    title: 'Τεφτέρι & Πιστώσεις',
    description:
      'Ψηφιακό τεφτέρι πελατών με όρια πίστωσης ανά πελάτη, ορατό σε όλες τις συσκευές — όχι πια χαρτί. Κάθε χρέωση και εξόφληση καταγράφεται με ημερομηνία και υπόλοιπο.',
  },
  {
    icon: BarChart3,
    title: 'Αναφορές & KPIs',
    description:
      'Ημερήσιες και περιοδικές αναφορές εσόδων, εξόδων και αποκλίσεων ταμείου σε όλα τα καταστήματά σας. Εξαγωγή σε Excel για τον λογιστή σας με ένα κλικ.',
  },
  {
    icon: ShieldCheck,
    title: 'Ασφάλεια Δεδομένων',
    description:
      'Κάθε κατάστημα βλέπει μόνο τα δικά του δεδομένα, με πλήρες ιστορικό ενεργειών (audit log) για κάθε αλλαγή. Ο διαχωρισμός επιβάλλεται σε επίπεδο βάσης δεδομένων, όχι μόνο στην οθόνη.',
  },
];

const HOW_IT_WORKS = [
  {
    icon: UserPlus,
    title: 'Δημιουργήστε Λογαριασμό',
    description: 'Εγγραφή με email σε λίγα δευτερόλεπτα. Ξεκινάτε αμέσως τη δωρεάν δοκιμή 30 ημερών, χωρίς κάρτα.',
  },
  {
    icon: Settings,
    title: 'Ρυθμίστε την Επιχείρησή σας',
    description: 'Καταχωρήστε τα στοιχεία της εταιρείας σας και του πρώτου σας καταστήματος.',
  },
  {
    icon: PlayCircle,
    title: 'Ανοίξτε την Πρώτη σας Βάρδια',
    description: 'Καταγράψτε το αρχικό ταμείο και ξεκινήστε — όλα τα υπόλοιπα υπολογίζονται αυτόματα.',
  },
];

const FAQS = [
  {
    q: 'Πόσο διαρκεί η δωρεάν δοκιμή;',
    a: '30 ημέρες, με πλήρη πρόσβαση σε όλες τις λειτουργίες. Δεν απαιτείται πιστωτική κάρτα για να ξεκινήσετε.',
  },
  {
    q: 'Μπορώ να ακυρώσω όποτε θέλω;',
    a: 'Ναι, τόσο το μηνιαίο όσο και το ετήσιο πλάνο ακυρώνονται όποτε θέλετε, χωρίς δέσμευση.',
  },
  {
    q: 'Βλέπουν τα καταστήματα το ένα τα δεδομένα του άλλου;',
    a: 'Όχι. Κάθε κατάστημα/οργανισμός βλέπει αποκλειστικά τα δικά του δεδομένα — ο διαχωρισμός ελέγχεται σε επίπεδο βάσης δεδομένων.',
  },
  {
    q: 'Τι γίνεται όταν λήξει η δοκιμή;',
    a: 'Θα σας ειδοποιήσουμε πριν τη λήξη ώστε να επιλέξετε το πλάνο που σας ταιριάζει. Τα δεδομένα σας παραμένουν πάντα ασφαλή.',
  },
  {
    q: 'Λειτουργεί σε κινητό ή tablet;',
    a: 'Ναι, το ShiftLedger λειτουργεί πλήρως σε κινητό, tablet και υπολογιστή, μέσα από τον browser.',
  },
  {
    q: 'Χρειάζομαι εγκατάσταση λογισμικού;',
    a: 'Όχι, το ShiftLedger λειτουργεί απευθείας από τον browser — καμία εγκατάσταση ή ενημέρωση από εσάς.',
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

const BrowserFrame: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 shadow-xl bg-white overflow-hidden ${className}`}>
    <div className="flex items-center space-x-1.5 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
    </div>
    <div className="p-4 sm:p-5 bg-slate-50">{children}</div>
  </div>
);

const DashboardPreview: React.FC = () => (
  <div className="grid grid-cols-2 gap-3">
    {[
      { label: 'ΣΥΝΟΛΙΚΑ ΕΣΟΔΑ (€)', value: '€8.450,00', tag: '+8,4%', tagColor: 'text-emerald-700 bg-emerald-50' },
      { label: 'ΕΞΟΔΑ & ΠΛΗΡΩΜΕΣ (€)', value: '€1.860,00', tag: 'Εγκεκριμένα', tagColor: 'text-slate-600 bg-slate-100' },
      { label: 'ΑΠΟΚΛΙΣΗ ΤΑΜΕΙΟΥ (€)', value: '€0,00', tag: 'Μηδενική Απόκλιση', tagColor: 'text-emerald-700 bg-emerald-50' },
      { label: 'SAFE DROP (€)', value: '€4.500,00', tag: 'Ασφαλισμένα', tagColor: 'text-indigo-700 bg-indigo-50' },
    ].map((stat) => (
      <div key={stat.label} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">{stat.label}</p>
        <p className="text-lg font-black text-slate-900 mt-1">{stat.value}</p>
        <span className={`inline-block mt-1.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${stat.tagColor}`}>
          {stat.tag}
        </span>
      </div>
    ))}
  </div>
);

const ShiftsTablePreview: React.FC = () => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-[11px]">
      <thead>
        <tr className="text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-200">
          <th className="py-2 pr-3">Κατάστημα &amp; Ταμείο</th>
          <th className="py-2 pr-3">Βάρδια</th>
          <th className="py-2 pr-3">Αναμενόμενο</th>
          <th className="py-2 pr-3">Απόκλιση</th>
          <th className="py-2">Κατάσταση</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        <tr>
          <td className="py-2.5 pr-3 font-semibold text-slate-800">PLAY Store - Γλυφάδα</td>
          <td className="py-2.5 pr-3 text-slate-600">Πρωινή (Α)</td>
          <td className="py-2.5 pr-3 text-slate-600">€1.240,00</td>
          <td className="py-2.5 pr-3 font-bold text-emerald-600">€0,00</td>
          <td className="py-2.5">
            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              ΕΓΚΕΚΡΙΜΕΝΗ
            </span>
          </td>
        </tr>
        <tr>
          <td className="py-2.5 pr-3 font-semibold text-slate-800">OPAP Agency - Κηφισίας</td>
          <td className="py-2.5 pr-3 text-slate-600">Βραδινή (Γ)</td>
          <td className="py-2.5 pr-3 text-slate-600">€860,00</td>
          <td className="py-2.5 pr-3 font-bold text-slate-400">—</td>
          <td className="py-2.5">
            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
              ΠΡΟΧΕΙΡΟ
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
);

const LaikoTablePreview: React.FC = () => (
  <div className="space-y-2">
    <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center justify-between gap-3">
      <div>
        <p className="font-bold text-slate-800 text-sm">Λαϊκό Λαχείο</p>
        <p className="text-[11px] text-slate-500">€2,00 / κομμάτιο</p>
      </div>
      <div className="flex items-center space-x-1.5">
        <div className="w-9 h-9 rounded-lg border-2 border-indigo-200 bg-white flex items-center justify-center font-mono font-black text-sm text-slate-900">
          5
        </div>
        <span className="text-slate-400 text-xs font-bold">+</span>
        <div className="w-9 h-9 rounded-lg border-2 border-indigo-200 bg-white flex items-center justify-center font-mono font-black text-sm text-slate-900">
          3
        </div>
      </div>
    </div>
    <p className="text-[10px] text-emerald-600 font-semibold px-1">Μένουν: 20 πεντ. + 2 κομ. στο απόθεμα</p>
  </div>
);

const CashCounterPreview: React.FC = () => (
  <div className="grid grid-cols-2 gap-2">
    {[
      { label: '50 €', qty: 4 },
      { label: '20 €', qty: 12 },
      { label: '10 €', qty: 8 },
      { label: '0,50 €', qty: 6 },
    ].map((d) => (
      <div key={d.label} className="bg-white rounded-lg border border-slate-200 p-2.5 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">{d.label}</span>
        <div className="flex items-center space-x-1">
          <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">
            −
          </span>
          <span className="w-7 text-center text-sm font-mono font-black text-slate-900">{d.qty}</span>
          <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">
            +
          </span>
        </div>
      </div>
    ))}
  </div>
);

export const LandingPage: React.FC<LandingPageProps> = ({ onStartTrial, onSignIn }) => {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-extrabold text-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
              SL
            </div>
            <span className="font-extrabold text-lg tracking-tight text-slate-900">ShiftLedger</span>
          </div>
          <button
            onClick={onSignIn}
            className="inline-flex items-center space-x-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Σύνδεση</span>
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-indigo-100 rounded-full blur-3xl pointer-events-none opacity-60" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
              Φτιαγμένο για πρακτορεία ΟΠΑΠ
            </span>
            <h1 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight text-slate-900">
              Ο ψηφιακός συνεργάτης για το πρακτορείο σας
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed">
              Βάρδιες, ταμείο, Σκρατς &amp; Λαχεία, τεφτέρι πελατών και αναφορές — όλα σε ένα σύστημα,
              χτισμένο ειδικά για πρακτορεία ΟΠΑΠ.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
              <button
                onClick={onStartTrial}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
              >
                <span>Δωρεάν Δοκιμή 30 Ημερών</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onSignIn}
                className="w-full sm:w-auto inline-flex items-center justify-center bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold py-3.5 px-7 rounded-xl transition-all cursor-pointer"
              >
                Έχω ήδη λογαριασμό
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500">Χωρίς πιστωτική κάρτα. Ακυρώστε όποτε θέλετε.</p>
          </div>
          <BrowserFrame>
            <DashboardPreview />
          </BrowserFrame>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-100">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Όλα όσα χρειάζεται το πρακτορείο σας
          </h2>
          <p className="mt-3 text-slate-500 max-w-xl mx-auto">
            Χτισμένο γύρω από την καθημερινή λειτουργία ενός πρακτορείου ΟΠΑΠ, όχι ένα γενικό εργαλείο ταμείου.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs hover:border-indigo-200 hover:shadow-sm transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center mb-4">
                <feature.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Πώς λειτουργεί</h2>
            <p className="mt-3 text-slate-500 max-w-xl mx-auto">Από την εγγραφή μέχρι την πρώτη σας βάρδια, σε τρία βήματα.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.title} className="text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-white border border-slate-200 shadow-2xs text-indigo-600 flex items-center justify-center relative">
                  <step.icon className="w-6 h-6" />
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-bold text-slate-900">{step.title}</h3>
                <p className="mt-1.5 text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product tour */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-100">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Μια ματιά στην εφαρμογή</h2>
          <p className="mt-3 text-slate-500 max-w-xl mx-auto">Πραγματικές οθόνες από το ShiftLedger, όχι υποσχέσεις.</p>
        </div>
        <div className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <BrowserFrame>
              <ShiftsTablePreview />
            </BrowserFrame>
            <div>
              <h3 className="font-extrabold text-xl text-slate-900">Όλες οι βάρδιες, σε έναν πίνακα</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Δείτε ώρα ανοίγματος, χειριστή, αναμενόμενο ταμείο και απόκλιση για κάθε βάρδια, σε κάθε
                κατάστημα — χωρίς να ανοίγετε ξεχωριστό αρχείο για το καθένα.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="md:order-2">
              <BrowserFrame>
                <LaikoTablePreview />
              </BrowserFrame>
            </div>
            <div className="md:order-1">
              <h3 className="font-extrabold text-xl text-slate-900">Απόθεμα Λαχείων σε πεντάδες &amp; κομμάτια</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Καταχωρήστε την πώληση ακριβώς όπως μετράτε το πακέτο — σε πεντάδες και μεμονωμένα κομμάτια — και
                το υπόλοιπο απόθεμα ενημερώνεται αυτόματα.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <BrowserFrame>
              <CashCounterPreview />
            </BrowserFrame>
            <div>
              <h3 className="font-extrabold text-xl text-slate-900">Καταμέτρηση ταμείου χωρίς αριθμομηχανή</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Μετρήστε χαρτονομίσματα και κέρματα ένα-ένα και δείτε το σύνολο να υπολογίζεται από μόνο του,
                συγκρινόμενο απευθείας με το αναμενόμενο ταμείο.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-slate-50 border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Απλή, καθαρή τιμολόγηση</h2>
            <p className="mt-3 text-slate-500 max-w-xl mx-auto">
              Ξεκινήστε με 30 ημέρες δωρεάν δοκιμή. Πληρώστε μόνο όταν είστε έτοιμοι.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-7 flex flex-col ${
                  plan.highlight
                    ? 'bg-indigo-600 shadow-2xl shadow-indigo-600/20'
                    : 'bg-white border border-slate-200 shadow-2xs'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 right-6 bg-emerald-500 text-emerald-950 text-[11px] font-bold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                )}
                <h3 className={`font-bold ${plan.highlight ? 'text-indigo-100' : 'text-slate-400'}`}>{plan.name}</h3>
                <div className="mt-2 flex items-baseline space-x-1.5">
                  <span className={`text-3xl font-extrabold ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                    {plan.price}
                  </span>
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
                      <span className={plan.highlight ? 'text-indigo-50' : 'text-slate-600'}>{perk}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onStartTrial}
                  className={`mt-7 w-full py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
                    plan.highlight
                      ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-100">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 mb-4">
            <HelpCircle className="w-5 h-5" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Συχνές Ερωτήσεις</h2>
        </div>
        <div className="space-y-4">
          {FAQS.map((faq) => (
            <div key={faq.q} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <h3 className="font-bold text-slate-900 text-sm">{faq.q}</h3>
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-slate-50 border-t border-slate-100">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white mb-5 shadow-lg shadow-indigo-600/20">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Έτοιμοι να σταματήσετε να μετράτε ταμείο στο χαρτί;
          </h2>
          <button
            onClick={onStartTrial}
            className="mt-7 inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
          >
            <span>Ξεκινήστε τη Δωρεάν Δοκιμή σας</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8">
        <p className="text-center text-xs text-slate-400">
          ShiftLedger — Πλατφόρμα Διαχείρισης &amp; Ταμειακού Ελέγχου Πρακτορείων ΟΠΑΠ
        </p>
      </footer>
    </div>
  );
};
