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
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  ScratchCalculatorTable,
  DEFAULT_SCRATCH_PRESETS,
  ScratchTicketRow,
  calculateRowTotal,
} from './ScratchCalculatorTable.tsx';

export interface ToraPosItem {
  id: string;
  name: string;
  amount: string;
}
import {
  EUR_DENOMINATIONS,
  calculateCountedCash,
  calculateDiscrepancy,
  calculateExpectedCash,
  calculateTotalReconciliationCount,
  safeNum,
  roundCurrency,
} from '../../services/financialCalculator.ts';
import { CashDenominationCounter } from './CashDenominationCounter.tsx';
import { Shift, ShiftExpense, CustomerCredit } from '../../types/index.ts';
import { updateShiftInFirestore } from '../../services/shiftService.ts';
import { sendShiftSummaryEmail } from '../../services/emailService.ts';

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
  const { token, roles, permissions } = useAuth();
  const canManage =
    roles.some(
      (r) =>
        r.code === 'STORE_MANAGER' ||
        r.code === 'ORG_OWNER' ||
        r.code === 'PLATFORM_ADMIN' ||
        r.code === 'ORG_ADMIN'
    ) ||
    permissions.includes('*') ||
    permissions.includes('store.view');

  const [managerUnlockedPos, setManagerUnlockedPos] = useState<boolean>(canManage);
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1 - Opening Cash Breakdown State (Banknotes + Coins)
  const initialOpeningCash = Number(shift.opening_cash || 200);
  const [openingNotesAmount, setOpeningNotesAmount] = useState<string>(
    shift.opening_cash_notes !== undefined
      ? String(shift.opening_cash_notes)
      : String(Math.floor(initialOpeningCash))
  );
  const [openingCoinsAmount, setOpeningCoinsAmount] = useState<string>(
    shift.opening_cash_coins !== undefined
      ? String(shift.opening_cash_coins)
      : String(roundCurrency(initialOpeningCash - Math.floor(initialOpeningCash)))
  );

  const openingCashTotal = safeNum(openingNotesAmount) + safeNum(openingCoinsAmount);

  // Step 2 - Granular OPAP Reports State
  // 1. Ελληνικά Λαχεία | Σκρατς
  const [scratchRows, setScratchRows] = useState<ScratchTicketRow[]>(() => {
    const saved = shift.custom_field_values?.scratch_ticket_items;
    if (Array.isArray(saved) && saved.length > 0) {
      if (saved.length <= 6) {
        return DEFAULT_SCRATCH_PRESETS.map((preset) => {
          const match = saved.find((s: any) => s.id === preset.id || s.name === preset.name);
          return match ? { ...preset, startNo: match.startNo || '', endNo: match.endNo || '' } : preset;
        });
      }
      return saved;
    }
    return DEFAULT_SCRATCH_PRESETS;
  });

  const [scratchSales, setScratchSales] = useState<string>(() => {
    if (shift.scratch_sales !== undefined && shift.scratch_sales > 0) {
      return String(shift.scratch_sales);
    }
    if (shift.scratch_lotto_sales !== undefined && shift.scratch_lotto_sales > 0) {
      return String(shift.scratch_lotto_sales);
    }
    const initialCalc = (Array.isArray(shift.custom_field_values?.scratch_ticket_items)
      ? shift.custom_field_values.scratch_ticket_items
      : DEFAULT_SCRATCH_PRESETS
    ).reduce((sum, r) => sum + calculateRowTotal(r), 0);
    return initialCalc > 0 ? String(initialCalc) : '';
  });

  const [scratchPayouts, setScratchPayouts] = useState<string>(
    shift.scratch_payouts !== undefined ? String(shift.scratch_payouts) : ''
  );

  const handleScratchRowsChange = (newRows: ScratchTicketRow[]) => {
    setScratchRows(newRows);
    const calc = newRows.reduce((sum, r) => sum + calculateRowTotal(r), 0);
    setScratchSales(calc.toFixed(2));
  };

  // 2a. Store POS Items (Πωλήσεις POS Καταστήματος / POS Καταμέτρησης - Manager controllable)
  const [storePosItems, setStorePosItems] = useState<ToraPosItem[]>(() => {
    const saved = shift.custom_field_values?.store_pos_items;
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    return [
      {
        id: 'store_pos_1',
        name: 'Pos #1',
        amount: shift.card_payments ? String(shift.card_payments) : '',
      },
      {
        id: 'store_pos_2',
        name: 'Pos #2',
        amount: '',
      },
    ];
  });

  const handleUpdateStorePosItem = (id: string, field: 'name' | 'amount', value: string) => {
    setStorePosItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleAddStorePosItem = () => {
    const newPosNumber = storePosItems.length + 1;
    setStorePosItems((prev) => [
      ...prev,
      {
        id: `store_pos_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        name: `Pos #${newPosNumber}`,
        amount: '',
      },
    ]);
  };

  const handleRemoveStorePosItem = (id: string) => {
    if (storePosItems.length <= 1) return;
    setStorePosItems((prev) => prev.filter((item) => item.id !== id));
  };

  // 2b. Tora Direct POS Items (Υπηρεσίες Tora Direct)
  const [toraPosItems, setToraPosItems] = useState<ToraPosItem[]>(() => {
    const saved = shift.custom_field_values?.tora_pos_items;
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    return [
      {
        id: 'tora_1',
        name: 'Tora #1',
        amount: shift.tora_pos1 !== undefined && shift.tora_pos1 !== 0 ? String(shift.tora_pos1) : '',
      },
      {
        id: 'tora_2',
        name: 'Tora #2',
        amount: shift.tora_pos2 !== undefined && shift.tora_pos2 !== 0 ? String(shift.tora_pos2) : '',
      },
    ];
  });

  const handleUpdatePosItem = (id: string, field: 'name' | 'amount', value: string) => {
    setToraPosItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleAddPosItem = () => {
    const newPosNumber = toraPosItems.length + 1;
    setToraPosItems((prev) => [
      ...prev,
      {
        id: `tora_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        name: `Tora #${newPosNumber}`,
        amount: '',
      },
    ]);
  };

  const handleRemovePosItem = (id: string) => {
    if (toraPosItems.length <= 1) return;
    setToraPosItems((prev) => prev.filter((item) => item.id !== id));
  };

  // 3. Clever Point
  const [cleverPointTotal, setCleverPointTotal] = useState<string>(
    shift.clever_point_total !== undefined ? String(shift.clever_point_total) : ''
  );

  // 4. Ιππόδρομος
  const [ippodromosBalance, setIppodromosBalance] = useState<string>(
    shift.ippodromos_balance !== undefined ? String(shift.ippodromos_balance) : ''
  );

  // 5. VLTs
  const initialVltsOut = shift.vlts_cash_out !== undefined ? Number(shift.vlts_cash_out) : 0;
  const [vltsIn, setVltsIn] = useState<string>(String(shift.vlts_cash_in || ''));
  const [vltsOut, setVltsOut] = useState<string>(
    initialVltsOut !== 0 ? String(Math.abs(initialVltsOut)) : ''
  );
  const [vltsOutType, setVltsOutType] = useState<'NEGATIVE' | 'POSITIVE'>(
    initialVltsOut < 0 ? 'POSITIVE' : 'NEGATIVE'
  );

  // 6. Pame Stoixima | Virtuals
  const [pameStoiximaBalance, setPameStoiximaBalance] = useState<string>(
    shift.pame_stoixima_balance !== undefined ? String(shift.pame_stoixima_balance) : ''
  );

  // 7. Αριθμοπαιχνίδια (KINO, Τζόκερ, κλπ.)
  const [arithmoGross, setArithmoGross] = useState<string>(
    shift.arithmo_gross !== undefined ? String(shift.arithmo_gross) : String(shift.opap_gross_sales || '')
  );
  const [arithmoCancels, setArithmoCancels] = useState<string>(
    shift.arithmo_cancels !== undefined ? String(shift.arithmo_cancels) : ''
  );
  const [arithmoPayouts, setArithmoPayouts] = useState<string>(
    shift.arithmo_payouts !== undefined ? String(shift.arithmo_payouts) : String(shift.opap_payouts || '')
  );
  const [arithmoVouchers, setArithmoVouchers] = useState<string>(
    shift.arithmo_vouchers !== undefined ? String(shift.arithmo_vouchers) : ''
  );

  // FnB State
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

  // Computed Section Totals
  const totalScratchNet = safeNum(scratchSales) - safeNum(scratchPayouts);
  const totalStorePos = storePosItems.reduce((acc, item) => acc + safeNum(item.amount), 0);
  const totalToraPos = toraPosItems.reduce((acc, item) => acc + safeNum(item.amount), 0);
  const totalArithmoNet =
    safeNum(arithmoGross) - safeNum(arithmoCancels) - safeNum(arithmoPayouts) + safeNum(arithmoVouchers);

  const opapGrossTotal =
    safeNum(arithmoGross) -
    safeNum(arithmoCancels) +
    safeNum(pameStoiximaBalance) +
    safeNum(cleverPointTotal) +
    safeNum(ippodromosBalance);

  const opapPayoutsTotal = safeNum(arithmoPayouts) - safeNum(arithmoVouchers);

  // Calculated figures using isolated Financial Calculator service
  const expensesCashTotal = expenses.reduce(
    (acc, exp) => acc + (exp.payment_method === 'CASH' ? safeNum(exp.amount) : 0),
    0
  );

  const expensesTotal = expenses.reduce(
    (acc, exp) => acc + safeNum(exp.amount),
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

  const effectiveVltsOutflow = vltsOutType === 'NEGATIVE' ? safeNum(vltsOut) : 0;
  const effectiveVltsInflow = vltsOutType === 'POSITIVE' ? safeNum(vltsOut) : 0;
  const signedVltsOut = vltsOutType === 'NEGATIVE' ? safeNum(vltsOut) : -safeNum(vltsOut);

  const expectedCash = calculateExpectedCash({
    opening_cash: openingCashTotal,
    opap_gross_sales: opapGrossTotal,
    opap_payouts: opapPayoutsTotal,
    vlts_cash_in: safeNum(vltsIn) + effectiveVltsInflow,
    vlts_cash_out: effectiveVltsOutflow,
    scratch_lotto_sales: totalScratchNet,
    fnb_cash: fnbCash,
    customer_credit_collected: creditCollectedTotal,
    card_payments: totalStorePos,
    expenses_paid_cash: expensesCashTotal,
    customer_credit_granted: creditGrantedTotal,
    bank_deposits: bankDeposits,
  });

  const countedCash = calculateCountedCash(denominations);
  const discResult = calculateDiscrepancy(countedCash, expectedCash, safeNum(discrepancyThreshold));

  // Formula requested by user for Σύνολο Καταμέτρησης:
  // (Μετρημένα στο συρτάρι) + (Πωλήσεις POS #x Καταστήματος) + (Όλα τα έξοδα) + (Πιστώσεις Πελατών) - (Επιστροφές Πελατών) - (Αρχικό Κεφάλαιο)
  const totalReconciliationCount = calculateTotalReconciliationCount({
    openingCash: openingCashTotal,
    countedCashInDrawer: countedCash,
    posSalesTotal: totalStorePos,
    expensesTotal: expensesTotal,
    bankDeposits: bankDeposits,
    customerCreditsGranted: creditGrantedTotal,
    customerReturns: creditCollectedTotal,
  });

  // Autosave Draft function
  const saveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const draftPayload = {
        // draft payload
        status: 'DRAFT_CLOSING' as any,
        opening_cash: openingCashTotal,
        opening_cash_notes: safeNum(openingNotesAmount),
        opening_cash_coins: safeNum(openingCoinsAmount),

        arithmo_gross: safeNum(arithmoGross),
        arithmo_cancels: safeNum(arithmoCancels),
        arithmo_payouts: safeNum(arithmoPayouts),
        arithmo_vouchers: safeNum(arithmoVouchers),
        pame_stoixima_balance: safeNum(pameStoiximaBalance),
        scratch_sales: safeNum(scratchSales),
        scratch_payouts: safeNum(scratchPayouts),
        tora_pos1: safeNum(toraPosItems[0]?.amount),
        tora_pos2: safeNum(toraPosItems[1]?.amount),
        clever_point_total: safeNum(cleverPointTotal),
        ippodromos_balance: safeNum(ippodromosBalance),

        opap_gross_sales: opapGrossTotal,
        opap_payouts: opapPayoutsTotal,
        opap_net_sales: opapGrossTotal - opapPayoutsTotal,
        vlts_cash_in: safeNum(vltsIn),
        vlts_cash_out: signedVltsOut,
        vlts_net: safeNum(vltsIn) - signedVltsOut,
        scratch_lotto_sales: totalScratchNet,
        fnb_sales: safeNum(fnbSales),
        fnb_cash: safeNum(fnbCash),
        fnb_card: safeNum(fnbCard),
        card_payments: totalStorePos,
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
        custom_field_values: {
          ...(shift.custom_field_values || {}),
          scratch_ticket_items: scratchRows,
          store_pos_items: storePosItems,
          tora_pos_items: toraPosItems,
          total_reconciliation_count: totalReconciliationCount,
        },
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
        opening_cash: openingCashTotal,
        opening_cash_notes: safeNum(openingNotesAmount),
        opening_cash_coins: safeNum(openingCoinsAmount),

        arithmo_gross: safeNum(arithmoGross),
        arithmo_cancels: safeNum(arithmoCancels),
        arithmo_payouts: safeNum(arithmoPayouts),
        arithmo_vouchers: safeNum(arithmoVouchers),
        pame_stoixima_balance: safeNum(pameStoiximaBalance),
        scratch_sales: safeNum(scratchSales),
        scratch_payouts: safeNum(scratchPayouts),
        tora_pos1: safeNum(toraPosItems[0]?.amount),
        tora_pos2: safeNum(toraPosItems[1]?.amount),
        clever_point_total: safeNum(cleverPointTotal),
        ippodromos_balance: safeNum(ippodromosBalance),

        opap_gross_sales: opapGrossTotal,
        opap_payouts: opapPayoutsTotal,
        opap_net_sales: opapGrossTotal - opapPayoutsTotal,
        vlts_cash_in: safeNum(vltsIn),
        vlts_cash_out: signedVltsOut,
        vlts_net: safeNum(vltsIn) - signedVltsOut,
        scratch_lotto_sales: totalScratchNet,
        fnb_sales: safeNum(fnbSales),
        fnb_cash: safeNum(fnbCash),
        fnb_card: safeNum(fnbCard),
        card_payments: totalStorePos,
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
        custom_field_values: {
          ...(shift.custom_field_values || {}),
          scratch_ticket_items: scratchRows,
          store_pos_items: storePosItems,
          tora_pos_items: toraPosItems,
          total_reconciliation_count: totalReconciliationCount,
        },
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

      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {shift.store_name} • {shift.register_id}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {shift.shift_type === 'MORNING' ? '☀️ Πρωινή' : '🌙 Απογευματινή'}
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight">Οδηγός Καταχώρησης Βάρδιας</h2>
            <p className="text-xs text-slate-300 mt-1">
              Ακολουθήστε τα απλά βήματα για να καταγράψετε τα έσοδα, τα έξοδα και τα μετρητά του ταμείου.
            </p>
          </div>

          {/* Real-time Summary Card Header */}
          <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700 flex items-center space-x-5 shadow-inner">
            <div className="text-right sm:text-left">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Αναμενόμενο Ταμείο</p>
              <p className="text-xl font-black text-emerald-400">{expectedCash.toFixed(2)} €</p>
            </div>
            <div className="h-10 w-px bg-slate-700"></div>
            <div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Μετρημένα</p>
              <p className="text-xl font-black text-indigo-300">{countedCash.toFixed(2)} €</p>
            </div>
          </div>
        </div>

        {/* Step Indicator Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-5 gap-2">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.num;
            const isDone = currentStep > step.num;

            return (
              <button
                key={step.num}
                onClick={() => handleStepChange(step.num)}
                className={`flex flex-col items-center py-2.5 px-2 rounded-2xl text-center transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white font-extrabold shadow-md scale-102 ring-2 ring-indigo-400'
                    : isDone
                    ? 'bg-slate-800/80 text-emerald-400 font-bold hover:bg-slate-800'
                    : 'bg-slate-800/30 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 mb-1" />
                <span className="text-xs truncate w-full hidden sm:inline">{step.name}</span>
                <span className="text-[11px] font-bold sm:hidden">{step.num}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start space-x-3 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold text-sm">Προσοχή</p>
            <p className="font-medium mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* STEP 1: OPENING & OPERATIONAL SUMMARY */}
      {currentStep === 1 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">1</span>
                <span>Έναρξη Βάρδιας & Αρχικό Ταμείο</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Ελέγξτε & επιβεβαιώστε την κατανομή μετρητών + κερμάτων στο αρχικό ταμείο.
              </p>
            </div>
            <span className="text-sm font-black text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
              Αρχικό Σύνολο: {openingCashTotal.toFixed(2)} €
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Banknotes + Coins breakdown */}
            <div className="p-5 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
              <span className="text-xs font-extrabold text-indigo-900 uppercase tracking-wider block">
                💵 Κατανομή Αρχικού Ταμείου (Float)
              </span>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Χαρτονομίσματα (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingNotesAmount}
                    onChange={(e) => setOpeningNotesAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Κέρματα / Ψιλά (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingCoinsAmount}
                    onChange={(e) => setOpeningCoinsAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-white rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Σύνολο Αρχικών Μετρητών:</span>
                <span className="font-black text-indigo-900 text-sm">{openingCashTotal.toFixed(2)} €</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider block">
                🕒 Τύπος & Ώρα Έναρξης
              </span>
              <p className="text-lg font-black text-slate-900">
                {shift.shift_type === 'MORNING'
                  ? 'Πρωινή Βάρδια'
                  : shift.shift_type === 'AFTERNOON'
                  ? 'Απογευματινή Βάρδια'
                  : 'Βραδινή / Ειδική'}
              </p>
              <p className="text-xs text-slate-500 font-mono">
                Έναρξη: {new Date(shift.opened_at).toLocaleString('el-GR')}
              </p>
              <p className="text-xs text-slate-500">
                Ταμείο: <strong>{shift.register_id}</strong>
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Όριο Αποδεκτής Απόκλισης (€)
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="number"
                step="1"
                value={discrepancyThreshold}
                onChange={(e) => setDiscrepancyThreshold(e.target.value)}
                className="w-36 px-4 py-2.5 rounded-xl border border-slate-300 text-base font-extrabold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-500 font-medium">
                Αποκλίσεις άνω των <strong>{discrepancyThreshold || 10}€</strong> θα επισημανθούν.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: OPAP TRANSACTION CATEGORIES & GRANULAR REPORTS */}
      {currentStep === 2 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">2</span>
                <span>Αναφορές ΟΠΑΠ, VLTs & Υπηρεσιών</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Εισάγετε τα ποσά ανά κατηγορία από την ημερήσια αναφορά του τερματικού ΟΠΑΠ & POS.
              </p>
            </div>
            <div className="bg-slate-900 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold">
              Καθαρό Σύνολο ΟΠΑΠ: {(opapGrossTotal - opapPayoutsTotal).toFixed(2)} €
            </div>
          </div>

          <div className="space-y-6">
            {/* 1. Ελληνικά Λαχεία | Σκρατς */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 flex-wrap gap-2">
                <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                  <span>🎫 Ελληνικά Λαχεία | Σκρατς</span>
                </h4>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-500">
                    Πωλήσεις: <span className="font-mono text-slate-900">{safeNum(scratchSales).toFixed(2)} €</span>
                  </span>
                  <span className="text-xs font-bold text-rose-600">
                    - Εξαργ.: <span className="font-mono">{safeNum(scratchPayouts).toFixed(2)} €</span>
                  </span>
                  <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 font-mono">
                    Καθαρό: {totalScratchNet.toFixed(2)} €
                  </span>
                </div>
              </div>

              {/* Detailed Scratch Ticket Counter Table (Initial & Final Ticket Serial Numbers) */}
              <ScratchCalculatorTable
                rows={scratchRows}
                onChangeRows={handleScratchRowsChange}
              />

              {/* Direct inputs summary & payouts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/80">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Σύνολο Πωλήσεων Σκρατς (€)</span>
                    <span className="text-[10px] text-indigo-600 font-normal">Υπολογισμένο / Επεξεργάσιμο</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={scratchSales}
                    onChange={(e) => setScratchSales(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-rose-800 mb-1">
                    Εξαργυρώσεις Σκρατς (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={scratchPayouts}
                    onChange={(e) => setScratchPayouts(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-rose-200 text-base font-bold text-rose-700 bg-white focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* 2a. Πωλήσεις POS Καταστήματος (POS Καταμέτρησης) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/40 border border-indigo-200/80 space-y-4">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-3 flex-wrap gap-2">
                <div>
                  <h4 className="font-extrabold text-sm text-indigo-950 uppercase tracking-wider flex items-center space-x-2">
                    <span>💳 Πωλήσεις POS Καταστήματος (POS Καταμέτρησης)</span>
                  </h4>
                  <p className="text-[11px] font-medium text-indigo-700/80 mt-0.5">
                    Τερματικά POS για πωλήσεις κάρτας — Υπολογίζονται στο Σύνολο Καταμέτρησης
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleAddStorePosItem}
                    className="px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Προσθήκη POS</span>
                  </button>
                  <span className="text-xs font-black text-indigo-800 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-2xs font-mono">
                    Σύνολο POS Καταστήματος: {totalStorePos.toFixed(2)} €
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {storePosItems.map((item) => (
                  <div key={item.id} className="bg-white p-3 rounded-xl border border-indigo-100 space-y-2 relative group shadow-2xs">
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleUpdateStorePosItem(item.id, 'name', e.target.value)}
                        className="text-xs font-bold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-hidden px-1 py-0.5"
                      />

                      {storePosItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStorePosItem(item.id)}
                          className="text-slate-300 hover:text-rose-600 p-0.5 transition-colors"
                          title="Διαγραφή POS"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={item.amount}
                        onChange={(e) => handleUpdateStorePosItem(item.id, 'amount', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 font-bold font-mono text-base"
                      />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">€</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2b. Tora Direct (Υπηρεσίες Tora) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 flex-wrap gap-2">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                    <span>📱 Tora Direct (Υπηρεσίες Tora)</span>
                  </h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-[10px] font-extrabold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-indigo-600 shrink-0" />
                      Ορίζονται & Διαχειρίζονται από Manager/Admin
                    </span>
                    {!canManage && !managerUnlockedPos && (
                      <button
                        type="button"
                        onClick={() => setManagerUnlockedPos(true)}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                      >
                        (Ξεκλείδωμα Manager)
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {(canManage || managerUnlockedPos) && (
                    <button
                      type="button"
                      onClick={handleAddPosItem}
                      className="px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center space-x-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Προσθήκη Tora POS</span>
                    </button>
                  )}
                  <span className="text-xs font-black text-slate-700 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs font-mono">
                    Σύνολο Tora: {totalToraPos.toFixed(2)} €
                  </span>
                </div>
              </div>

              {!canManage && !managerUnlockedPos && (
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-2.5 text-amber-800 text-xs flex items-center gap-2 font-medium">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Τα ποσά και τα τερματικά Tora Direct ορίζονται από τον Manager. Πατήστε "(Ξεκλείδωμα Manager)" αν απαιτείται τροποποίηση.</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {toraPosItems.map((item) => (
                  <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 relative group shadow-2xs">
                    <div className="flex items-center justify-between">
                      {canManage || managerUnlockedPos ? (
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleUpdatePosItem(item.id, 'name', e.target.value)}
                          className="text-xs font-bold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-hidden px-1 py-0.5"
                        />
                      ) : (
                        <span className="text-xs font-bold text-slate-800">{item.name}</span>
                      )}

                      {(canManage || managerUnlockedPos) && toraPosItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePosItem(item.id)}
                          className="text-slate-300 hover:text-rose-600 p-0.5 transition-colors"
                          title="Διαγραφή Tora POS"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        disabled={!canManage && !managerUnlockedPos}
                        value={item.amount}
                        onChange={(e) => handleUpdatePosItem(item.id, 'amount', e.target.value)}
                        placeholder="0.00"
                        className={`w-full px-3 py-2 rounded-lg border text-base font-bold font-mono focus:ring-2 ${
                          canManage || managerUnlockedPos
                            ? 'border-indigo-300 text-slate-900 bg-white focus:ring-indigo-500'
                            : 'border-slate-200 text-slate-700 bg-slate-100/80 cursor-not-allowed'
                        }`}
                      />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">€</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Clever Point, 4. Ιππόδρομος & 6. Pame Stoixima | Virtuals */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Clever Point */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  📍 Clever Point
                </label>
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">Σύνολο (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={cleverPointTotal}
                    onChange={(e) => setCleverPointTotal(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Ιππόδρομος */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  🏇 Ιππόδρομος
                </label>
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">Υπόλοιπο Ταμείου (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={ippodromosBalance}
                    onChange={(e) => setIppodromosBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Pame Stoixima | Virtuals */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  ⚽ Pame Stoixima | Virtuals
                </label>
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">Υπόλοιπο Ταμείου (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={pameStoiximaBalance}
                    onChange={(e) => setPameStoiximaBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* 5. VLTs (PLAY) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                  <span>🎰 PLAY VLTs</span>
                </h4>
                <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                  Καθαρό: {(safeNum(vltsIn) - signedVltsOut).toFixed(2)} €
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Μετρητά στα VLTs (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={vltsIn}
                    onChange={(e) => setVltsIn(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={`block text-xs font-bold ${vltsOutType === 'NEGATIVE' ? 'text-rose-800' : 'text-emerald-800'}`}>
                      Ροή Μετρητών VLTs (€)
                    </label>
                    <div className="flex items-center space-x-1 bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setVltsOutType('NEGATIVE')}
                        className={`px-2 py-0.5 rounded-md transition-all ${
                          vltsOutType === 'NEGATIVE'
                            ? 'bg-rose-600 text-white shadow-2xs font-extrabold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        - Εκροή
                      </button>
                      <button
                        type="button"
                        onClick={() => setVltsOutType('POSITIVE')}
                        className={`px-2 py-0.5 rounded-md transition-all ${
                          vltsOutType === 'POSITIVE'
                            ? 'bg-emerald-600 text-white shadow-2xs font-extrabold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        + Είσπραξη
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <span
                      className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black ${
                        vltsOutType === 'NEGATIVE' ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {vltsOutType === 'NEGATIVE' ? '-' : '+'}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={vltsOut}
                      onChange={(e) => setVltsOut(e.target.value)}
                      placeholder="0.00"
                      className={`w-full pl-8 pr-3.5 py-2.5 rounded-xl border text-base font-bold ${
                        vltsOutType === 'NEGATIVE'
                          ? 'border-rose-200 text-rose-700 bg-white focus:ring-2 focus:ring-rose-500'
                          : 'border-emerald-200 text-emerald-700 bg-white focus:ring-2 focus:ring-emerald-500'
                      }`}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {vltsOutType === 'NEGATIVE'
                      ? '🔴 Εκροή / Πληρωμή (αφαιρείται από το ταμείο)'
                      : '🟢 Είσπραξη / Πλεόνασμα (προστίθεται στο ταμείο)'}
                  </p>
                </div>
              </div>
            </div>

            {/* 7. Αριθμοπαιχνίδια (KINO, Τζόκερ, Λόττο κλπ.) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/40 border border-indigo-100 space-y-3">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                <h4 className="font-extrabold text-sm text-indigo-950 uppercase tracking-wider flex items-center space-x-2">
                  <span>🎯 Αριθμοπαιχνίδια (KINO, Τζόκερ, Λόττο)</span>
                </h4>
                <span className="text-xs font-black text-indigo-900 bg-indigo-100 px-2.5 py-1 rounded-lg">
                  Σύνολο: {totalArithmoNet.toFixed(2)} €
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Πωλήσεις (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={arithmoGross}
                    onChange={(e) => setArithmoGross(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">
                    Ακυρώσεις (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={arithmoCancels}
                    onChange={(e) => setArithmoCancels(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-amber-200 text-base font-bold text-amber-800 bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-rose-800 mb-1">
                    Εξαργυρώσεις (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={arithmoPayouts}
                    onChange={(e) => setArithmoPayouts(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-rose-200 text-base font-bold text-rose-700 bg-white focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vouchers (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={arithmoVouchers}
                    onChange={(e) => setArithmoVouchers(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: FnB, EXPENSES & CUSTOMER CREDITS */}
      {currentStep === 3 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-8">
          {/* FnB Sales */}
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">3</span>
                <span>Πωλήσεις Καφέ / Αναψυκτηρίου (FnB)</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Συνολικές Πωλήσεις FnB (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fnbSales}
                  onChange={(e) => setFnbSales(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-lg font-extrabold text-slate-900 bg-white"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                <label className="block text-xs font-bold text-emerald-900 uppercase tracking-wider mb-1">
                  Μετρητά FnB (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fnbCash}
                  onChange={(e) => setFnbCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-200 text-lg font-extrabold text-emerald-800 bg-white"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                <label className="block text-xs font-bold text-indigo-900 uppercase tracking-wider mb-1">
                  Κάρτες FnB (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fnbCard}
                  onChange={(e) => setFnbCard(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-200 text-lg font-extrabold text-indigo-800 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Daily Expenses */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
                  <Receipt className="w-5 h-5 text-indigo-600" />
                  <span>Ημερήσια Έξοδα & Αποδείξεις</span>
                </h4>
                <p className="text-xs text-slate-500">Πληρωμές σε προμηθευτές ή αναλώσιμα από το ταμείο.</p>
              </div>
              <button
                type="button"
                onClick={handleAddExpense}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Προσθήκη Εξόδου</span>
              </button>
            </div>

            {expenses.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400 font-medium">
                Δεν έχουν καταχωρηθεί έξοδα για αυτή τη βάρδια.
              </div>
            ) : (
              <div className="space-y-3">
                {expenses.map((exp, idx) => (
                  <div
                    key={exp.id || idx}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                  >
                    <div className="sm:col-span-3">
                      <select
                        value={exp.category || 'SUPPLIES'}
                        onChange={(e) => {
                          const updated = [...expenses];
                          updated[idx].category = e.target.value;
                          setExpenses(updated);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
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
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white"
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
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold text-slate-900 bg-white"
                      />
                    </div>

                    <div className="sm:col-span-2 flex items-center space-x-2">
                      <label className="cursor-pointer px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-700 hover:text-indigo-600 hover:border-indigo-300 transition-colors flex items-center space-x-1.5 text-xs font-bold shadow-2xs">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{exp.receipt_url ? 'Απόδειξη ✓' : 'Ανέβασμα'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(idx, e)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setExpenses(expenses.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
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
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
                  <UserCheck className="w-5 h-5 text-indigo-600" />
                  <span>Πιστώσεις Πελατών (Customer Credit)</span>
                </h4>
                <p className="text-xs text-slate-500">Νέες πιστώσεις (τεφτέρι) ή εισπράξεις παλαιών οφειλών.</p>
              </div>
              <button
                type="button"
                onClick={handleAddCredit}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Προσθήκη Πίστωσης</span>
              </button>
            </div>

            {customerCredits.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400 font-medium">
                Δεν υπάρχουν καταχωρημένες πιστώσεις/εισπράξεις πελατών.
              </div>
            ) : (
              <div className="space-y-3">
                {customerCredits.map((cred, idx) => (
                  <div
                    key={cred.id || idx}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
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
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <select
                        value={cred.type || 'GRANTED'}
                        onChange={(e) => {
                          const updated = [...customerCredits];
                          updated[idx].type = e.target.value as 'GRANTED' | 'COLLECTED';
                          setCustomerCredits(updated);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                      >
                        <option value="GRANTED">Νέα Πίστωση (Χρέωση Πελάτη)</option>
                        <option value="COLLECTED">Είσπραξη Πίστωσης (Εξόφληση)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-3">
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
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold text-slate-900 bg-white"
                      />
                    </div>

                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setCustomerCredits(customerCredits.filter((_, i) => i !== idx))
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: EUR DENOMINATION CASH COUNTER */}
      {currentStep === 4 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">4</span>
                <span>Καταμέτρηση Μετρητών Ταμείου</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Μετρήστε τα χαρτονομίσματα και τα κέρματα στο συρτάρι.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <div className="text-right bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider block">
                  Μετρητά Συρταριού
                </span>
                <span className="text-xl font-black text-slate-900">{countedCash.toFixed(2)} €</span>
              </div>
              <div className="text-right bg-indigo-600 text-white px-4 py-2 rounded-2xl border border-indigo-700 shadow-xs">
                <span className="text-[10px] font-extrabold text-indigo-100 uppercase tracking-wider block">
                  Σύνολο Καταμέτρησης
                </span>
                <span className="text-xl font-black text-white">{totalReconciliationCount.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Formula summary pill */}
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 text-xs text-indigo-950 flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold flex items-center space-x-1">
              <span>🧮 Τύπος Υπολογισμού:</span>
            </span>
            <span className="font-mono text-[11px] bg-white px-2.5 py-1 rounded-xl border border-indigo-100 text-indigo-900 font-medium">
              (Μετρημένα + POS + Έξοδα + Πιστώσεις - Επιστροφές) - Αρχικό
            </span>
          </div>

          {/* Cash Denomination Counter Component */}
          <CashDenominationCounter
            denominations={denominations}
            onChange={setDenominations}
            theme="light"
          />
        </div>
      )}

      {/* STEP 5: REVIEW, RECONCILIATION & SUBMISSION */}
      {currentStep === 5 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
              <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">5</span>
              <span>Τελικός Έλεγχος & Υποβολή</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Επιβεβαιώστε το ισοζύγιο ταμείου και το Σύνολο Καταμέτρησης πριν την οριστική υποβολή.
            </p>
          </div>

          {/* Main Reconciliation KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Primary Highlight: Σύνολο Καταμέτρησης */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white border border-indigo-800 shadow-md">
              <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider block">
                Σύνολο Καταμέτρησης
              </span>
              <p className="text-3xl font-black text-emerald-400 mt-1 font-mono">
                {totalReconciliationCount.toFixed(2)} €
              </p>
              <p className="text-[10px] text-indigo-200/80 mt-1 font-medium">
                Μετρητά + POS + Έξοδα + Πιστώσεις - Επιστροφές - Αρχικό
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-150">
              <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider block">
                Μετρημένα στο Συρτάρι
              </span>
              <p className="text-2xl font-black text-indigo-950 mt-1">
                {countedCash.toFixed(2)} €
              </p>
              <p className="text-[11px] text-indigo-700/80 mt-1">
                Από καταμέτρηση χαρτονομισμάτων.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Αναμενόμενο Ταμείο
              </span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {expectedCash.toFixed(2)} €
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Βάσει εισροών/εκροών συστήματος.
              </p>
            </div>

            <div
              className={`p-5 rounded-2xl border ${
                discResult.isExceedingThreshold
                  ? 'bg-rose-50 border-rose-300'
                  : discResult.isUnbalanced
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-emerald-50 border-emerald-300'
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-wider block text-slate-700">
                Διαφορά Ταμείου
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
              <p className="text-xs font-bold mt-1">
                {discResult.isExceedingThreshold ? (
                  <span className="text-rose-700 flex items-center space-x-1">
                    <AlertTriangle className="w-4 h-4 inline shrink-0" />
                    <span>Υπέρβαση ορίου ({discrepancyThreshold}€)</span>
                  </span>
                ) : discResult.isUnbalanced ? (
                  <span className="text-amber-700">Μικρή απόκλιση εντός ορίου</span>
                ) : (
                  <span className="text-emerald-700">✓ Απόλυτα ισοσκελισμένο</span>
                )}
              </p>
            </div>
          </div>

          {/* Breakdown Table for Σύνολο Καταμέτρησης */}
          <div className="border border-indigo-200 rounded-2xl overflow-hidden text-xs shadow-xs">
            <div className="bg-indigo-950 text-white px-4 py-3 font-extrabold text-sm flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <span>📊 Αναλυτικός Υπολογισμός: Σύνολο Καταμέτρησης</span>
              </span>
              <span className="font-mono text-emerald-400 font-black text-base">
                {totalReconciliationCount.toFixed(2)} €
              </span>
            </div>
            <div className="divide-y divide-slate-100 bg-white">
              <div className="px-4 py-2.5 flex justify-between items-center">
                <span className="text-slate-700 font-medium">1. Μετρημένα στο Συρτάρι</span>
                <span className="font-bold text-slate-900 font-mono">{countedCash.toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center bg-slate-50/60">
                <span className="text-slate-700 font-medium">(+) Πωλήσεις από POS #x (Χειροκίνητες)</span>
                <span className="font-bold text-emerald-700 font-mono">+{totalToraPos.toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center">
                <span className="text-slate-700 font-medium">(+) Όλα τα Έξοδα</span>
                <span className="font-bold text-emerald-700 font-mono">+{expensesTotal.toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center bg-slate-50/60">
                <span className="text-slate-700 font-medium">(+) Πιστώσεις Πελατών (Χρεώσεις)</span>
                <span className="font-bold text-emerald-700 font-mono">+{creditGrantedTotal.toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center">
                <span className="text-slate-700 font-medium">(-) Επιστροφές Πελατών (Εισπράξεις / Επιστροφές)</span>
                <span className="font-bold text-rose-600 font-mono">-{creditCollectedTotal.toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center bg-amber-50/40">
                <span className="text-amber-950 font-semibold">(-) Αρχικό Κεφάλαιο (Float)</span>
                <span className="font-bold text-rose-700 font-mono">-{openingCashTotal.toFixed(2)} €</span>
              </div>
              <div className="px-4 py-3.5 flex justify-between items-center bg-indigo-50 font-black border-t-2 border-indigo-200 text-sm">
                <span className="text-indigo-950 uppercase tracking-wider text-xs font-black">
                  (=) Σύνολο Καταμέτρησης
                </span>
                <span className="text-indigo-950 font-mono text-base">{totalReconciliationCount.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Detailed Financial Ledger Breakdown Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs shadow-2xs">
            <div className="bg-slate-100 px-4 py-3 font-extrabold text-slate-800 border-b border-slate-200">
              Αναλυτικό Ισοζύγιο Βάρδιας (Σύστημα)
            </div>
            <div className="divide-y divide-slate-100 bg-white">
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-600 font-medium">Αρχικό Ταμείο</span>
                <span className="font-bold text-slate-900">{openingCashTotal.toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-600 font-medium">(+) Πωλήσεις ΟΠΑΠ</span>
                <span className="font-bold text-emerald-700">+{opapGrossTotal.toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-600 font-medium">(-) Πληρωμές Κερδών ΟΠΑΠ</span>
                <span className="font-bold text-rose-600">-{opapPayoutsTotal.toFixed(2)} €</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-600 font-medium">(+) PLAY VLTs Net</span>
                <span className="font-bold text-emerald-700">
                  +{(safeNum(vltsIn) - safeNum(vltsOut)).toFixed(2)} €
                </span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-600 font-medium">(+) Μετρητά FnB & Σκρατς</span>
                <span className="font-bold text-emerald-700">
                  +{(safeNum(fnbCash) + totalScratchNet).toFixed(2)} €
                </span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-600 font-medium">(-) Πληρωμές Καρτών POS & Έξοδα</span>
                <span className="font-bold text-rose-600">
                  -{(totalToraPos + expensesCashTotal).toFixed(2)} €
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between bg-slate-50 font-black border-t border-slate-200 text-sm">
                <span className="text-slate-900">Τελικό Αναμενόμενο Ταμείο</span>
                <span className="text-slate-900 font-mono">{expectedCash.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Employee Closing Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Σημειώσεις Βάρδιας (Προαιρετικό)
            </label>
            <textarea
              value={employeeNotes}
              onChange={(e) => setEmployeeNotes(e.target.value)}
              placeholder="Γράψτε τυχόν παρατηρήσεις ή αιτιολογήστε τυχόν αποκλίσεις..."
              rows={3}
              className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500"
            />
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
    </div>
  );
};

