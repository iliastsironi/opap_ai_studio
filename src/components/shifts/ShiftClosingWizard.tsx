import React, { useState, useEffect, useRef } from 'react';
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
  RefreshCw,
  Sparkles,
  Printer,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchExpensesFromFirestore, deleteExpenseInFirestore, ExpenseRecord } from '../../services/moduleServices.ts';
import { deleteShiftFromFirestore } from '../../services/shiftService.ts';
import { ShiftReceiptPrintView, ShiftReceiptData } from './ShiftReceiptPrintView.tsx';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import {
  ScratchCalculatorTable,
  DEFAULT_SCRATCH_PRESETS,
  ScratchTicketRow,
  calculateRowTotal,
  getSavedScratchCatalog,
  saveScratchCatalog,
  carryOverScratchInventory,
  getLatestStoreScratchInventory,
  saveLatestStoreScratchInventory,
} from './ScratchCalculatorTable.tsx';
import { CustomerCreditSection } from './CustomerCreditSection.tsx';
import { applyShiftCustomerCredits } from '../../services/customerCreditService.ts';

export interface ToraPosItem {
  id: string;
  name: string;
  amount: string;
}

function getSavedStorePosConfig(storeId?: string): ToraPosItem[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`shiftledger_store_pos_${storeId || 'default'}`) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p: any) => ({ ...p, amount: '' }));
      }
    }
  } catch (e) {
    console.warn(e);
  }
  return [
    { id: 'store_pos_1', name: 'Pos #1', amount: '' },
    { id: 'store_pos_2', name: 'Pos #2', amount: '' },
  ];
}

function saveStorePosConfig(storeId: string | undefined, items: ToraPosItem[]): void {
  try {
    if (typeof window === 'undefined') return;
    const clean = items.map((p) => ({ id: p.id, name: p.name, amount: '' }));
    localStorage.setItem(`shiftledger_store_pos_${storeId || 'default'}`, JSON.stringify(clean));
  } catch (e) {
    console.warn(e);
  }
}

function getSavedToraPosConfig(storeId?: string): ToraPosItem[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`shiftledger_tora_pos_${storeId || 'default'}`) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p: any) => ({ ...p, amount: '' }));
      }
    }
  } catch (e) {
    console.warn(e);
  }
  return [
    { id: 'tora_1', name: 'TORA DIRECT #1', amount: '' },
    { id: 'tora_2', name: 'TORA DIRECT #2', amount: '' },
  ];
}

