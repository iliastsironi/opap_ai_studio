import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Clock,
  Receipt,
  Truck,
  Coffee,
  AlertTriangle,
  BarChart3,
  Store,
  Users,
  ShieldCheck,
  Bot,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Lightbulb,
  ArrowRight,
  Info
} from 'lucide-react';
import { INSTRUCTIONS_SECTIONS, FAQ_ITEMS, InstructionSection } from '../../data/instructionsContent.ts';

const ICON_MAP: Record<string, React.ElementType> = {
  Clock,
  Receipt,
  Truck,
  Coffee,
  AlertTriangle,
  BarChart3,
  Store,
  Users,
  ShieldCheck,
  Bot,
  HelpCircle,
};

export const InstructionsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedFaq, setExpandedFaq] = useState<string | null>('faq-1');
  const [activeSectionId, setActiveSectionId] = useState<string>('shifts');

  // Filter sections based on search and category
  const filteredSections = useMemo(() => {
    return INSTRUCTIONS_SECTIONS.filter((sec) => {
      const matchesSearch =
        searchQuery === '' ||
        sec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sec.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sec.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sec.steps.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCat =
        selectedCategory === 'all' || sec.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [searchQuery, selectedCategory]);

  const filteredFaqs = useMemo(() => {
    if (!searchQuery) return FAQ_ITEMS;
    return FAQ_ITEMS.filter(
      (faq) =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const scrollToSection = (id: string) => {
    setActiveSectionId(id);
    const element = document.getElementById(`section-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-md">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Κέντρο Βοήθειας & Εκπαίδευσης</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
            Οδηγίες Χρήσης & Λειτουργίας ShiftLedger
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Αναλυτικός οδηγός βήμα-βήμα για κάθε ενότητα της εφαρμογής, τους τύπους υπολογισμού ταμείου, τις διαδικασίες βάρδιας και τις απαντήσεις στις συχνότερες απορίες.
          </p>

          {/* Search Bar */}
          <div className="pt-2 relative max-w-xl">
            <Search aria-hidden="true" className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <label htmlFor="instructions-search" className="sr-only">Αναζήτηση στις οδηγίες</label>
            <input
              id="instructions-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Αναζήτηση στις οδηγίες (π.χ. αναμενόμενο ταμείο, έξοδα, απόκλιση)..."
              className="w-full pl-11 pr-4 py-3 bg-white/10 hover:bg-white/15 focus:bg-white/20 text-white placeholder-slate-400 text-xs md:text-sm rounded-2xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all backdrop-blur-md"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-300 hover:text-white bg-white/10 px-2 py-1 rounded-lg"
              >
                Καθαρισμός
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Sticky Table of Contents / Sidebar */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 lg:sticky lg:top-4 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-600" />
              <span>Πίνακας Περιεχομένων</span>
            </h2>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
              {filteredSections.length} ενότητες
            </span>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedCategory('all')}
              aria-pressed={selectedCategory === 'all'}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Όλα
            </button>
            <button
              onClick={() => setSelectedCategory('operational')}
              aria-pressed={selectedCategory === 'operational'}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                selectedCategory === 'operational'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Λειτουργικά
            </button>
            <button
              onClick={() => setSelectedCategory('management')}
              aria-pressed={selectedCategory === 'management'}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                selectedCategory === 'management'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Διαχείριση
            </button>
          </div>

          {/* TOC Links */}
          <nav className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
            {filteredSections.map((sec) => {
              const IconComp = ICON_MAP[sec.iconName] || BookOpen;
              const isActive = activeSectionId === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => scrollToSection(sec.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0 pr-1">
                    <IconComp className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="truncate">{sec.title}</span>
                  </div>
                  <ArrowRight className={`w-3 h-3 shrink-0 ${isActive ? 'text-indigo-600' : 'opacity-0'}`} />
                </button>
              );
            })}

            <button
              onClick={() => scrollToSection('faq')}
              aria-current={activeSectionId === 'faq' ? 'true' : undefined}
              className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs font-semibold transition-all mt-2 pt-2 border-t border-slate-100 ${
                activeSectionId === 'faq'
                  ? 'bg-amber-50 text-amber-800 font-bold border border-amber-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Συχνές Ερωτήσεις (FAQ)</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Content Sections Area */}
        <div className="lg:col-span-3 space-y-8">
          {filteredSections.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-2xs">
              <Search aria-hidden="true" className="w-8 h-8 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">Δεν βρέθηκαν αποτελέσματα</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Δοκιμάστε να αλλάξετε τους όρους αναζήτησης ή να επιλέξετε την κατηγορία "Όλα".
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="px-3.5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-indigo-700 transition-all cursor-pointer"
              >
                Επαναφορά Αναζήτησης
              </button>
            </div>
          ) : (
            filteredSections.map((sec) => {
              const IconComp = ICON_MAP[sec.iconName] || BookOpen;
              return (
                <section
                  key={sec.id}
                  id={`section-${sec.id}`}
                  className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5 transition-all hover:border-slate-300"
                >
                  {/* Section Title Header */}
                  <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                        <IconComp className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-slate-900">{sec.title}</h2>
                        <p className="text-xs text-slate-500 font-medium">{sec.summary}</p>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                      {sec.category === 'operational'
                        ? 'Λειτουργικό'
                        : sec.category === 'management'
                        ? 'Διαχείριση'
                        : 'AI / Βοήθεια'}
                    </span>
                  </div>

                  {/* Detailed Description */}
                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/50 p-3.5 rounded-xl border border-slate-100">
                    {sec.description}
                  </p>

                  {/* Step-by-Step Instructions */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Βήματα Χρήσης & Διαδικασία</span>
                    </h3>

                    <div className="space-y-2">
                      {sec.steps.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-start space-x-3 p-3 rounded-xl bg-white border border-slate-150 hover:bg-slate-50/80 transition-colors"
                        >
                          <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                            {idx + 1}
                          </span>
                          <span className="text-xs text-slate-700 font-medium leading-relaxed pt-0.5">
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pro Tips Box */}
                  {sec.tips && sec.tips.length > 0 && (
                    <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
                        <Lightbulb className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Χρήσιμα Tips & Τύποι Υπολογισμού:</span>
                      </div>
                      <ul className="space-y-1.5 pl-6 list-disc text-xs text-amber-800 font-medium leading-relaxed">
                        {sec.tips.map((tip, tIdx) => (
                          <li key={tIdx}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Key Metrics / Attributes */}
                  {sec.keyPoints && sec.keyPoints.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      {sec.keyPoints.map((kp, kIdx) => (
                        <div
                          key={kIdx}
                          className="p-3 bg-slate-50 border border-slate-100 rounded-xl"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {kp.label}
                          </p>
                          <p className="text-xs font-bold text-slate-800 mt-0.5">
                            {kp.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}

          {/* FAQ Accordion Section */}
          <section id="section-faq" className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5">
            <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">Συχνές Ερωτήσεις (FAQ)</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Απαντήσεις στα πιο συχνά ερωτήματα υπαλλήλων και διευθυντών.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {filteredFaqs.map((faq) => {
                const isOpen = expandedFaq === faq.id;
                return (
                  <div
                    key={faq.id}
                    className="border border-slate-200 rounded-xl overflow-hidden transition-all"
                  >
                    <button
                      onClick={() => setExpandedFaq(isOpen ? null : faq.id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center space-x-3 pr-2">
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                          {faq.category}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {faq.question}
                        </span>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="p-4 bg-slate-50/80 border-t border-slate-100 text-xs text-slate-600 leading-relaxed font-medium">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
