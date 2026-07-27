import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Coins,
  Ticket,
  Coffee,
  UserCheck,
  Building2,
  Upload,
  Trash2,
  Plus,
  HelpCircle,
  X,
  CreditCard,
  Building,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  EUR_DENOMINATIONS,
  calculateCountedCash,
  calculateDiscrepancy,
  calculateExpectedCash,
  safeNum,
} from '../../services/financialCalculator.ts';
import { Shift, ShiftExpense, CustomerCredit } from '../../types/index.ts';
import { updateShiftInFirestore } from '../../services/shiftService.ts';
import { sendShiftSummaryEmail } from '../../services/emailService.ts';
import { ShiftLedgerSheet } from './ShiftLedgerSheet.tsx';

interface ShiftClosingWizardProps {
  shift: Shift;
  onBack: () => void;
  onSubmitted: () => void;
}

export const ShiftClosingWizard: React.FC<ShiftClosingWizardProps> = ({
  shift,
  onBack,
  onSubmitted,
}) => {
  const { token } = useAuth();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [wizardMode, setWizardMode] = useState<'SHEET' | 'WIZARD'>('SHEET');

  // Form State
  const [opapGross, setOpapGross] = useState<string>(String(shift.opap_gross_sales || ''));
  const [opapPayouts, setOpapPayouts] = useState<string>(String(shift.opap_payouts || ''));
  const [vltsIn, setVltsIn] = useState<string>(String(shift.vlts_cash_in || ''));
  const [vltsOut, setVltsOut] = useState<string>(String(shift.vlts_cash_out || ''));
  const [scratchLotto, setScratchLotto] = useState<string>(String(shift.scratch_lotto_sales || ''));
  const [cardPayments, setCardPayments] = useState<string>(String(shift.card_payments || ''));

  const [fnbSales, setFnbSales] = useState<string>(String(shift.fnb_sales || ''));
  const [fnbCash, setFnbCash] = useState<string>(String(shift.fnb_cash || ''));
  const [fnbCard, setFnbCard] = useState<string>(String(shift.fnb_card || ''));

  const [bankDeposits, setBankDeposits] = useState<string>(String(shift.bank_deposits || ''));
  const [discrepancyThreshold, setDiscrepancyThreshold] = useState<string>(
    String(shift.discrepancy_threshold || 10.0)
  );

  // Denominations State
  const [denominations, setDenominations] = useState<Record<string, number>>(
    shift.counted_denominations || {}
  );

  // Expenses & Credits lists
  const [expenses, setExpenses] = useState<Array<Partial<ShiftExpense>>>(
    shift.expenses && shift.expenses.length > 0
      ? shift.expenses
      : []
  );

  const [customerCredits, setCustomerCredits] = useState<Array<Partial<CustomerCredit>>>(
    shift.customer_credits && shift.customer_credits.length > 0
      ? shift.customer_credits
      : []
  );

  const [employeeNotes, setEmployeeNotes] = useState<string>(shift.employee_notes || '');

  // UI state
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Calculated figures using isolated Financial Calculator service
  const expensesCashTotal = expenses.reduce(
    (acc, exp) => acc + (exp.payment_method === 'CASH' ? safeNum(exp.amount) : 0),
    0
  );

  const creditGrantedTotal = customerCredits.reduce(
    (acc, cred) => acc + (cred.type === 'GRANTED' ? safeNum(cred.amount) : 0),
    0
  );

  const creditCollectedTotal = customerCredits.reduce(
    (acc, cred) => acc + (cred.type === 'COLLECTED' ? safeNum(cred.amount) : 0),
    0
  );

  const expectedCash = calculateExpectedCash({
    opening_cash: shift.opening_cash,
    opap_gross_sales: opapGross,
    opap_payouts: opapPayouts,
    vlts_cash_in: vltsIn,
    vlts_cash_out: vltsOut,
    scratch_lotto_sales: scratchLotto,
    fnb_cash: fnbCash,
    customer_credit_collected: creditCollectedTotal,
    card_payments: cardPayments,
    expenses_paid_cash: expensesCashTotal,
    customer_credit_granted: creditGrantedTotal,
    bank_deposits: bankDeposits,
  });

  const countedCash = calculateCountedCash(denominations);
  const discResult = calculateDiscrepancy(countedCash, expectedCash, safeNum(discrepancyThreshold));

  // Autosave Draft function
  const saveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const draftPayload = {
        status: 'DRAFT_CLOSING' as any,
        opap_gross_sales: safeNum(opapGross),
        opap_payouts: safeNum(opapPayouts),
        opap_net_sales: safeNum(opapGross) - safeNum(opapPayouts),
        vlts_cash_in: safeNum(vltsIn),
        vlts_cash_out: safeNum(vltsOut),
        vlts_net: safeNum(vltsIn) - safeNum(vltsOut),
        scratch_lotto_sales: safeNum(scratchLotto),
        fnb_sales: safeNum(fnbSales),
        fnb_cash: safeNum(fnbCash),
        fnb_card: safeNum(fnbCard),
        card_payments: safeNum(cardPayments),
        expenses_paid_cash: expensesCashTotal,
        customer_credit_granted: creditGrantedTotal,
        customer_credit_collected: creditCollectedTotal,
        bank_deposits: safeNum(bankDeposits),
        counted_denominations: denominations,
        counted_cash: countedCash,
        expected_cash: expectedCash,
        discrepancy: discResult.discrepancy,
        discrepancy_percentage: discResult.discrepancyPercentage,
        discrepancy_threshold: safeNum(discrepancyThreshold),
        is_unbalanced: discResult.isUnbalanced,
        employee_notes: employeeNotes,
      };

      await updateShiftInFirestore(shift.id, draftPayload);

      try {
        await fetch(`/api/v1/shifts/${shift.id}/draft`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(draftPayload),
        });
      } catch (e) {
        // server endpoint optional fallback
      }

      setDraftSavedAt(new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.warn('Draft autosave warning:', e);
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Trigger draft save when changing step
  const handleStepChange = (newStep: number) => {
    saveDraft();
    setCurrentStep(newStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Add Expense item
  const handleAddExpense = () => {
    setExpenses([
      ...expenses,
      {
        id: 'temp_' + Date.now(),
        category: 'SUPPLIES',
        amount: 0,
        payment_method: 'CASH',
        description: '',
        receipt_url: '',
      },
    ]);
  };

  // File receipt uploader to base64
  const handleFileUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const updated = [...expenses];
        updated[index].receipt_url = reader.result as string;
        setExpenses(updated);
      };
      reader.readAsDataURL(file);
    }
  };

  // Add Customer Credit item
  const handleAddCredit = () => {
    setCustomerCredits([
      ...customerCredits,
      {
        id: 'temp_cred_' + Date.now(),
        customer_name: '',
        type: 'GRANTED',
        amount: 0,
        notes: '',
      },
    ]);
  };

  // Update Denomination Count
  const updateDenomCount = (key: string, delta: number) => {
    const current = denominations[key] || 0;
    const updated = Math.max(0, current + delta);
    setDenominations({ ...denominations, [key]: updated });
  };

  const setDenomDirect = (key: string, val: string) => {
    const parsed = parseInt(val, 10);
    setDenominations({
      ...denominations,
      [key]: isNaN(parsed) || parsed < 0 ? 0 : parsed,
    });
  };

  // Final Shift Submission
  const handleSubmitShift = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const submitPayload = {
        status: 'SUBMITTED' as any,
        closed_at: new Date().toISOString(),
        opap_gross_sales: safeNum(opapGross),
        opap_payouts: safeNum(opapPayouts),
        opap_net_sales: safeNum(opapGross) - safeNum(opapPayouts),
        vlts_cash_in: safeNum(vltsIn),
        vlts_cash_out: safeNum(vltsOut),
        vlts_net: safeNum(vltsIn) - safeNum(vltsOut),
        scratch_lotto_sales: safeNum(scratchLotto),
        fnb_sales: safeNum(fnbSales),
        fnb_cash: safeNum(fnbCash),
        fnb_card: safeNum(fnbCard),
        card_payments: safeNum(cardPayments),
        expenses_paid_cash: expensesCashTotal,
        customer_credit_granted: creditGrantedTotal,
        customer_credit_collected: creditCollectedTotal,
        bank_deposits: safeNum(bankDeposits),
        counted_denominations: denominations,
        counted_cash: countedCash,
        expected_cash: expectedCash,
        discrepancy: discResult.discrepancy,
        discrepancy_percentage: discResult.discrepancyPercentage,
        discrepancy_threshold: safeNum(discrepancyThreshold),
        is_unbalanced: discResult.isUnbalanced,
        employee_notes: employeeNotes,
      };

      await updateShiftInFirestore(shift.id, submitPayload);

      // Trigger automated shift closing summary email to owner/manager
      try {
        await sendShiftSummaryEmail(
          {
            ...submitPayload,
            store_name: shift.store_name,
            shift_type: shift.shift_type === 'MORNING' ? 'Πρωινή Βάρδια' : 'Απογευματινή / Βραδινή',
            closed_by_user_name: shift.closed_by_user_name || 'Υπάλληλος Βάρδιας',
          },
          'owner@shiftledger.gr'
        );
      } catch (emailErr) {
        console.warn('Shift closing summary email notification warning:', emailErr);
      }

      try {
        await fetch(`/api/v1/shifts/${shift.id}/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(submitPayload),
        });
      } catch (e) {
        // server endpoint fallback
      }

      onSubmitted();
    } catch (err: any) {
      setError(err.message || 'Σφάλμα κατά την υποβολή βάρδιας');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { num: 1, name: 'Έναρξη', icon: Building2 },
    { num: 2, name: 'ΟΠΑΠ & VLTs', icon: Ticket },
    { num: 3, name: 'FnB & Έξοδα', icon: Coffee },
    { num: 4, name: 'Καταμέτρηση', icon: Coins },
    { num: 5, name: 'Επιβεβαίωση', icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-2xs"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Επιστροφή στις Βάρδιες</span>
        </button>

        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              onClick={() => setWizardMode('SHEET')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                wizardMode === 'SHEET'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Φύλλο Αναφοράς
            </button>
            <button
              onClick={() => setWizardMode('WIZARD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                wizardMode === 'WIZARD'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Οδηγός Βήμα-Βήμα
            </button>
          </div>

          {draftSavedAt && (
            <span className="text-xs text-slate-500 hidden sm:inline-block">
              Πρόχειρο αποθηκεύτηκε {draftSavedAt}
            </span>
          )}
          <button
            onClick={saveDraft}
            disabled={isSavingDraft}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-indigo-600" />
            <span>{isSavingDraft ? 'Αποθήκευση...' : 'Αποθήκευση Προχείρου'}</span>
          </button>
        </div>
      </div>

      {wizardMode === 'SHEET' ? (
        <div className="space-y-6">
          <ShiftLedgerSheet
            shift={shift}
            readOnly={false}
            onValuesChange={(vals) => {
              if (vals.scratch_lotto_sales) setScratchLotto(String(vals.scratch_lotto_sales));
              if (vals.fnb_cash) setFnbCash(String(vals.fnb_cash));
              if (vals.fnb_card) setFnbCard(String(vals.fnb_card));
              if (vals.card_payments) setCardPayments(String(vals.card_payments));
              if (vals.counted_denominations) setDenominations(vals.counted_denominations);
            }}
          />

          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-600 font-medium">
              Έτοιμοι για υποβολή; Επιβεβαιώστε τα στοιχεία της αναφοράς βάρδιας.
            </span>
            <button
              onClick={handleSubmitShift}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center space-x-2 shadow-md transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Υποβολή...' : 'Οριστική Υποβολή Βάρδιας'}</span>
            </button>
          </div>
        </div>
      ) : (
        <>


      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {shift.store_name} ({shift.register_id})
              </span>
              <span className="text-xs text-slate-400 font-mono">
                ID: {shift.id.substring(0, 12)}
              </span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">Οδηγός Κλεισίματος Βάρδιας</h2>
            <p className="text-xs text-slate-300 mt-1">
              Καταχωρήστε τις εισπράξεις, τα δελτία, τα έξοδα και καταμετρήστε τα μετρητά.
            </p>
          </div>

          {/* Real-time Summary Card Header */}
          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 flex items-center space-x-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Αναμενόμενο Ταμείο</p>
              <p className="text-lg font-black text-emerald-400">{expectedCash.toFixed(2)} €</p>
            </div>
            <div className="h-8 w-px bg-slate-700"></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Καταμετρημένο</p>
              <p className="text-lg font-black text-indigo-300">{countedCash.toFixed(2)} €</p>
            </div>
          </div>
        </div>

        {/* Mobile Multi-step Indicator */}
        <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-5 gap-1 sm:gap-2">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.num;
            const isDone = currentStep > step.num;

            return (
              <button
                key={step.num}
                onClick={() => handleStepChange(step.num)}
                className={`flex flex-col items-center p-2 rounded-xl text-center transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : isDone
                    ? 'bg-slate-800 text-emerald-400 font-medium'
                    : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 mb-1" />
                <span className="text-[11px] truncate w-full hidden sm:inline">{step.name}</span>
                <span className="text-[10px] font-mono sm:hidden">{step.num}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Σφάλμα Υποβολής</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* STEP 1: OPENING & OPERATIONAL SUMMARY */}
      {currentStep === 1 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              <span>Βήμα 1: Στοιχεία Έναρξης & Ταμείου</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Επιβεβαιώστε το αρχικό ποσό ταμείου που παραδόθηκε κατά την έναρξη της βάρδιας.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Αρχικό Ταμείο (Opening Cash Float)
              </span>
              <p className="text-2xl font-black text-slate-900">
                {Number(shift.opening_cash).toFixed(2)} €
              </p>
              <p className="text-xs text-slate-500">
                Aρχικό απόθεμα ψιλών στο ταμείο κατά το άνοιγμα.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Τύπος & Χρόνος Έναρξης
              </span>
              <p className="text-base font-bold text-slate-900">
                {shift.shift_type === 'MORNING'
                  ? 'Πρωινή Βάρδια'
                  : shift.shift_type === 'AFTERNOON'
                  ? 'Απογευματινή Βάρδια'
                  : 'Βραδινή / Ειδική'}
              </p>
              <p className="text-xs text-slate-500 font-mono">
                Ανοίχτηκε: {new Date(shift.opened_at).toLocaleString('el-GR')}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Όριο Αποδεκτής Απόκλισης Ταμείου (€ Threshold)
            </label>
            <input
              type="number"
              step="1"
              value={discrepancyThreshold}
              onChange={(e) => setDiscrepancyThreshold(e.target.value)}
              className="w-full max-w-xs px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Αποκλίσεις μεγαλύτερες από αυτό το ποσό θα επισημανθούν ως προειδοποίηση στον υπεύθυνο.
            </p>
          </div>
        </div>
      )}

      {/* STEP 2: OPAP TRANSACTION CATEGORIES */}
      {currentStep === 2 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Ticket className="w-5 h-5 text-indigo-600" />
              <span>Βήμα 2: Παιχνίδια ΟΠΑΠ & Τερματικά VLTs</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Καταχωρήστε τις ακαθάριστες εισπράξεις, τις πληρωμές κερδών και τις κάρτες POS.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* OPAP Gross Sales */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Ακαθάριστες Πωλήσεις ΟΠΑΠ (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={opapGross}
                onChange={(e) => setOpapGross(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* OPAP Payouts */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Πληρωμές Κερδών Δελτίων (€ Payouts)
              </label>
              <input
                type="number"
                step="0.01"
                value={opapPayouts}
                onChange={(e) => setOpapPayouts(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-rose-600 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* VLTs Cash In */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                PLAY VLTs Cash-In (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={vltsIn}
                onChange={(e) => setVltsIn(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* VLTs Cash Out */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                PLAY VLTs Cash-Out / Ticket Payouts (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={vltsOut}
                onChange={(e) => setVltsOut(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-rose-600 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Scratch & Lotto */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Σκρατς & Λαχεία (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={scratchLotto}
                onChange={(e) => setScratchLotto(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* POS Card Payments */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Πληρωμές με Κάρτα POS (€ Card Deductions)
              </label>
              <input
                type="number"
                step="0.01"
                value={cardPayments}
                onChange={(e) => setCardPayments(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Εισπράξεις μέσω τερματικού POS που ΔΕΝ εισήλθαν ως μετρητά στο συρτάρι.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: FnB, EXPENSES & CUSTOMER CREDITS */}
      {currentStep === 3 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-8">
          {/* FnB Sales */}
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Coffee className="w-5 h-5 text-indigo-600" />
                <span>Πωλήσεις Καφέ & Αναψυκτηρίου (FnB)</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Συνολικές Πωλήσεις FnB (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fnbSales}
                  onChange={(e) => setFnbSales(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Μετρητά FnB (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fnbCash}
                  onChange={(e) => setFnbCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-emerald-600 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Κάρτες FnB (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fnbCard}
                  onChange={(e) => setFnbCard(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Daily Expenses & Receipt Upload */}
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-indigo-600" />
                <span>Ημερήσια Έξοδα & Αποδείξεις</span>
              </h3>
              <button
                type="button"
                onClick={handleAddExpense}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold text-xs flex items-center space-x-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Προσθήκη Εξόδου</span>
              </button>
            </div>

            {expenses.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                Δεν έχουν καταχωρηθεί έξοδα για αυτή τη βάρδια.
              </p>
            ) : (
              <div className="space-y-3">
                {expenses.map((exp, idx) => (
                  <div
                    key={exp.id || idx}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                  >
                    <div className="sm:col-span-3">
                      <select
                        value={exp.category || 'SUPPLIES'}
                        onChange={(e) => {
                          const updated = [...expenses];
                          updated[idx].category = e.target.value;
                          setExpenses(updated);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 bg-white"
                      >
                        <option value="SUPPLIES">Αναλώσιμα / Χαρτί</option>
                        <option value="UTILITIES">Λογαριασμοί / ΔΕΗ</option>
                        <option value="CLEANING">Καθαριότητα</option>
                        <option value="MAINTENANCE">Συντήρηση</option>
                        <option value="OTHER">Άλλο Έξοδο</option>
                      </select>
                    </div>

                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Περιγραφή εξόδου..."
                        value={exp.description || ''}
                        onChange={(e) => {
                          const updated = [...expenses];
                          updated[idx].description = e.target.value;
                          setExpenses(updated);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-900 bg-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Ποσό €"
                        value={exp.amount || ''}
                        onChange={(e) => {
                          const updated = [...expenses];
                          updated[idx].amount = parseFloat(e.target.value) || 0;
                          setExpenses(updated);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 bg-white"
                      />
                    </div>

                    <div className="sm:col-span-2 flex items-center space-x-2">
                      <label className="cursor-pointer p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-indigo-600 hover:border-indigo-300 transition-colors flex items-center space-x-1 text-xs">
                        <Upload className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold">
                          {exp.receipt_url ? 'Απόδειξη ✓' : 'Ανέβασμα'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(idx, e)}
                          className="hidden"
                        />
                      </label>

                      {exp.receipt_url && (
                        <img
                          src={exp.receipt_url}
                          alt="Receipt"
                          className="w-7 h-7 rounded border border-slate-300 object-cover"
                        />
                      )}
                    </div>

                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setExpenses(expenses.filter((_, i) => i !== idx))}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Customer Credit Feature */}
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                <span>Πιστώσεις Πελατών (Customer Credit)</span>
              </h3>
              <button
                type="button"
                onClick={handleAddCredit}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold text-xs flex items-center space-x-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Προσθήκη Πίστωσης</span>
              </button>
            </div>

            {customerCredits.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                Δεν υπάρχουν καταχωρημένες πιστώσεις/εισπράξεις πελατών.
              </p>
            ) : (
              <div className="space-y-3">
                {customerCredits.map((cred, idx) => (
                  <div
                    key={cred.id || idx}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                  >
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Όνομα Πελάτη..."
                        value={cred.customer_name || ''}
                        onChange={(e) => {
                          const updated = [...customerCredits];
                          updated[idx].customer_name = e.target.value;
                          setCustomerCredits(updated);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-900 bg-white"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <select
                        value={cred.type || 'GRANTED'}
                        onChange={(e) => {
                          const updated = [...customerCredits];
                          updated[idx].type = e.target.value as 'GRANTED' | 'COLLECTED';
                          setCustomerCredits(updated);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 bg-white"
                      >
                        <option value="GRANTED">Νέα Πίστωση (Χρέωση)</option>
                        <option value="COLLECTED">Είσπραξη Πίστωσης</option>
                      </select>
                    </div>

                    <div className="sm:col-span-4">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Ποσό €"
                        value={cred.amount || ''}
                        onChange={(e) => {
                          const updated = [...customerCredits];
                          updated[idx].amount = parseFloat(e.target.value) || 0;
                          setCustomerCredits(updated);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 bg-white"
                      />
                    </div>

                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setCustomerCredits(customerCredits.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bank Deposits */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Καταθέσεις σε Χρηματοκιβώτιο / Τράπεζα (€ Bank Drops)
            </label>
            <input
              type="number"
              step="0.01"
              value={bankDeposits}
              onChange={(e) => setBankDeposits(e.target.value)}
              placeholder="0.00"
              className="w-full max-w-sm px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      {/* STEP 4: EUR DENOMINATION CASH COUNTER */}
      {currentStep === 4 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Coins className="w-5 h-5 text-indigo-600" />
                <span>Βήμα 4: Καταμέτρηση Μετρητών Ταμείου (EUR Denominations)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Εισάγετε το πλήθος των χαρτονομισμάτων και κερμάτων.
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                Σύνολο Καταμέτρησης
              </span>
              <span className="text-xl font-black text-indigo-600">{countedCash.toFixed(2)} €</span>
            </div>
          </div>

          {/* Denomination Counter Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {EUR_DENOMINATIONS.map((denom) => {
              const count = denominations[denom.key] || 0;
              const subtotal = (count * denom.value).toFixed(2);

              return (
                <div
                  key={denom.key}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-2 hover:border-indigo-200 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-slate-900">{denom.label}</span>
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {subtotal} €
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => updateDenomCount(denom.key, -1)}
                      className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all text-sm flex items-center justify-center shadow-2xs"
                    >
                      -
                    </button>

                    <input
                      type="number"
                      value={count || ''}
                      onChange={(e) => setDenomDirect(denom.key, e.target.value)}
                      placeholder="0"
                      className="flex-1 px-2 py-1.5 text-center text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />

                    <button
                      type="button"
                      onClick={() => updateDenomCount(denom.key, 1)}
                      className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 active:scale-95 transition-all text-sm flex items-center justify-center shadow-2xs"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDenomCount(denom.key, 5)}
                      className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 text-xs transition-colors"
                    >
                      +5
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 5: REVIEW, RECONCILIATION & SUBMISSION */}
      {currentStep === 5 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-600" />
              <span>Βήμα 5: Τελική Επισκόπηση & Υποβολή Βάρδιας</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Ελέγξτε τους υπολογισμούς και υποβάλετε τη βάρδια. Μετά την υποβολή, η βάρδια
              κατοχυρώνεται.
            </p>
          </div>

          {/* Financial Reconciliation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Expected Cash Card */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Αναμενόμενο Ταμείο (Expected)
              </span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {expectedCash.toFixed(2)} €
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Υπολογισμένο από αρχικό float & καθαρές κινήσεις.
              </p>
            </div>

            {/* Counted Cash Card */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Καταμετρημένο Ταμείο (Counted)
              </span>
              <p className="text-2xl font-black text-indigo-700 mt-1">
                {countedCash.toFixed(2)} €
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Άθροισμα καταμετρημένων χαρτονομισμάτων/κερμάτων.
              </p>
            </div>

            {/* Discrepancy Card */}
            <div
              className={`p-4 rounded-xl border ${
                discResult.isExceedingThreshold
                  ? 'bg-rose-50 border-rose-300'
                  : discResult.isUnbalanced
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-emerald-50 border-emerald-300'
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-wider block text-slate-700">
                Απόκλιση Ταμείου (Discrepancy)
              </span>
              <p
                className={`text-2xl font-black mt-1 ${
                  discResult.discrepancy < 0
                    ? 'text-rose-700'
                    : discResult.discrepancy > 0
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}
              >
                {discResult.discrepancy > 0 ? '+' : ''}
                {discResult.discrepancy.toFixed(2)} €
              </p>
              <p className="text-[11px] font-bold mt-1">
                {discResult.isExceedingThreshold ? (
                  <span className="text-rose-700 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 inline" />
                    <span>Υπερβαίνει το όριο ({discrepancyThreshold} €)</span>
                  </span>
                ) : discResult.isUnbalanced ? (
                  <span className="text-amber-700">Μικρή απόκλιση εντός ορίου</span>
                ) : (
                  <span className="text-emerald-700">✓ Απόλυτα ισοσκελισμένο ταμείο</span>
                )}
              </p>
            </div>
          </div>

          {/* Detailed Financial Ledger Breakdown Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-slate-100 px-4 py-2.5 font-bold text-slate-800 border-b border-slate-200">
              Αναλυτικός Υπολογισμός Ισοζυγίου
            </div>
            <div className="divide-y divide-slate-100 bg-white">
              <div className="px-4 py-2 flex justify-between">
                <span className="text-slate-600">Αρχικό Ταμείο (Opening Float)</span>
                <span className="font-bold text-slate-900">{shift.opening_cash.toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2 flex justify-between">
                <span className="text-slate-600">(+) Ακαθάριστες Πωλήσεις ΟΠΑΠ</span>
                <span className="font-bold text-emerald-700">+{safeNum(opapGross).toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2 flex justify-between">
                <span className="text-slate-600">(-) Πληρωμές Κερδών ΟΠΑΠ</span>
                <span className="font-bold text-rose-600">-{safeNum(opapPayouts).toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2 flex justify-between">
                <span className="text-slate-600">(+) PLAY VLTs Net (Cash-in - Cash-out)</span>
                <span className="font-bold text-emerald-700">
                  +{(safeNum(vltsIn) - safeNum(vltsOut)).toFixed(2)} €
                </span>
              </div>
              <div className="px-4 py-2 flex justify-between">
                <span className="text-slate-600">(+) Μετρητά FnB & Σκρατς/Λαχεία</span>
                <span className="font-bold text-emerald-700">
                  +{(safeNum(fnbCash) + safeNum(scratchLotto)).toFixed(2)} €
                </span>
              </div>
              <div className="px-4 py-2 flex justify-between">
                <span className="text-slate-600">(-) Αφαιρέσεις Καρτών POS & Εξόδων</span>
                <span className="font-bold text-rose-600">
                  -{(safeNum(cardPayments) + expensesCashTotal).toFixed(2)} €
                </span>
              </div>
              <div className="px-4 py-2 flex justify-between bg-slate-50 font-bold border-t border-slate-200">
                <span className="text-slate-900">Συνολικό Αναμενόμενο Υπόλοιπο Ταμείου</span>
                <span className="text-slate-900 text-sm">{expectedCash.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Employee Closing Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Σημειώσεις Υπαλλήλου Κλεισίματος
            </label>
            <textarea
              value={employeeNotes}
              onChange={(e) => setEmployeeNotes(e.target.value)}
              placeholder="Αιτιολογήστε τυχόν αποκλίσεις ή ειδικά συμβάντα της βάρδιας..."
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Immutable warning text */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Προσοχή:</strong> Με την υποβολή, η βάρδια κλειδώνει και γίνεται αμετάβλητη
              για τον υπάλληλο.
            </span>
          </div>
        </div>
      )}

      {/* Navigation Footer Controls */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          type="button"
          disabled={currentStep === 1}
          onClick={() => handleStepChange(currentStep - 1)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold text-xs text-slate-700 transition-colors disabled:opacity-40 flex items-center space-x-1"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Προηγούμενο</span>
        </button>

        {currentStep < 5 ? (
          <button
            type="button"
            onClick={() => handleStepChange(currentStep + 1)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center space-x-1"
          >
            <span>Επόμενο Βήμα</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmitShift}
            disabled={isSubmitting}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md transition-all flex items-center space-x-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Υποβολή...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Οριστική Υποβολή Βάρδιας</span>
              </>
            )}
          </button>
        )}
      </div>
      </>
      )}
    </div>
  );
};