function saveToraPosConfig(storeId: string | undefined, items: ToraPosItem[]): void {
  try {
    if (typeof window === 'undefined') return;
    const clean = items.map((p) => ({ id: p.id, name: p.name, amount: '' }));
    localStorage.setItem(`shiftledger_tora_pos_${storeId || 'default'}`, JSON.stringify(clean));
  } catch (e) {
    console.warn(e);
  }
}
import {
  EUR_DENOMINATIONS,
  calculateCountedCash,
  calculateDiscrepancy,
  calculateExpectedCash,
  calculateTotalReconciliationCount,
  calculateReconciliationBreakdown,
  calculateBanknotesAndCoins,
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

function getLocalDraft(shiftId?: string): any {
  if (typeof window === 'undefined' || !shiftId) return null;
  try {
    const raw = localStorage.getItem(`shift_draft_${shiftId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export const ShiftClosingWizard: React.FC<ShiftClosingWizardProps> = ({
  shift,
  onBack,
  onSubmitted,
}) => {
  const { token, roles, permissions, user, organization } = useAuth();
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

  const isOwnerOrManager = canManage;

  const [managerUnlockedPos, setManagerUnlockedPos] = useState<boolean>(canManage);
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Load any local draft for initial hydration fallback
  const localDraft = getLocalDraft(shift.id);

  // Step 1 - Opening Cash Breakdown State (Banknotes + Coins + Top-ups)
  const initialOpeningCash = Number(shift.opening_cash ?? localDraft?.opening_cash ?? 200);
  const [openingNotesAmount, setOpeningNotesAmount] = useState<string>(
    shift.opening_cash_notes !== undefined
      ? String(shift.opening_cash_notes)
      : localDraft?.opening_cash_notes !== undefined
      ? String(localDraft.opening_cash_notes)
      : String(Math.floor(initialOpeningCash))
  );
  const [openingCoinsAmount, setOpeningCoinsAmount] = useState<string>(
    shift.opening_cash_coins !== undefined
      ? String(shift.opening_cash_coins)
      : localDraft?.opening_cash_coins !== undefined
      ? String(localDraft.opening_cash_coins)
      : String(roundCurrency(initialOpeningCash - Math.floor(initialOpeningCash)))
  );
  const [openingTopUp1, setOpeningTopUp1] = useState<string>(
    shift.custom_field_values?.opening_topup_1 !== undefined
      ? String(shift.custom_field_values.opening_topup_1)
      : localDraft?.custom_field_values?.opening_topup_1 !== undefined
      ? String(localDraft.custom_field_values.opening_topup_1)
      : ''
  );
  const [openingTopUp2, setOpeningTopUp2] = useState<string>(
    shift.custom_field_values?.opening_topup_2 !== undefined
      ? String(shift.custom_field_values.opening_topup_2)
      : localDraft?.custom_field_values?.opening_topup_2 !== undefined
      ? String(localDraft.custom_field_values.opening_topup_2)
      : ''
  );

  const openingCashTotal =
    safeNum(openingNotesAmount) +
    safeNum(openingCoinsAmount) +
    safeNum(openingTopUp1) +
    safeNum(openingTopUp2);

  // Step 2 - Granular OPAP Reports State
  // 1. Ελληνικά Λαχεία | Σκρατς
  const [scratchRows, setScratchRows] = useState<ScratchTicketRow[]>(() => {
    const catalog = getSavedScratchCatalog();
    const saved =
      shift.custom_field_values?.scratch_ticket_items ||
      localDraft?.custom_field_values?.scratch_ticket_items;
    if (Array.isArray(saved) && saved.length > 0) {
      const merged: ScratchTicketRow[] = [];
      for (const item of catalog) {
        const match = saved.find((s: any) => s.id === item.id || s.name === item.name);
        if (match) {
          merged.push({
            ...item,
            startNo: match.startNo || '',
            endNo: match.endNo || '',
            manualQty: match.manualQty !== undefined ? match.manualQty : '',
            isNewPack: match.isNewPack || false,
          });
        } else {
          merged.push(item);
        }
      }
      // Add custom items from saved that might not exist in catalog
      for (const s of saved) {
        if (!merged.some((m) => m.id === s.id || m.name === s.name)) {
          merged.push(s);
        }
      }
      return merged;
    }

    // Try carry-over from latest store inventory
    const storeLatest = getLatestStoreScratchInventory(shift.store_id);
    if (storeLatest && Array.isArray(storeLatest) && storeLatest.length > 0) {
      return carryOverScratchInventory(storeLatest, catalog);
    }

    return catalog;
  });

  const [scratchSales, setScratchSales] = useState<string>(() => {
    if (shift.scratch_sales !== undefined && shift.scratch_sales > 0) {
      return String(shift.scratch_sales);
    }
    if (shift.scratch_lotto_sales !== undefined && shift.scratch_lotto_sales > 0) {
      return String(shift.scratch_lotto_sales);
    }
    if (localDraft?.scratch_sales !== undefined && localDraft.scratch_sales > 0) {
      return String(localDraft.scratch_sales);
    }
    const initialCalc = (
      Array.isArray(shift.custom_field_values?.scratch_ticket_items)
        ? shift.custom_field_values.scratch_ticket_items
        : getSavedScratchCatalog()
    ).reduce((sum, r) => sum + calculateRowTotal(r), 0);
    return initialCalc > 0 ? String(initialCalc) : '';
  });

  const [scratchPayouts, setScratchPayouts] = useState<string>(
    shift.scratch_payouts !== undefined
      ? String(shift.scratch_payouts)
      : localDraft?.scratch_payouts !== undefined
      ? String(localDraft.scratch_payouts)
      : ''
  );

  const handleScratchRowsChange = (newRows: ScratchTicketRow[]) => {
    setScratchRows(newRows);
    saveScratchCatalog(newRows);
    saveLatestStoreScratchInventory(shift.store_id, newRows);
    const calc = newRows.reduce((sum, r) => sum + calculateRowTotal(r), 0);
    setScratchSales(calc.toFixed(2));
  };

  // 2a. Store POS Items (Πωλήσεις POS Καταστήματος / POS Καταμέτρησης - Manager controllable)
  const [storePosItems, setStorePosItems] = useState<ToraPosItem[]>(() => {
    const saved =
      shift.custom_field_values?.store_pos_items ||
      localDraft?.custom_field_values?.store_pos_items;
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    const config = getSavedStorePosConfig(shift.store_id);
    const reg1 = shift.register_pos_1 ?? localDraft?.register_pos_1;
    const reg2 = shift.register_pos_2 ?? localDraft?.register_pos_2;
    const cardPay = shift.card_payments ?? localDraft?.card_payments;

    if (reg1 !== undefined && reg1 !== 0 && config.length > 0) {
      config[0].amount = String(reg1);
    } else if (cardPay && config.length > 0) {
      config[0].amount = String(cardPay);
    }
    if (reg2 !== undefined && reg2 !== 0 && config.length > 1) {
      config[1].amount = String(reg2);
    }
    return config;
  });

  const handleUpdateStorePosItem = (id: string, field: 'name' | 'amount', value: string) => {
    setStorePosItems((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, [field]: value } : item));
      if (field === 'name') {
        saveStorePosConfig(shift.store_id, updated);
      }
      return updated;
    });
  };

  const handleAddStorePosItem = () => {
    const newPosNumber = storePosItems.length + 1;
    const newItem: ToraPosItem = {
      id: `store_pos_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: `Pos #${newPosNumber}`,
      amount: '',
    };
    const updated = [...storePosItems, newItem];
    setStorePosItems(updated);
    saveStorePosConfig(shift.store_id, updated);
  };

  const handleRemoveStorePosItem = (id: string) => {
    if (storePosItems.length <= 1) return;
    const updated = storePosItems.filter((item) => item.id !== id);
    setStorePosItems(updated);
    saveStorePosConfig(shift.store_id, updated);
  };

  // 2b. Tora Direct POS Items (Υπηρεσίες Tora Direct)
  const [toraPosItems, setToraPosItems] = useState<ToraPosItem[]>(() => {
    const saved =
      shift.custom_field_values?.tora_pos_items ||
      localDraft?.custom_field_values?.tora_pos_items;
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    const config = getSavedToraPosConfig(shift.store_id);
    const p1 = shift.tora_pos1 ?? shift.tora_pos_1 ?? localDraft?.tora_pos1 ?? localDraft?.tora_pos_1;
    const p2 = shift.tora_pos2 ?? shift.tora_pos_2 ?? localDraft?.tora_pos2 ?? localDraft?.tora_pos_2;

    if (p1 !== undefined && p1 !== 0 && config.length > 0) {
      config[0].amount = String(p1);
    }
    if (p2 !== undefined && p2 !== 0 && config.length > 1) {
      config[1].amount = String(p2);
    }
    return config;
  });

  const handleUpdatePosItem = (id: string, field: 'name' | 'amount', value: string) => {
    setToraPosItems((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, [field]: value } : item));
      if (field === 'name') {
        saveToraPosConfig(shift.store_id, updated);
      }
      return updated;
    });
  };

  const handleAddPosItem = () => {
    const newPosNumber = toraPosItems.length + 1;
    const newItem: ToraPosItem = {
      id: `tora_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: `TORA DIRECT #${newPosNumber}`,
      amount: '',
    };
    const updated = [...toraPosItems, newItem];
    setToraPosItems(updated);
    saveToraPosConfig(shift.store_id, updated);
  };

  const handleRemovePosItem = (id: string) => {
    if (toraPosItems.length <= 1) return;
    const updated = toraPosItems.filter((item) => item.id !== id);
    setToraPosItems(updated);
    saveToraPosConfig(shift.store_id, updated);
  };

  // 3. Clever Point
  const [cleverPointTotal, setCleverPointTotal] = useState<string>(
    shift.clever_point_total !== undefined
      ? String(shift.clever_point_total)
      : localDraft?.clever_point_total !== undefined
      ? String(localDraft.clever_point_total)
      : ''
  );

  // 4. Ιππόδρομος
  const [ippodromosBalance, setIppodromosBalance] = useState<string>(
    shift.ippodromos_balance !== undefined
      ? String(shift.ippodromos_balance)
      : localDraft?.ippodromos_balance !== undefined
      ? String(localDraft.ippodromos_balance)
      : ''
  );

  // 5. VLTs
  const initialVltsIn =
    shift.vlts_cash_in !== undefined && shift.vlts_cash_in !== 0
      ? shift.vlts_cash_in
      : localDraft?.vlts_cash_in;
  const initialVltsOut =
    shift.vlts_cash_out !== undefined && shift.vlts_cash_out !== 0
      ? shift.vlts_cash_out
      : localDraft?.vlts_cash_out;
  const savedVltsType =
    shift.custom_field_values?.vlts_cash_out_type ||
    localDraft?.custom_field_values?.vlts_cash_out_type;
  const savedVltsRaw =
    shift.custom_field_values?.vlts_cash_out_raw ??
    localDraft?.custom_field_values?.vlts_cash_out_raw;

  const [vltsIn, setVltsIn] = useState<string>(
    initialVltsIn !== undefined && initialVltsIn !== '' ? String(initialVltsIn) : ''
  );
  const rawVltsOutNum =
    initialVltsOut !== undefined && initialVltsOut !== '' ? Number(initialVltsOut) : 0;
  const [vltsOut, setVltsOut] = useState<string>(() => {
    if (savedVltsRaw !== undefined && savedVltsRaw !== '') return String(savedVltsRaw);
    return rawVltsOutNum !== 0 ? String(Math.abs(rawVltsOutNum)) : '';
  });
  const [vltsOutType, setVltsOutType] = useState<'NEGATIVE' | 'POSITIVE'>(() => {
    if (savedVltsType === 'NEGATIVE' || savedVltsType === 'POSITIVE') return savedVltsType;
    return rawVltsOutNum > 0 ? 'POSITIVE' : 'NEGATIVE';
  });

  // 6. Pame Stoixima | Virtuals
  const [pameStoiximaBalance, setPameStoiximaBalance] = useState<string>(
    shift.pame_stoixima_balance !== undefined
      ? String(shift.pame_stoixima_balance)
      : localDraft?.pame_stoixima_balance !== undefined
      ? String(localDraft.pame_stoixima_balance)
      : ''
  );

  // 7. Αριθμοπαιχνίδια (KINO, Τζόκερ, κλπ.)
  const [arithmoGross, setArithmoGross] = useState<string>(
    shift.arithmo_gross !== undefined
      ? String(shift.arithmo_gross)
      : shift.opap_gross_sales !== undefined && shift.opap_gross_sales !== 0
      ? String(shift.opap_gross_sales)
      : localDraft?.arithmo_gross !== undefined
      ? String(localDraft.arithmo_gross)
      : ''
  );
  const [arithmoCancels, setArithmoCancels] = useState<string>(
    shift.arithmo_cancels !== undefined
      ? String(shift.arithmo_cancels)
      : localDraft?.arithmo_cancels !== undefined
      ? String(localDraft.arithmo_cancels)
      : ''
  );
  const [arithmoPayouts, setArithmoPayouts] = useState<string>(
    shift.arithmo_payouts !== undefined
      ? String(shift.arithmo_payouts)
      : shift.opap_payouts !== undefined && shift.opap_payouts !== 0
      ? String(shift.opap_payouts)
      : localDraft?.arithmo_payouts !== undefined
      ? String(localDraft.arithmo_payouts)
      : ''
  );
  const [arithmoVouchers, setArithmoVouchers] = useState<string>(
    shift.arithmo_vouchers !== undefined
      ? String(shift.arithmo_vouchers)
      : localDraft?.arithmo_vouchers !== undefined
      ? String(localDraft.arithmo_vouchers)
      : ''
  );

  // FnB State
  const [fnbSales, setFnbSales] = useState<string>(
    shift.fnb_sales !== undefined
      ? String(shift.fnb_sales)
      : localDraft?.fnb_sales !== undefined
      ? String(localDraft.fnb_sales)
      : ''
  );
  const [fnbCash, setFnbCash] = useState<string>(
    shift.fnb_cash !== undefined
      ? String(shift.fnb_cash)
      : localDraft?.fnb_cash !== undefined
      ? String(localDraft.fnb_cash)
      : ''
  );
  const [fnbCard, setFnbCard] = useState<string>(
    shift.fnb_card !== undefined
      ? String(shift.fnb_card)
      : localDraft?.fnb_card !== undefined
      ? String(localDraft.fnb_card)
      : ''
  );

  const [bankDeposits, setBankDeposits] = useState<string>(
    shift.bank_deposits !== undefined
      ? String(shift.bank_deposits)
      : localDraft?.bank_deposits !== undefined
      ? String(localDraft.bank_deposits)
      : ''
  );
  const [discrepancyThreshold, setDiscrepancyThreshold] = useState<string>(
    String(shift.discrepancy_threshold || localDraft?.discrepancy_threshold || 10.0)
  );

  // Denominations State
  const [denominations, setDenominations] = useState<Record<string, number>>(
    shift.counted_denominations || localDraft?.counted_denominations || {}
  );

  // Expenses & Credits lists
  const [expenses, setExpenses] = useState<Array<Partial<ShiftExpense>>>(() => {
    if (shift.expenses && shift.expenses.length > 0) return shift.expenses;
    if (localDraft?.expenses && Array.isArray(localDraft.expenses) && localDraft.expenses.length > 0) {
      return localDraft.expenses;
    }
    return [];
  });

  const [customerCredits, setCustomerCredits] = useState<Array<Partial<CustomerCredit>>>(() => {
    if (shift.customer_credits && shift.customer_credits.length > 0) return shift.customer_credits;
    if (localDraft?.customer_credits && Array.isArray(localDraft.customer_credits) && localDraft.customer_credits.length > 0) {
      return localDraft.customer_credits;
    }
    return [];
  });

  const [employeeNotes, setEmployeeNotes] = useState<string>(
    shift.employee_notes || localDraft?.employee_notes || ''
  );

  // UI state & Print Receipt state
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [isAutoSaved, setIsAutoSaved] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-sync expenses state
  const [isSyncingExpenses, setIsSyncingExpenses] = useState<boolean>(false);
  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  const syncExpensesFromStore = async (isManual = false) => {
    setIsSyncingExpenses(true);
    try {
      const orgId = shift.organization_id || organization?.id || 'org_opap_demo';
      const storeExpenses = await fetchExpensesFromFirestore(orgId, shift.store_id);

      const shiftOpenTime = new Date(shift.opened_at).getTime();
      const relevant = storeExpenses.filter((e) => {
        if (e.shift_id && e.shift_id === shift.id) return true;
        if (!e.shift_id) {
          const expTime = new Date(e.created_at).getTime();
          if (expTime >= shiftOpenTime - 3600 * 1000) return true;
        }
        return false;
      });

      if (relevant.length > 0) {
        setExpenses((prevExpenses) => {
          const updated = [...prevExpenses];
          let addedCount = 0;
          for (const item of relevant) {
            const exists = updated.some(
              (u) => u.id === item.id || (u.description && u.description.includes(item.id))
            );
            if (!exists) {
              updated.push({
                id: item.id,
                shift_id: shift.id,
                organization_id: orgId,
                store_id: shift.store_id,
                category: item.category || 'EXPENSES_GP',
                amount: Number(item.amount) || 0,
                payment_method: item.payment_method === 'CARD' ? 'CARD' : 'CASH',
                description: item.recipient
                  ? `${item.recipient}${item.notes ? ` - ${item.notes}` : ''}`
                  : (item.notes || item.category),
                receipt_url: '',
                created_by_user_id: user?.id || 'usr_employee',
                created_at: item.created_at,
              });
              addedCount++;
            }
          }
          if (isManual) {
            setSyncNotification(`Συγχρονίστηκαν ${relevant.length} έξοδα από τη βάση!`);
          } else if (addedCount > 0) {
            setSyncNotification(`Ανακτήθηκαν αυτόματα ${addedCount} νέα έξοδα από την ενότητα Εξόδων!`);
          }
          return updated;
        });
      } else if (isManual) {
        setSyncNotification('Όλα τα έξοδα είναι ήδη πλήρως ενημερωμένα.');
      }
    } catch (err) {
      console.warn('Error syncing expenses in wizard:', err);
    } finally {
      setIsSyncingExpenses(false);
    }
  };

  useEffect(() => {
    syncExpensesFromStore(false);
  }, [shift.id, shift.store_id]);

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

  // Helper to distinguish F&B expenses from General Store expenses (ΓΠ)
  const isFnbExpense = (category?: string) => {
    const cat = (category || '').toUpperCase();
    return (
      cat === 'FNB' ||
      cat === 'EXPENSES_FNB' ||
      cat === 'BEVERAGES_FNB' ||
      cat === 'BEVERAGES' ||
      cat === 'ΚΥΛΙΚΕΙΟ' ||
      cat === 'ΕΞΟΔΑ FNB'
    );
  };

  // Calculated figures using isolated Financial Calculator service
  const expensesGpCashTotal = expenses.reduce(
    (acc, exp) =>
      acc + (exp.payment_method !== 'CARD' && !isFnbExpense(exp.category) ? safeNum(exp.amount) : 0),
    0
  );

  const expensesFnbCashTotal = expenses.reduce(
    (acc, exp) =>
      acc + (exp.payment_method !== 'CARD' && isFnbExpense(exp.category) ? safeNum(exp.amount) : 0),
    0
  );

  const expensesCashTotal = expensesGpCashTotal + expensesFnbCashTotal;

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
  const signedVltsOut = vltsOutType === 'NEGATIVE' ? -safeNum(vltsOut) : safeNum(vltsOut);

  const expectedCash = calculateExpectedCash({
    opening_cash: openingCashTotal,
    opap_gross_sales: safeNum(arithmoGross),
    opap_payouts: safeNum(arithmoPayouts),
    vouchers: safeNum(arithmoVouchers),
    cancellations: safeNum(arithmoCancels),
    pame_stoixima: safeNum(pameStoiximaBalance),
    scratch_lotto_sales: totalScratchNet,
    tora_pos: totalToraPos,
    clever_point: safeNum(cleverPointTotal),
    vlts_cash_in: safeNum(vltsIn),
    vlts_cash_out: signedVltsOut,
    fnb_cash: safeNum(fnbCash) || safeNum(fnbSales),
  });

  const countedCash = calculateCountedCash(denominations);
  const banknotesAndCoins = calculateBanknotesAndCoins(denominations);

  const reconciliationBreakdown = calculateReconciliationBreakdown({
    openingCash: openingCashTotal,
    countedCashInDrawer: countedCash,
    posSalesTotal: totalStorePos,
    expensesTotal: expensesCashTotal,
    bankDeposits: bankDeposits,
    customerCreditsGranted: creditGrantedTotal,
    customerReturns: creditCollectedTotal,
  });

  const totalReconciliationCount = reconciliationBreakdown.netTotal;

  const discResult = calculateDiscrepancy(
    totalReconciliationCount,
    expectedCash,
    safeNum(discrepancyThreshold)
  );

  const receiptData: ShiftReceiptData = {
    shift: {
      ...shift,
      store_name: shift.store_name,
      store_code: shift.store_code || shift.store_id,
      register_id: shift.register_id || 'POS-01',
      shift_type: shift.shift_type,
      opened_at: shift.opened_at,
      closed_at: new Date().toISOString(),
      closed_by_user_name: `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || shift.closed_by_user_name || 'Υπάλληλος Βάρδιας',
      opened_by_user_name: shift.opened_by_user_name,
      counted_denominations: denominations,
    },
    storeName: shift.store_name || 'OPAP AGENCY',
    storeCode: shift.store_code || shift.store_id || '100343',
    registerId: shift.register_id || 'POS-01',
    cashierName: `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || shift.closed_by_user_name || shift.opened_by_user_name || 'Υπάλληλος Βάρδιας',
    shiftType: shift.shift_type || 'MORNING',
    openedAt: shift.opened_at,
    closedAt: new Date().toISOString(),
    denominations: denominations,

    openingNotes: safeNum(openingNotesAmount),
    openingCoins: safeNum(openingCoinsAmount),
    openingTopUp1: safeNum(openingTopUp1),
    openingTopUp2: safeNum(openingTopUp2),
    openingCashTotal: openingCashTotal,

    arithmoGross: safeNum(arithmoGross),
    arithmoCancels: safeNum(arithmoCancels),
    arithmoPayouts: safeNum(arithmoPayouts),
    arithmoVouchers: safeNum(arithmoVouchers),
    arithmoNet: totalArithmoNet,

    scratchSales: safeNum(scratchSales),
    scratchPayouts: safeNum(scratchPayouts),
    scratchNet: totalScratchNet,

    vltsIn: safeNum(vltsIn),
    vltsOut: signedVltsOut,
    vltsNet: safeNum(vltsIn) + signedVltsOut,

    pameStoiximaBalance: safeNum(pameStoiximaBalance),
    cleverPointTotal: safeNum(cleverPointTotal),
    ippodromosBalance: safeNum(ippodromosBalance),

    fnbCash: safeNum(fnbCash),
    fnbCard: safeNum(fnbCard),
    fnbTotal: safeNum(fnbSales),

    expensesGpCash: expensesGpCashTotal,
    expensesFnbCash: expensesFnbCashTotal,
    expensesTotalCash: expensesCashTotal,
    expensesList: expenses.map((e) => ({
      id: e.id,
      category: e.category,
      recipient: e.description || e.category,
      amount: safeNum(e.amount),
      notes: e.description,
    })),

    safeDrop: safeNum(bankDeposits),
    storePos1: safeNum(storePosItems[0]?.amount),
    storePos2: safeNum(storePosItems[1]?.amount),
    totalStorePos: totalStorePos,
    toraPos1: safeNum(toraPosItems[0]?.amount),
    toraPos2: safeNum(toraPosItems[1]?.amount),
    totalToraPos: totalToraPos,

    creditGranted: creditGrantedTotal,
    creditCollected: creditCollectedTotal,

    banknotesTotal: banknotesAndCoins.banknotes,
    coinsTotal: banknotesAndCoins.coins,
    drawerCashTotal: banknotesAndCoins.banknotes + banknotesAndCoins.coins,
    totalCountedCash: countedCash,
    totalExpectedCash: expectedCash,
    discrepancy: discResult.discrepancy,
    isUnbalanced: discResult.isUnbalanced,
    employeeNotes: employeeNotes,
  };

  // Helper to build a complete and fully persisted Shift payload
  const buildCurrentPayload = (targetStatus: 'DRAFT_CLOSING' | 'SUBMITTED') => {
    return {
      status: targetStatus as any,
      ...(targetStatus === 'SUBMITTED'
        ? {
            closed_at: new Date().toISOString(),
            closed_by_user_id: user?.id,
            closed_by_user_name:
              `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Υπάλληλος Βάρδιας',
          }
        : {}),
      opening_cash: openingCashTotal,
      opening_cash_notes: safeNum(openingNotesAmount),
      opening_cash_coins: safeNum(openingCoinsAmount),

      arithmo_gross: safeNum(arithmoGross),
      arithmo_cancels: safeNum(arithmoCancels),
      arithmo_payouts: safeNum(arithmoPayouts),
      arithmo_vouchers: safeNum(arithmoVouchers),
      number_games_sales: safeNum(arithmoGross),
      number_games_cancellations: safeNum(arithmoCancels),
      number_games_payouts: safeNum(arithmoPayouts),
      number_games_vouchers: safeNum(arithmoVouchers),

      pame_stoixima_balance: safeNum(pameStoiximaBalance),
      scratch_sales: safeNum(scratchSales),
      scratch_payouts: safeNum(scratchPayouts),
      scratch_lotto_sales: totalScratchNet,

      // POS & TORA fields (supporting all key conventions)
      tora_pos1: safeNum(toraPosItems[0]?.amount),
      tora_pos2: safeNum(toraPosItems[1]?.amount),
      tora_pos_1: safeNum(toraPosItems[0]?.amount),
      tora_pos_2: safeNum(toraPosItems[1]?.amount),
      tora_total: totalToraPos,
      register_pos_1: safeNum(storePosItems[0]?.amount),
      register_pos_2: safeNum(storePosItems[1]?.amount),
      card_payments: totalStorePos,

      clever_point_total: safeNum(cleverPointTotal),
      ippodromos_balance: safeNum(ippodromosBalance),

      opap_gross_sales: opapGrossTotal,
      opap_payouts: opapPayoutsTotal,
      opap_net_sales: opapGrossTotal - opapPayoutsTotal,

      // VLTs
      vlts_cash_in: safeNum(vltsIn),
      vlts_cash_out: signedVltsOut,
      vlts_net: safeNum(vltsIn) + signedVltsOut,

      fnb_sales: safeNum(fnbSales),
      fnb_cash: safeNum(fnbCash),
      fnb_card: safeNum(fnbCard),

      expenses_paid_cash: expensesCashTotal,
      customer_credit_granted: creditGrantedTotal,
      customer_credit_collected: creditCollectedTotal,
      bank_deposits: safeNum(bankDeposits),
      safe_drop: safeNum(bankDeposits),

      counted_denominations: denominations,
      counted_cash: countedCash,
      actual_cash: countedCash,
      expected_cash: expectedCash,
      discrepancy: discResult.discrepancy,
      discrepancy_percentage: discResult.discrepancyPercentage,
      discrepancy_threshold: safeNum(discrepancyThreshold),
      is_unbalanced: discResult.isUnbalanced,

      employee_notes: employeeNotes,
      expenses: expenses as any,
      customer_credits: customerCredits as any,

      custom_field_values: {
        ...(shift.custom_field_values || {}),
        ...(localDraft?.custom_field_values || {}),
        opening_topup_1: safeNum(openingTopUp1),
        opening_topup_2: safeNum(openingTopUp2),
        scratch_ticket_items: scratchRows,
        store_pos_items: storePosItems,
        tora_pos_items: toraPosItems,
        vlts_cash_out_type: vltsOutType,
        vlts_cash_out_raw: safeNum(vltsOut),
        total_reconciliation_count: totalReconciliationCount,
        reconciliation_gross_total: reconciliationBreakdown.grossTotal,
      },
    };
  };

  // Debounced Silent Autosave Effect to prevent ANY data loss
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const payload = buildCurrentPayload('DRAFT_CLOSING');
        if (typeof window !== 'undefined') {
          localStorage.setItem(`shift_draft_${shift.id}`, JSON.stringify(payload));
        }
        await updateShiftInFirestore(shift.id, payload);
        const timeStr = new Date().toLocaleTimeString('el-GR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setDraftSavedAt(timeStr);
        setIsAutoSaved(true);
        setTimeout(() => setIsAutoSaved(false), 2500);
      } catch (err) {
        console.warn('Silent autosave error:', err);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [
    openingNotesAmount,
    openingCoinsAmount,
    openingTopUp1,
    openingTopUp2,
    scratchRows,
    scratchSales,
    scratchPayouts,
    storePosItems,
    toraPosItems,
    cleverPointTotal,
    ippodromosBalance,
    vltsIn,
    vltsOut,
    vltsOutType,
    pameStoiximaBalance,
    arithmoGross,
    arithmoCancels,
    arithmoPayouts,
    arithmoVouchers,
    fnbSales,
    fnbCash,
    fnbCard,
    bankDeposits,
    discrepancyThreshold,
    denominations,
    expenses,
    customerCredits,
    employeeNotes,
  ]);

  // Manual Autosave Draft function
  const saveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const draftPayload = buildCurrentPayload('DRAFT_CLOSING');

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`shift_draft_${shift.id}`, JSON.stringify(draftPayload));
        } catch (e) {
          // ignore
        }
      }

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

      const timeStr = new Date().toLocaleTimeString('el-GR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setDraftSavedAt(timeStr);
      setIsAutoSaved(true);
      setTimeout(() => setIsAutoSaved(false), 2500);
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

  // Remove Expense item and delete from Firestore if saved
  const handleRemoveExpense = async (index: number) => {
    const exp = expenses[index];
    if (exp?.id && !exp.id.startsWith('temp_')) {
      try {
        await deleteExpenseInFirestore(exp.id);
      } catch (err) {
        console.warn('Could not delete expense from Firestore:', err);
      }
    }
    setExpenses(expenses.filter((_, i) => i !== index));
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
      const submitPayload = buildCurrentPayload('SUBMITTED');

      await updateShiftInFirestore(shift.id, submitPayload);

      // Apply customer credit debt balances to store directory
      try {
        applyShiftCustomerCredits(customerCredits, shift.store_id);
      } catch (custErr) {
        console.warn('Customer credit sync warning:', custErr);
      }

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

  const [showDeleteDraftConfirm, setShowDeleteDraftConfirm] = useState(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);

  const handleDeleteDraft = async () => {
    setIsDeletingDraft(true);
    try {
      try {
        localStorage.removeItem(`shift_draft_${shift.id}`);
      } catch (e) {}

      await deleteShiftFromFirestore(shift.id);
      onBack();
    } catch (err: any) {
      alert(err.message || 'Σφάλμα κατά τη διαγραφή του προχείρου');
    } finally {
      setIsDeletingDraft(false);
      setShowDeleteDraftConfirm(false);
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
          className="flex items-center space-x-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-2xs cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Επιστροφή στις Βάρδιες</span>
        </button>

        <div className="flex items-center space-x-2.5">
          {draftSavedAt && (
            <span
              className={`text-xs px-2.5 py-1 rounded-xl border font-medium flex items-center space-x-1.5 transition-all duration-300 ${
                isAutoSaved
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${isAutoSaved ? 'text-emerald-600' : 'text-slate-400'}`}
              />
              <span className="hidden sm:inline">Αποθηκεύτηκε: {draftSavedAt}</span>
              <span className="sm:hidden">{draftSavedAt}</span>
            </span>
          )}

          {canManage && (
            <button
              onClick={() => setShowDeleteDraftConfirm(true)}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 shadow-2xs transition-colors cursor-pointer"
              title="Διαγραφή αυτού του προχείρου βάρδιας (Μόνο Ιδιοκτήτης/Διαχειριστής)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Διαγραφή Προχείρου</span>
            </button>
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

      {/* Delete Confirmation Modal */}
      {showDeleteDraftConfirm && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">Διαγραφή Προχείρου Βάρδιας</h4>
                <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">
                  ΕΝΕΡΓΕΙΑ ΙΔΙΟΚΤΗΤΗ / ΔΙΑΧΕΙΡΙΣΤΗ
                </span>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-3.5 space-y-2 text-xs text-rose-950">
              <p className="font-bold">
                Είστε βέβαιοι ότι θέλετε να διαγράψετε οριστικά αυτό το πρόχειρο βάρδιας ({shift.store_name} - {shift.register_id});
              </p>
              <p className="text-[11px] text-rose-700">
                ⚠️ Όλα τα πρόχειρα καταγεγραμμένα στοιχεία της βάρδιας θα διαγραφούν οριστικά.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeletingDraft}
                onClick={() => setShowDeleteDraftConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                disabled={isDeletingDraft}
                onClick={handleDeleteDraft}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingDraft ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Διαγραφή...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Οριστική Διαγραφή</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Προσαύξηση #1 (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={openingTopUp1}
                    onChange={(e) => setOpeningTopUp1(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Προσαύξηση #2 (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={openingTopUp2}
                    onChange={(e) => setOpeningTopUp2(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-white rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Σύνολο Αρχικού Κεφαλαίου:</span>
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

            {/* 2b. Tora Direct (Υπηρεσίες Tora) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 flex-wrap gap-2">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                    <span>📱 Tora Direct (Υπηρεσίες Tora)</span>
                  </h4>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                    Εισάγετε τα ποσά από τα τερματικά Tora Direct (προστίθενται στο ταμείο)
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {(canManage || managerUnlockedPos) && (
                    <button
                      type="button"
                      onClick={handleAddPosItem}
                      className="px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Προσθήκη TORA</span>
                    </button>
                  )}
                  <span className="text-xs font-black text-slate-800 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs font-mono">
                    Σύνολο TORA DIRECT: {totalToraPos.toFixed(2)} €
                  </span>
                </div>
              </div>

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
                          className="text-slate-300 hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
                          title="Διαγραφή TORA DIRECT"
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
                        onChange={(e) => handleUpdatePosItem(item.id, 'amount', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-slate-950 bg-white focus:ring-2 focus:ring-indigo-500 font-black font-mono text-base shadow-2xs"
                      />
                      <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">€</span>
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
                  Καθαρό: {(safeNum(vltsIn) + signedVltsOut).toFixed(2)} €
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
                  <Receipt className="w-5 h-5 text-indigo-600" />
                  <span>Ημερήσια Έξοδα & Αποδείξεις</span>
                </h4>
                <p className="text-xs text-slate-500">Πληρωμές σε προμηθευτές ή αναλώσιμα από το ταμείο.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-bold">
                  <span className="text-slate-600">ΓΠ: <span className="text-slate-900 font-mono">{expensesGpCashTotal.toFixed(2)}€</span></span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-600">FnB: <span className="text-slate-900 font-mono">{expensesFnbCashTotal.toFixed(2)}€</span></span>
                  <span className="text-slate-300">|</span>
                  <span className="text-indigo-700">Σύνολο: <span className="font-mono">{expensesCashTotal.toFixed(2)}€</span></span>
                </div>

                <button
                  type="button"
                  onClick={() => syncExpensesFromStore(true)}
                  disabled={isSyncingExpenses}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Ανάκτηση εξόδων που καταχωρήθηκαν στην ενότητα Έξοδα & Δαπάνες"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingExpenses ? 'animate-spin text-indigo-600' : ''}`} />
                  <span>{isSyncingExpenses ? 'Συγχρονισμός...' : '🔄 Συγχρονισμός'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddExpense}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Προσθήκη Εξόδου</span>
                </button>
              </div>
            </div>

            {syncNotification && (
              <div className="p-3 rounded-xl bg-indigo-50/80 border border-indigo-100 flex items-center justify-between text-xs text-indigo-900 font-semibold animate-fadeIn">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{syncNotification}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSyncNotification(null)}
                  className="text-indigo-400 hover:text-indigo-700 text-xs ml-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

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
                        value={exp.category || 'EXPENSES_GP'}
                        onChange={(e) => {
                          const updated = [...expenses];
                          updated[idx].category = e.target.value;
                          setExpenses(updated);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                      >
                        <option value="EXPENSES_GP">Έξοδα ΓΠ (Γενικά Πληρωμών)</option>
                        <option value="EXPENSES_FNB">Έξοδα FnB (Κυλικείο)</option>
                        <option value="SUPPLIES">Αναλώσιμα / Χαρτί (ΓΠ)</option>
                        <option value="UTILITIES">Λογαριασμοί / ΔΕΗ (ΓΠ)</option>
                        <option value="CLEANING">Καθαριότητα (ΓΠ)</option>
                        <option value="MAINTENANCE">Συντήρηση (ΓΠ)</option>
                        <option value="OTHER">Άλλα Έξοδα (ΓΠ)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        list="shift-suppliers-list"
                        placeholder="Προμηθευτής / Περιγραφή εξόδου..."
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
                        onClick={() => handleRemoveExpense(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Datalist for fast supplier selection */}
            <datalist id="shift-suppliers-list">
              <option value="ΟΠΑΠ Α.Ε. - Κεντρικά" />
              <option value="Coca-Cola 3Ε Ελλάδος Α.Β.Ε.Ε." />
              <option value="Tora Wallet Α.Ε. - Υπηρεσίες Πληρωμών" />
              <option value="ΔΕΗ / Ενέργεια (Ηλεκτρικό Ρεύμα)" />
              <option value="ΕΥΔΑΠ (Ύδρευση / Αποχέτευση)" />
              <option value="Cosmote / ΟΤΕ (Internet & Τηλεφωνία)" />
              <option value="Nova / Wind (Τηλεπικοινωνίες & TV)" />
              <option value="Καθαριστικά & Είδη Υγιεινής" />
              <option value="Χαρτικά, Ρολά POS & Τερματικών" />
              <option value="Προμηθευτής Καφέ & Ροφημάτων (FnB)" />
              <option value="Snacks & Είδη Κυλικείου (FnB)" />
              <option value="Τεχνικός Συντήρησης / Βλάβες" />
            </datalist>
          </div>

          {/* Customer Credit Feature */}
          <div className="pt-4 border-t border-slate-100">
            <CustomerCreditSection
              customerCredits={customerCredits}
              onChangeCredits={setCustomerCredits}
              storeId={shift.store_id}
              isOwnerOrManager={isOwnerOrManager}
            />
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

          {/* Πωλήσεις POS Καταστήματος (POS Καταμέτρησης) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-150 pb-3 flex-wrap gap-2">
              <div>
                <h4 className="font-extrabold text-sm text-indigo-950 uppercase tracking-wider flex items-center space-x-2">
                  <span>💳 Πωλήσεις POS Καταστήματος (POS Καταμέτρησης)</span>
                </h4>
                <p className="text-[11px] font-medium text-indigo-700/80 mt-0.5">
                  Τερματικά POS για πωλήσεις κάρτας — Υπολογίζονται απευθείας στο Σύνολο Καταμέτρησης
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleAddStorePosItem}
                  className="px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Προσθήκη POS</span>
                </button>
                <span className="text-xs font-black text-indigo-800 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-2xs font-mono">
                  Σύνολο POS: {totalStorePos.toFixed(2)} €
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {storePosItems.map((item) => (
                <div key={item.id} className="bg-white p-3.5 rounded-xl border border-indigo-150 space-y-2 relative group shadow-2xs">
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
                        className="text-slate-300 hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
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
                      className="w-full px-3 py-2.5 rounded-xl border border-indigo-200 text-slate-950 bg-white focus:ring-2 focus:ring-indigo-500 font-black font-mono text-base shadow-2xs"
                    />
                    <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">€</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: REVIEW, RECONCILIATION & SUBMISSION */}
      {currentStep === 5 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">5</span>
                <span>Τελικός Έλεγχος & Υποβολή</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Επιβεβαιώστε το ισοζύγιο ταμείου και το Σύνολο Καταμέτρησης πριν την οριστική υποβολή.
              </p>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowReceiptModal(true)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center space-x-2 shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4 text-indigo-300" />
                <span>Προεπισκόπηση & Εκτύπωση Απόδειξης</span>
              </button>
            </div>
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

          {/* 📋 Πλήρες Φύλλο Ισοσκελισμού Βάρδιας (Ακριβές Πρότυπο Excel) */}
          <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 border border-slate-800 shadow-xl space-y-5">
            {/* Excel Top Header */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60 text-xs">
              <div className="space-y-1.5 border-b md:border-b-0 md:border-r border-slate-700/60 pb-3 md:pb-0 md:pr-4">
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-slate-400 font-bold">Κατάστημα:</span>
                  <span className="font-mono font-bold text-white bg-slate-900/60 px-2.5 py-0.5 rounded border border-slate-700/40">
                    {shift.store_code || shift.store_id || '100343'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-slate-400 font-bold">Ημερομηνία:</span>
                  <span className="font-mono font-bold text-white">
                    {shift.opened_at ? new Date(shift.opened_at).toLocaleDateString('el-GR') : new Date().toLocaleDateString('el-GR')}
                  </span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-slate-400 font-bold">Βάρδια:</span>
                  <span className="font-mono font-bold text-indigo-300">
                    {shift.shift_type === 'MORNING' ? 'A (Πρωινή)' : shift.shift_type === 'AFTERNOON' ? 'B (Απογευματινή)' : (shift.shift_type || 'B')}
                  </span>
                </div>
              </div>

              <div className="space-y-2 flex flex-col justify-between">
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-slate-400 font-bold">Όνομα Χρήστη:</span>
                  <span className="font-bold text-white">
                    {shift.opened_by_user_name || shift.opened_by_user_id || 'Περικλής Βέττας'}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-700/80">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                    Αποτέλεσμα Ταμείου:
                  </span>
                  <span
                    className={`font-mono text-base font-black px-2.5 py-0.5 rounded-lg ${
                      discResult.discrepancy === 0
                        ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-500/30'
                        : Math.abs(discResult.discrepancy) <= safeNum(discrepancyThreshold)
                        ? 'text-amber-300 bg-amber-950/60 border border-amber-500/30'
                        : 'text-rose-400 bg-rose-950/60 border border-rose-500/30'
                    }`}
                  >
                    {discResult.discrepancy >= 0 ? '+' : ''}
                    {discResult.discrepancy.toFixed(2)} €
                  </span>
                </div>
              </div>
            </div>

            {/* 2-Column Excel Sheet Replica */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {/* LEFT COLUMN: Αναφορές */}
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700/60 overflow-hidden flex flex-col justify-between">
                {/* Column Banner */}
                <div className="bg-blue-900/90 text-white text-center py-2 text-xs font-black uppercase tracking-wider border-b border-blue-800 shadow-xs">
                  Αναφορές
                </div>

                <div className="p-3.5 space-y-3.5 text-xs">
                  {/* 1. Ελληνικά Λαχεία | Σκρατς */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Ελληνικά Λαχεία | Σκρατς
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Πωλήσεις:</span>
                      <span className="font-mono font-bold text-white">{safeNum(scratchSales).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Εξαργυρώσεις:</span>
                      <span className="font-mono font-bold text-white">{safeNum(scratchPayouts).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{totalScratchNet.toFixed(2)} €</span>
                    </div>
                  </div>

                  {/* 2. Tora */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Tora
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Pos #1:</span>
                      <span className="font-mono font-bold text-white">{toraPosItems[0] ? safeNum(toraPosItems[0].amount).toFixed(2) + ' €' : totalToraPos.toFixed(2) + ' €'}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Pos #2:</span>
                      <span className="font-mono font-bold text-white">{toraPosItems[1] ? safeNum(toraPosItems[1].amount).toFixed(2) + ' €' : '0.00 €'}</span>
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{totalToraPos.toFixed(2)} €</span>
                    </div>
                  </div>

                  {/* 3. Clever Point */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Clever Point
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold pt-0.5">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{safeNum(cleverPointTotal).toFixed(2)} €</span>
                    </div>
                  </div>

                  {/* 4. Ιππόδρομος */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Ιππόδρομος
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Υπόλοιπο Ταμείου:</span>
                      <span className="font-mono font-bold text-white">{safeNum(ippodromosBalance).toFixed(2)} €</span>
                    </div>
                  </div>

                  {/* 5. VLTs */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      VLTs
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Μετρητά στα VLTs:</span>
                      <span className="font-mono font-bold text-white">{safeNum(vltsIn).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Ροή Μετρητών:</span>
                      <span className={`font-mono font-bold ${signedVltsOut < 0 ? 'text-rose-400' : signedVltsOut > 0 ? 'text-emerald-400' : 'text-white'}`}>
                        {signedVltsOut !== 0 ? (signedVltsOut < 0 ? '-' + Math.abs(signedVltsOut).toFixed(2) + ' €' : '+' + signedVltsOut.toFixed(2) + ' €') : '0.00 €'}
                      </span>
                    </div>
                  </div>

                  {/* 6. Pame Stoixima | Virtuals */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Pame Stoixima | Virtuals
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Υπόλοιπο Ταμείου:</span>
                      <span className="font-mono font-bold text-white">{safeNum(pameStoiximaBalance).toFixed(2)} €</span>
                    </div>
                  </div>

                  {/* 7. Αριθμοπαιχνίδια */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Αριθμοπαιχνίδια
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Πωλήσεις:</span>
                      <span className="font-mono font-bold text-white">{safeNum(arithmoGross).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Ακυρώσεις:</span>
                      <span className="font-mono font-bold text-white">{safeNum(arithmoCancels).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Εξαργυρώσεις:</span>
                      <span className="font-mono font-bold text-white">{safeNum(arithmoPayouts).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Vouchers:</span>
                      <span className={`font-mono font-bold ${safeNum(arithmoVouchers) < 0 ? 'text-rose-400' : 'text-white'}`}>
                        {safeNum(arithmoVouchers) !== 0 ? (safeNum(arithmoVouchers) < 0 ? '-' + Math.abs(safeNum(arithmoVouchers)).toFixed(2) + ' €' : safeNum(arithmoVouchers).toFixed(2) + ' €') : '0.00 €'}
                      </span>
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{totalArithmoNet.toFixed(2)} €</span>
                    </div>
                  </div>

                  {/* 8. Ταμείο FnB */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Ταμείο FnB
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Μετρητά:</span>
                      <span className="font-mono font-bold text-white">{(safeNum(fnbCash) > 0 ? safeNum(fnbCash) : safeNum(fnbSales)).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Pos:</span>
                      <span className="font-mono font-bold text-white">{safeNum(fnbCard).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{(safeNum(fnbCash) + safeNum(fnbCard) > 0 ? safeNum(fnbCash) + safeNum(fnbCard) : safeNum(fnbSales)).toFixed(2)} €</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Left Blue Bar */}
                <div className="bg-blue-900 text-white px-4 py-2.5 flex justify-between items-center text-xs font-black uppercase tracking-wider border-t border-blue-800">
                  <span>Σύνολο Ταμείου (Αναφορές):</span>
                  <span className="font-mono text-sm">{expectedCash.toFixed(2)} €</span>
                </div>
              </div>

              {/* RIGHT COLUMN: Καταμέτρηση */}
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700/60 overflow-hidden flex flex-col justify-between">
                {/* Column Banner */}
                <div className="bg-blue-900/90 text-white text-center py-2 text-xs font-black uppercase tracking-wider border-b border-blue-800 shadow-xs">
                  Καταμέτρηση
                </div>

                <div className="p-3.5 space-y-3.5 text-xs">
                  {/* Block 1: Αρχικό κεφάλαιο */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Αρχικό κεφάλαιο
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Μετρητά:</span>
                      <span className="font-mono font-bold text-white">{safeNum(openingNotesAmount).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Κέρματα:</span>
                      <span className="font-mono font-bold text-white">{safeNum(openingCoinsAmount).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Προσαύξηση #1:</span>
                      <span className="font-mono font-bold text-white">{safeNum(openingTopUp1).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Προσαύξηση #2:</span>
                      <span className="font-mono font-bold text-white">{safeNum(openingTopUp2).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{openingCashTotal.toFixed(2)} €</span>
                    </div>
                  </div>

                  {/* Block 2: Κέρματα Ταμείου */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Κέρματα Ταμείου
                    </div>
                    <div className="space-y-0.5 max-h-36 overflow-y-auto pr-1">
                      {[
                        { label: '2x', key: '2', val: 2 },
                        { label: '1x', key: '1', val: 1 },
                        { label: '0.5x', key: '0.50', altKey: '0.5', val: 0.5 },
                        { label: '0.2x', key: '0.20', altKey: '0.2', val: 0.2 },
                        { label: '0.1x', key: '0.10', altKey: '0.1', val: 0.1 },
                      ].map((c) => {
                        const rawQty =
                          denominations[c.key] ??
                          (c.altKey ? denominations[c.altKey] : undefined) ??
                          denominations[`eur_${c.key.replace('.', '')}`] ??
                          denominations[`eur_${c.key}`];
                        const qty = Math.floor(safeNum(rawQty));
                        const subtotal = roundCurrency(qty * c.val);
                        return (
                          <div key={c.key} className="flex justify-between items-center py-0.5 border-b border-slate-700/20 text-xs">
                            <span className="font-mono text-slate-300 font-bold w-12">{c.label}</span>
                            <span className="font-mono text-slate-200 font-bold text-center flex-1">{qty}</span>
                            <span className="font-mono font-bold text-white w-20 text-right">{subtotal.toFixed(2)} €</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{banknotesAndCoins.coins.toFixed(2)} €</span>
                    </div>
                  </div>

                  {/* Block 3: Μετρητά Ταμείου */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Μετρητά Ταμείου
                    </div>
                    <div className="space-y-0.5 max-h-36 overflow-y-auto pr-1">
                      {[
                        { label: '5x', key: '5', val: 5 },
                        { label: '10x', key: '10', val: 10 },
                        { label: '20x', key: '20', val: 20 },
                        { label: '50x', key: '50', val: 50 },
                        { label: '100x', key: '100', val: 100 },
                        { label: '200x', key: '200', val: 200 },
                        { label: '500x', key: '500', val: 500 },
                      ].map((n) => {
                        const rawQty =
                          denominations[n.key] ??
                          denominations[`eur_${n.key}`];
                        const qty = Math.floor(safeNum(rawQty));
                        const subtotal = roundCurrency(qty * n.val);
                        return (
                          <div key={n.key} className="flex justify-between items-center py-0.5 border-b border-slate-700/20 text-xs">
                            <span className="font-mono text-slate-300 font-bold w-12">{n.label}</span>
                            <span className="font-mono text-slate-200 font-bold text-center flex-1">{qty}</span>
                            <span className="font-mono font-bold text-white w-20 text-right">{subtotal.toFixed(2)} €</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{banknotesAndCoins.banknotes.toFixed(2)} €</span>
                    </div>
                  </div>

                  {/* Block 4: Ταμείο */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-[11px] uppercase tracking-wider">
                      Ταμείο
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Μετρητά:</span>
                      <span className="font-mono font-bold text-white">{banknotesAndCoins.banknotes.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Κέρματα:</span>
                      <span className="font-mono font-bold text-white">{banknotesAndCoins.coins.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Χρηματοκιβώτιο:</span>
                      <span className="font-mono font-bold text-white">{safeNum(bankDeposits).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Pos #1:</span>
                      <span className="font-mono font-bold text-white">{storePosItems[0] ? safeNum(storePosItems[0].amount).toFixed(2) + ' €' : totalStorePos.toFixed(2) + ' €'}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Pos #2:</span>
                      <span className="font-mono font-bold text-white">{storePosItems[1] ? safeNum(storePosItems[1].amount).toFixed(2) + ' €' : '0.00 €'}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Έξοδα ΓΠ:</span>
                      <span className="font-mono font-bold text-white">{expensesGpCashTotal.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Έξοδα FnB:</span>
                      <span className="font-mono font-bold text-white">{expensesFnbCashTotal.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Πιστώσεις:</span>
                      <span className="font-mono font-bold text-white">{creditGrantedTotal.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Επιστροφές:</span>
                      <span className="font-mono font-bold text-rose-300">{creditCollectedTotal > 0 ? '-' + creditCollectedTotal.toFixed(2) + ' €' : '0.00 €'}</span>
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{reconciliationBreakdown.grossTotal.toFixed(2)} €</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Right Blue Bar */}
                <div className="bg-blue-900 text-white px-4 py-2.5 flex justify-between items-center text-xs font-black uppercase tracking-wider border-t border-blue-800">
                  <span>Σύνολο Καταμέτρησης:</span>
                  <span className="font-mono text-sm text-emerald-300">{totalReconciliationCount.toFixed(2)} €</span>
                </div>
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

      {/* Print Receipt Modal (When requested by user) */}
      <ShiftReceiptPrintView
        data={receiptData}
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
      />

      {/* Dedicated Print-Only DOM element for thermal/A4 printing */}
      <div className="print-only">
        <ShiftReceiptPrintView data={receiptData} isInline={true} />
      </div>
    </div>
  );
};

