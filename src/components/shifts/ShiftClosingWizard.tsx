import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Receipt,
  Vault,
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
  Eye,
} from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchShiftReconciliationExpenses, createAndSyncShiftExpense, updateExpenseInFirestore, deleteAndSyncShiftExpense } from '../../services/moduleServices.ts';
import {
  deleteShiftFromFirestore, fetchDayCustomerCredits, DayCustomerCredit,
} from '../../services/shiftService.ts';
import { fetchSuppliersFromFirestore } from '../../services/supplierService.ts';
import { ShiftReceiptPrintView, ShiftReceiptData } from './ShiftReceiptPrintView.tsx';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { readTopUps, topUpsForLegacyFields, totalTopUps } from '../../lib/shiftTopUps.ts';
import { readSafeDrops, safeDropShiftFields, sortSafeDrops, totalSafeDrops, type SafeDrop } from '../../lib/shiftSafeDrops.ts';
import { calculateEnvelope } from '../../lib/shiftEnvelope.ts';
import { splitDiscrepancy, DiscrepancySettlement } from '../../lib/discrepancySplit.ts';
import {
  ScratchCalculatorTable,
  lockScratchRowsForSave,
  DEFAULT_SCRATCH_PRESETS,
  ScratchTicketRow,
  calculateRowTotal,
  isLotteryRow,
  mergeScratchCatalogWithSaved,
  carryOverScratchInventory,
  getLatestStoreScratchInventory,
  saveLatestStoreScratchInventory,
  applyCountingDefaults,
  applyLaikoDefaults,
  ScratchSellingMode,
} from './ScratchCalculatorTable.tsx';
import { getShiftTemplateConfig } from '../../services/shiftTemplateService.ts';
import { fetchScratchCatalog } from '../../services/scratchCatalogService.ts';
import { getNationalLotteryShiftContribution } from '../../services/nationalLotteryService.ts';
import { CustomerCreditSection } from './CustomerCreditSection.tsx';
import { applyShiftCustomerCredits } from '../../services/customerCreditService.ts';
import { requestNotificationsRefresh } from '../../services/notificationService.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { MAX_CURRENCY_AMOUNT, parseNonNegativeAmount, MAX_LABEL_LENGTH, MAX_NOTES_LENGTH } from '../../lib/limits.ts';
import { TOAST_AUTO_DISMISS_MS, SUBMIT_SUCCESS_REDIRECT_MS } from '../../lib/timing.ts';

export interface ToraPosItem {
  id: string;
  name: string;
  amount: string;
}

const SHARED_POS_COUNT_KEY = (storeId?: string) => `shiftledger_shared_pos_count_${storeId || 'default'}`;

function getSavedSharedPosCount(storeId?: string): number {
  try {
    if (typeof window === 'undefined') return 2;
    const raw = localStorage.getItem(SHARED_POS_COUNT_KEY(storeId));
    if (raw) {
      const num = parseInt(raw, 10);
      if (!isNaN(num) && num >= 1) return num;
    }
  } catch (e) {
    console.warn(e);
  }
  return 2;
}

function saveSharedPosCount(storeId: string | undefined, count: number): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SHARED_POS_COUNT_KEY(storeId), String(Math.max(1, count)));
  } catch (e) {
    console.warn(e);
  }
}

function getSavedStorePosConfig(storeId?: string, targetCount?: number): ToraPosItem[] {
  const count = targetCount ?? getSavedSharedPosCount(storeId);
  let list: ToraPosItem[] = [];
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`shiftledger_store_pos_${storeId || 'default'}`) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = parsed.map((p: any) => ({ ...p, amount: '' }));
      }
    }
  } catch (e) {
    console.warn(e);
  }
  while (list.length < count) {
    const idx = list.length + 1;
    list.push({ id: `store_pos_${Date.now()}_${idx}`, name: `Pos #${idx}`, amount: '' });
  }
  if (list.length > count) {
    list = list.slice(0, count);
  }
  return list;
}

function saveStorePosConfig(storeId: string | undefined, items: ToraPosItem[]): void {
  try {
    if (typeof window === 'undefined') return;
    const clean = items.map((p) => ({ id: p.id, name: p.name, amount: '' }));
    localStorage.setItem(`shiftledger_store_pos_${storeId || 'default'}`, JSON.stringify(clean));
    localStorage.setItem(SHARED_POS_COUNT_KEY(storeId), String(clean.length));
  } catch (e) {
    console.warn(e);
  }
}

function getSavedToraPosConfig(storeId?: string, targetCount?: number): ToraPosItem[] {
  const count = targetCount ?? getSavedSharedPosCount(storeId);
  let list: ToraPosItem[] = [];
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`shiftledger_tora_pos_${storeId || 'default'}`) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = parsed.map((p: any) => ({ ...p, amount: '' }));
      }
    }
  } catch (e) {
    console.warn(e);
  }
  while (list.length < count) {
    const idx = list.length + 1;
    list.push({ id: `tora_${Date.now()}_${idx}`, name: `TORA DIRECT #${idx}`, amount: '' });
  }
  if (list.length > count) {
    list = list.slice(0, count);
  }
  return list;
}

function saveToraPosConfig(storeId: string | undefined, items: ToraPosItem[]): void {
  try {
    if (typeof window === 'undefined') return;
    const clean = items.map((p) => ({ id: p.id, name: p.name, amount: '' }));
    localStorage.setItem(`shiftledger_tora_pos_${storeId || 'default'}`, JSON.stringify(clean));
    localStorage.setItem(SHARED_POS_COUNT_KEY(storeId), String(clean.length));
  } catch (e) {
    console.warn(e);
  }
}
import {
  EUR_DENOMINATIONS,
  calculateCountedCash,
  calculateDiscrepancy,
  calculateExpectedCash,
  resolveFnbCash,
  calculateReconciliationNetTotal,
  calculateReconciliationBreakdown,
  calculateBanknotesAndCoins,
  safeNum,
  roundCurrency,
} from '../../services/financialCalculator.ts';
import { CashDenominationCounter } from './CashDenominationCounter.tsx';
import { CarriedOverSummary } from './CarriedOverSummary.tsx';
import { isCarriedExpense } from '../../lib/expenseCarry.ts';
import { duplicateGroups } from '../../lib/duplicateExpense.ts';
import { Shift, ShiftExpense, CustomerCredit } from '../../types/index.ts';
import { updateShiftInFirestore } from '../../services/shiftService.ts';

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
  const { token, roles, permissions, user, organization, isLoading: isAuthLoading } = useAuth();
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
  // A list, not two fixed slots. A till can be topped up more than twice in a
  // shift, and «Προσαύξηση #2» was simply where the third one had nowhere to
  // go.
  //
  // Still written back as opening_topup_1 and opening_topup_2 as well: the
  // first entry and the sum of the rest. The monthly P&L reads those two and
  // adds them (pnlService), so the total it reports stays right whether a
  // shift recorded one top-up or five.
  const [topUps, setTopUps] = useState<string[]>(() =>
    readTopUps(shift.custom_field_values ?? localDraft?.custom_field_values)
  );

  const topUpTotal = totalTopUps(topUps);

  const openingCashTotal =
    safeNum(openingNotesAmount) +
    safeNum(openingCoinsAmount) +
    topUpTotal;

  // Step 2 - Granular OPAP Reports State
  // 1. Ελληνικά Λαχεία | Σκρατς
  const [scratchRows, setScratchRows] = useState<ScratchTicketRow[]>(() => {
    // The presets, for the first paint only. The store's real catalogue is
    // read from the database in an effect below and merged over this - it used
    // to come out of this browser's localStorage, which meant the Owner's
    // laptop and the till computer each had their own list of games at their
    // own prices.
    const catalog = DEFAULT_SCRATCH_PRESETS;
    const saved =
      shift.custom_field_values?.scratch_ticket_items ||
      localDraft?.custom_field_values?.scratch_ticket_items;
    if (Array.isArray(saved) && saved.length > 0) {
      return mergeScratchCatalogWithSaved(catalog, saved);
    }

    const storeLatest = getLatestStoreScratchInventory(shift.store_id);
    if (storeLatest && Array.isArray(storeLatest) && storeLatest.length > 0) {
      return carryOverScratchInventory(storeLatest, catalog);
    }

    return catalog;
  });

  // The store's hard Scratch Selling Mode ceiling (shift_templates.
  // scratch_selling_mode) - fetched alongside the counting defaults below.
  // Defaults to 'FRONT_AND_BACK' (today's behavior for every store) until
  // the fetch resolves, so there's no flash of an incorrectly-ceilinged
  // total before load.
  const [scratchSellingMode, setScratchSellingMode] = useState<ScratchSellingMode>('FRONT_AND_BACK');
  // Two more store settings fetched alongside the ones above - see
  // 0017_scratch_layout_settings.sql. Defaults match DEFAULT_OPAP_SHIFT_
  // TEMPLATE exactly, so there's no flash of the wrong state before load.
  const [specialEditionEnabled, setSpecialEditionEnabled] = useState(false);

  // Which modules this store actually runs.
  //
  // Every one of these has had a switch in «Διαμόρφωση» since the first
  // migration, and not one of them was ever read here: the wizard fetched the
  // template for five scratch settings and ignored the rest. Turning off a
  // module an agency does not have - a café it never built, VLTs it does not
  // host - saved a row in the database and changed nothing an employee saw.
  //
  // Defaults are all on, matching every existing store, so nothing flashes
  // off and back on while the template loads.
  // Who may move the figures the till is measured against. Defaults are the
  // strict ones; a store opens them up in «Διαμόρφωση». canManage is still
  // what actually unlocks them - these only decide whether an employee counts
  // as allowed on top of that.
  const [floatEditableByEmployee, setFloatEditableByEmployee] = useState(false);
  // How many terminals this store has, per «Διαμόρφωση». It used to be a
  // number in this browser's localStorage, which meant the till computer and
  // the Owner's laptop could disagree about how many machines the shop owns.
  const [configuredPosCount, setConfiguredPosCount] = useState<number | null>(null);
  const [supplierNames, setSupplierNames] = useState<string[]>([]);
  const [topUpAllowedForEmployee, setTopUpAllowedForEmployee] = useState(false);
  const [safeDropAllowedForEmployee, setSafeDropAllowedForEmployee] = useState(false);
  const [newSafeDropAmount, setNewSafeDropAmount] = useState('');
  const [newSafeDropNote, setNewSafeDropNote] = useState('');

  const [modules, setModules] = useState({
    scratch: true,
    nationalLottery: true,
    tora: true,
    cleverPoint: true,
    ippodromos: true,
    vlts: true,
    pameStoixima: true,
    numberGames: true,
    fnb: true,
  });
  const [laikoSellingMode, setLaikoSellingMode] = useState<'PIECES_AND_BUNDLES' | 'BUNDLES_ONLY'>('PIECES_AND_BUNDLES');

  // Fills the org/store admin default (Configurator -> "Καταμέτρηση Σκρατς &
  // Λαχείων") into any scratch row still on its historical hardcoded
  // default. Async, so it necessarily runs a tick after scratchRows' own
  // synchronous initializer above - applyCountingDefaults only ever fills
  // an undefined field, so this can never clobber a row this shift (or an
  // earlier explicit toggle carried in via the catalog) has already set.
  useEffect(() => {
    let cancelled = false;
    fetchSuppliersFromFirestore(shift.organization_id || organization!.id)
      .then((list) => {
        if (cancelled) return;
        setSupplierNames(
          list
            .map((sup) => (sup.trade_name || sup.company_name || '').trim())
            .filter((name) => name.length > 0)
            .sort((a, b) => a.localeCompare(b, 'el'))
        );
      })
      .catch((err) => console.warn('[ShiftClosingWizard] could not load suppliers:', err));
    return () => {
      cancelled = true;
    };
  }, [shift.organization_id, organization]);

  // The store's catalogue of games, from the database rather than from this
  // browser. Merged over whatever is on screen, so a row already being counted
  // keeps its figures and only the definitions - name, price, bundle, order -
  // come from the catalogue.
  useEffect(() => {
    let cancelled = false;
    fetchDayCustomerCredits(shift.id)
      .then((rows) => {
        if (!cancelled) setCarriedCredits(rows);
      })
      .catch((err) => console.warn('[ShiftClosingWizard] day credits:', err));
    return () => {
      cancelled = true;
    };
  }, [shift.id]);

  useEffect(() => {
    let cancelled = false;
    fetchScratchCatalog(shift.organization_id || organization!.id, shift.store_id)
      .then((catalog) => {
        if (cancelled) return;
        setScratchRows((current) => mergeScratchCatalogWithSaved(catalog, current));
      })
      .catch((err) => console.warn('[ShiftClosingWizard] could not load the scratch catalogue:', err));
    return () => {
      cancelled = true;
    };
  }, [shift.organization_id, shift.store_id, organization]);

  useEffect(() => {
    let cancelled = false;
    const orgId = shift.organization_id || organization!.id;
    getShiftTemplateConfig(orgId, shift.store_id)
      .then((config) => {
        if (cancelled) return;
        setScratchRows((prev) =>
          applyLaikoDefaults(
            applyCountingDefaults(prev, {
              scratch_backside_default: config.scratch_backside_default,
              lottery_bundle_default: config.lottery_bundle_default,
            })
          )
        );
        setScratchSellingMode(config.scratch_selling_mode || 'FRONT_AND_BACK');
        setSpecialEditionEnabled(config.special_edition_enabled === true);
        setLaikoSellingMode(config.laiko_selling_mode || 'PIECES_AND_BUNDLES');
        // `!== false` rather than a truthy test: a template row that predates
        // one of these columns reads undefined, and the safe answer there is
        // to keep showing the module rather than to hide a till section.
        setFloatEditableByEmployee(config.opening_float_employee_editable === true);
        setConfiguredPosCount(Math.max(1, Number(config.pos_terminal_count) || 2));
        setTopUpAllowedForEmployee(config.topup_employee_allowed === true);
        setSafeDropAllowedForEmployee((config as any).safedrop_employee_allowed === true);
        // The store's rule, not this shift's. A shift already closed keeps the
        // threshold it was judged against (shift.discrepancy_threshold above);
        // one still open follows the configuration.
        if (shift.status === 'OPEN' || shift.status === 'DRAFT_CLOSING') {
          setDiscrepancyThreshold(String(config.discrepancy_threshold ?? 15));
        }
        setModules({
          scratch: config.show_scratch !== false,
          nationalLottery: config.show_national_lottery !== false,
          tora: config.show_tora !== false,
          cleverPoint: config.show_clever_point !== false,
          ippodromos: config.show_ippodromos !== false,
          vlts: config.show_vlts !== false,
          pameStoixima: config.show_pame_stoixima !== false,
          numberGames: config.show_number_games !== false,
          fnb: config.show_fnb !== false,
        });
      })
      .catch((err) => {
        console.warn('[ShiftClosingWizard] Could not load scratch counting defaults:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [shift.id, shift.organization_id, shift.store_id, organization?.id]);

  // Auto-calculated total from scratch & lottery rows
  const autoCalculatedScratchSales = useMemo(() => {
    return scratchRows.reduce((sum, r) => sum + calculateRowTotal(r, scratchSellingMode), 0);
  }, [scratchRows, scratchSellingMode]);

  const [scratchSalesManualOverride, setScratchSalesManualOverride] = useState(false);

  const [scratchSales, setScratchSales] = useState<string>(() => {
    const tableTotal = scratchRows.reduce((sum, r) => sum + calculateRowTotal(r), 0);
    if (tableTotal > 0) {
      return tableTotal.toFixed(2);
    }
    // `shift.scratch_sales` used to be checked first, and `localDraft
    // .scratch_sales` after - shifts has no such column and never has, so
    // both were dead. The net is the only stored figure, and the table
    // rebuilds the gross from its own rows on the next render anyway.
    if (shift.scratch_lotto_sales !== undefined && shift.scratch_lotto_sales > 0) {
      return Number(shift.scratch_lotto_sales).toFixed(2);
    }
    return tableTotal.toFixed(2);
  });

  // Automatically keep scratchSales in sync with table calculations
  useEffect(() => {
    if (!scratchSalesManualOverride) {
      setScratchSales(autoCalculatedScratchSales.toFixed(2));
    }
  }, [autoCalculatedScratchSales, scratchSalesManualOverride]);

  const [scratchPayouts, setScratchPayouts] = useState<string>(
    shift.scratch_payouts !== undefined
      ? String(shift.scratch_payouts)
      : localDraft?.scratch_payouts !== undefined
      ? String(localDraft.scratch_payouts)
      : ''
  );

  const handleScratchRowsChange = (newRows: ScratchTicketRow[]) => {
    setScratchRows(newRows);
    // No catalogue write here. This fires on every keystroke of a serial
    // number, and it used to rewrite the store's whole list of games from
    // whatever the employee had on screen. The catalogue is the Owner's, is
    // edited in «Διαμόρφωση», and is Owner-only in the database (0030), so
    // this call would now be refused anyway.
    saveLatestStoreScratchInventory(shift.store_id, newRows);
    // Αυτόματος υπολογισμός συνολικής αξίας πωλήσεων Σκρατς & Λαχείων από τον πίνακα
    const totalCalc = newRows.reduce((sum, r) => sum + calculateRowTotal(r), 0);
    if (!scratchSalesManualOverride) {
      setScratchSales(totalCalc.toFixed(2));
    }
  };

  // 2. POS Terminals (Unified physical machines count: Store Card POS & Tora Direct POS)
  // Both are the same physical devices with different usages. Their results/amounts are strictly separated.
  const initialSharedTargetCount = (() => {
    const savedStore =
      shift.custom_field_values?.store_pos_items ||
      localDraft?.custom_field_values?.store_pos_items;
    const savedTora =
      shift.custom_field_values?.tora_pos_items ||
      localDraft?.custom_field_values?.tora_pos_items;
    const savedSharedCount = getSavedSharedPosCount(shift.store_id);
    return Math.max(
      Array.isArray(savedStore) ? savedStore.length : 0,
      Array.isArray(savedTora) ? savedTora.length : 0,
      savedSharedCount,
      2
    );
  })();

  const [storePosItems, setStorePosItems] = useState<ToraPosItem[]>(() => {
    const savedStore =
      shift.custom_field_values?.store_pos_items ||
      localDraft?.custom_field_values?.store_pos_items;

    let items: ToraPosItem[] = [];
    if (Array.isArray(savedStore) && savedStore.length > 0) {
      items = [...savedStore];
    } else {
      items = getSavedStorePosConfig(shift.store_id, initialSharedTargetCount);
      const reg1 = shift.register_pos_1 ?? localDraft?.register_pos_1;
      const reg2 = shift.register_pos_2 ?? localDraft?.register_pos_2;
      const cardPay = shift.card_payments ?? localDraft?.card_payments;

      if (reg1 !== undefined && reg1 !== 0 && items.length > 0) {
        items[0].amount = String(reg1);
      } else if (cardPay && items.length > 0) {
        items[0].amount = String(cardPay);
      }
      if (reg2 !== undefined && reg2 !== 0 && items.length > 1) {
        items[1].amount = String(reg2);
      }
    }

    while (items.length < initialSharedTargetCount) {
      const idx = items.length + 1;
      items.push({ id: `store_pos_${Date.now()}_${idx}`, name: `Pos #${idx}`, amount: '' });
    }
    return items;
  });

  const [toraPosItems, setToraPosItems] = useState<ToraPosItem[]>(() => {
    const savedTora =
      shift.custom_field_values?.tora_pos_items ||
      localDraft?.custom_field_values?.tora_pos_items;

    let items: ToraPosItem[] = [];
    if (Array.isArray(savedTora) && savedTora.length > 0) {
      items = [...savedTora];
    } else {
      items = getSavedToraPosConfig(shift.store_id, initialSharedTargetCount);
      const p1 = shift.tora_pos1 ?? shift.tora_pos_1 ?? localDraft?.tora_pos1 ?? localDraft?.tora_pos_1;
      const p2 = shift.tora_pos2 ?? shift.tora_pos_2 ?? localDraft?.tora_pos2 ?? localDraft?.tora_pos_2;

      if (p1 !== undefined && p1 !== 0 && items.length > 0) {
        items[0].amount = String(p1);
      }
      if (p2 !== undefined && p2 !== 0 && items.length > 1) {
        items[1].amount = String(p2);
      }
    }

    while (items.length < initialSharedTargetCount) {
      const idx = items.length + 1;
      items.push({ id: `tora_${Date.now()}_${idx}`, name: `TORA DIRECT #${idx}`, amount: '' });
    }
    return items;
  });

  // Guarantee that storePosItems and toraPosItems always have identical count of physical machines
  useEffect(() => {
    if (storePosItems.length !== toraPosItems.length) {
      const maxLen = Math.max(storePosItems.length, toraPosItems.length);
      if (storePosItems.length < maxLen) {
        setStorePosItems((prev) => {
          const next = [...prev];
          while (next.length < maxLen) {
            const idx = next.length + 1;
            next.push({ id: `store_pos_${Date.now()}_${idx}`, name: `Pos #${idx}`, amount: '' });
          }
          return next;
        });
      }
      if (toraPosItems.length < maxLen) {
        setToraPosItems((prev) => {
          const next = [...prev];
          while (next.length < maxLen) {
            const idx = next.length + 1;
            next.push({ id: `tora_${Date.now()}_${idx}`, name: `TORA DIRECT #${idx}`, amount: '' });
          }
          return next;
        });
      }
    }
  }, [storePosItems.length, toraPosItems.length]);

  // Bring both lists to the configured number of terminals. The pair is kept
  // the same length by the effect above; this decides what that length is.
  // Only ever applied to a shift still being counted - a closed one keeps the
  // terminals it was actually counted on.
  useEffect(() => {
    if (configuredPosCount === null) return;
    if (shift.status !== 'OPEN' && shift.status !== 'DRAFT_CLOSING') return;

    const resize = (items: ToraPosItem[], label: (n: number) => string): ToraPosItem[] => {
      if (items.length === configuredPosCount) return items;
      if (items.length > configuredPosCount) return items.slice(0, configuredPosCount);
      const next = [...items];
      for (let i = items.length; i < configuredPosCount; i += 1) {
        next.push({ id: `${label(i + 1)}_${Date.now()}_${i}`, name: label(i + 1), amount: '' });
      }
      return next;
    };

    setToraPosItems((prev) => resize(prev, (n) => `TORA DIRECT #${n}`));
    setStorePosItems((prev) => resize(prev, (n) => `Pos #${n}`));
  }, [configuredPosCount, shift.status]);

  // Synchronized Terminal Management
  // Adding or removing a POS terminal applies to both Store POS & Tora Direct POS simultaneously





  // Updating amounts remains strictly independent between Store POS and TORA Direct
  const handleUpdateStorePosItem = (id: string, field: 'name' | 'amount', value: string) => {
    setStorePosItems((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, [field]: value } : item));
      if (field === 'name') {
        saveStorePosConfig(shift.store_id, updated);
      }
      return updated;
    });
  };

  const handleUpdatePosItem = (id: string, field: 'name' | 'amount', value: string) => {
    setToraPosItems((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, [field]: value } : item));
      if (field === 'name') {
        saveToraPosConfig(shift.store_id, updated);
      }
      return updated;
    });
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
  // One signed figure, typed as it is meant: «-307» for a payout. This used to
  // be a magnitude plus an «Εκροή / Είσπραξη» toggle, which is two controls and
  // one more thing to get wrong on a till that is already being counted.
  //
  // shifts.vlts_cash_out is stored signed and always has been, so it is what
  // seeds this. The older vlts_cash_out_type / _raw pair is still read, so a
  // draft saved before this change reopens showing the same number; nothing
  // writes that pair any more.
  const [vltsOut, setVltsOut] = useState<string>(() => {
    if (rawVltsOutNum !== 0) return String(rawVltsOutNum);
    if (savedVltsRaw !== undefined && savedVltsRaw !== '') {
      const magnitude = Math.abs(Number(savedVltsRaw) || 0);
      if (!magnitude) return '';
      return savedVltsType === 'POSITIVE' ? String(magnitude) : String(-magnitude);
    }
    return '';
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

  // Safe drops: cash moved to the χρηματοκιβώτιο during the shift.
  //
  // This used to be a single `bankDeposits` figure whose setter was never
  // called from anywhere, so the feature had no way in and every shift the
  // app created read 0. It is a list now, each entry carrying its own amount,
  // note and time, and the total still lands in bank_deposits / safe_drop -
  // the reconciliation adds that back, which is how money in the safe stays
  // money the shift took rather than money missing.
  const [safeDrops, setSafeDrops] = useState<SafeDrop[]>(() =>
    sortSafeDrops(readSafeDrops(shift.custom_field_values ?? localDraft?.custom_field_values))
  );
  const bankDeposits = String(totalSafeDrops(safeDrops));
  const [discrepancyThreshold, setDiscrepancyThreshold] = useState<string>(
    String(shift.discrepancy_threshold || localDraft?.discrepancy_threshold || 10.0)
  );

  // What the operator decided about the part of a shortage the tolerance does
  // not cover. Asked at submission, not before: the figure moves while they
  // are still counting, and being asked to commit to paying 3 € that becomes
  // 0 € two entries later is how people stop reading dialogs.
  // «Παράδοση κερμάτων»: coins that would not fit the tray, collected in a
  // cup and handed over with the envelope once it fills. Recorded as an
  // expense until now and deleted again later - which cut the day's profit
  // while it stood and left no trace once it was gone.
  // Credits and returns from earlier shifts of the same day. Read-only here:
  // they belong to a shift that is already closed. Shown as one summary that
  // opens into the individual entries, rather than a list of other people's
  // customers burying this operator's own.
  const [carriedCredits, setCarriedCredits] = useState<DayCustomerCredit[]>([]);

  const [coinHandover, setCoinHandover] = useState<string>(
    shift.coin_handover !== undefined && shift.coin_handover !== null
      ? String(shift.coin_handover)
      : ''
  );

  const [discrepancySettlement, setDiscrepancySettlement] =
    useState<DiscrepancySettlement | null>(
      (shift.discrepancy_settlement as DiscrepancySettlement | null) ?? null
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
  const [expenseActionError, setExpenseActionError] = useState<string | null>(null);

  const [customerCredits, setCustomerCredits] = useState<Array<Partial<CustomerCredit>>>(() => {
    const fromCustomFields = shift.custom_field_values?.customer_credits;
    if (Array.isArray(fromCustomFields) && fromCustomFields.length > 0) return fromCustomFields;
    const fromDraftCustomFields = localDraft?.custom_field_values?.customer_credits;
    if (Array.isArray(fromDraftCustomFields) && fromDraftCustomFields.length > 0) return fromDraftCustomFields;
    return [];
  });

  const [employeeNotes, setEmployeeNotes] = useState<string>(
    shift.employee_notes || localDraft?.employee_notes || ''
  );
  const [handoverMessage, setHandoverMessage] = useState<string>(
    shift.handover_message || localDraft?.handover_message || ''
  );

  // UI state & Print Receipt state
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);

  // Exactly who auth_is_elevated() lets past trg_enforce_scratch_field_locks
  // (0002_rls.sql) - anyone else must echo stored locked values back.
  //
  // AuthContext seeds roles/permissions optimistically with ORG_OWNER + '*'
  // and only replaces them once syncUserProfile resolves, so until isLoading
  // clears, an employee looks elevated here. Treat "not resolved yet" as NOT
  // elevated: for an employee that is the difference between saving and a
  // 42501 that rejects the whole shift, while for a genuine Owner it costs at
  // most one skipped write of a locked field - scratchRows still holds their
  // value and the next autosave sends it.
  const canEditScratchLockedFields =
    !isAuthLoading &&
    (roles.some((r) => ['ORG_OWNER', 'PLATFORM_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER', 'ORG_ADMIN'].includes(r.code)) ||
      permissions.includes('*'));
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [isAutoSaved, setIsAutoSaved] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-sync expenses state
  const [isSyncingExpenses, setIsSyncingExpenses] = useState<boolean>(false);
  const [isAddingExpense, setIsAddingExpense] = useState<boolean>(false);
  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  const syncExpensesFromStore = async (isManual = false) => {
    setIsSyncingExpenses(true);
    try {
      const orgId = shift.organization_id || organization!.id;
      // Via the RPC, not a plain table read: 0022 hides an untied expense a
      // manager recorded from the employee closing the till, and this list
      // feeds expected_cash -> discrepancy -> their charge.
      const storeExpenses = await fetchShiftReconciliationExpenses(shift.id);

      // Everything the RPC returns, which since 0042 is this shift's own plus
      // the rest of its business day at this store.
      //
      // There used to be a second gate here - «tied to THIS shift, or untied
      // and created within an hour of it opening» - and widening the server
      // without removing it changed nothing: the morning's expenses arrived
      // and were thrown away again, because they are tied to the morning's
      // shift id. The evening then reconciled without them and its till came
      // out over by exactly their amount.
      //
      // The server already scopes this to the right store and day, and it is
      // the side that can be trusted to; a second opinion here can only
      // disagree with it.
      const relevant = storeExpenses;

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
                // Kept so the screen can tell this shift's own entries from
                // what an earlier shift of the same day already recorded.
                // Without it every pulled expense looked like this
                // operator's, and they could edit a closed shift's figures.
                carried_from_shift_id: isCarriedExpense(item, shift.id, shift.opened_at)
                  ? (item.shift_id || 'earlier')
                  : undefined,
                organization_id: orgId,
                store_id: shift.store_id,
                category: item.category || 'EXPENSES_GP',
                amount: Number(item.amount) || 0,
                payment_method: item.payment_method === 'CARD' ? 'CARD' : 'CASH',
                description: item.recipient
                  ? `${item.recipient}${item.notes ? ` - ${item.notes}` : ''}`
                  : (item.notes || item.category),
                receipt_url: item.receipt_url || '',
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
      setSyncNotification('Αποτυχία συγχρονισμού εξόδων.');
    } finally {
      setIsSyncingExpenses(false);
    }
  };

  // Manual-only (no auto-run on mount, unlike syncExpensesFromStore): this
  // overwrites the two VLT fields outright rather than merging a list, so it
  // must stay an explicit, reviewable action the user chooses to take rather
  // than something that fires silently whenever the wizard opens.
  //
  useEffect(() => {
    syncExpensesFromStore(false);
  }, [shift.id, shift.store_id]);

  // Εθνικό Λαχείο cash collected against THIS shift (via the National
  // Lottery module, a separate flow from the manual Scratch entry table
  // above) - queried fresh on mount rather than trusted from a stale
  // snapshot. This number is added into totalScratchNet below, NOT into
  // scratchSales/autoCalculatedScratchSales - keeping it out of the
  // cashier's manually-editable Scratch field means a manual override
  // there can never accidentally erase real Εθνικό Λαχείο money.
  //
  // Deliberately NOT re-fetched a second time immediately before submit:
  // buildCurrentPayload also derives expected_cash/discrepancy from
  // totalScratchNet, so patching only scratch_lotto_sales post-hoc with a
  // fresher number without recomputing those too would leave the
  // persisted payload internally inconsistent - a worse bug than the
  // narrow staleness window this would close. That window is already
  // small in practice (collecting a draw happens in the separate National
  // Lottery module, so returning to this wizard generally means it
  // remounted and re-ran this fetch) and is fully covered regardless:
  // DailyAggregationView.tsx sources totalNationalLotteryPortion directly
  // from the same ledger table, not from any shift's snapshot, so the day's
  // real total is always correct even if one shift's own snapshot is a few
  // seconds stale.
  const [nationalLotteryShiftContribution, setNationalLotteryShiftContribution] = useState(0);
  useEffect(() => {
    getNationalLotteryShiftContribution(shift.id)
      .then(setNationalLotteryShiftContribution)
      .catch((err) => console.warn('[ShiftClosingWizard] Could not load Εθνικό Λαχείο contribution:', err));
  }, [shift.id]);

  // Computed Section Totals
  //
  // The scratch table counts from the DAY's opening, so `scratchSales` is the
  // day's running figure, not this shift's. The baseline stamped on the shift
  // when it opened is what the earlier shifts of the day already recorded, so
  // subtracting it gives this shift's own - which is the meaning
  // scratch_lotto_sales has to keep, because fn_store_pnl, fn_employee_kpis,
  // fn_shift_type_kpis and v_daily_register_summary all SUM it.
  //
  // The εξαργυρώσεις are typed per shift and are NOT cumulative, which is why
  // the subtraction happens before they are taken off rather than after.
  // Everything on a shift's report is the DAY so far, not that shift alone.
  //
  // The agency's own spreadsheets settled this. Shift B's scratch serials
  // start where the DAY started, its Tora, number games, VLT and cash figures
  // are all larger than shift A's, its opening float is identical to A's, and
  // its «Σύνολο: 83» - the day's scratch net - goes straight into the till
  // total that produces the shift's result. The drawer is not emptied between
  // shifts; the envelope leaves at the end of the day.
  //
  // So the figure on screen IS the figure stored. An earlier version
  // subtracted what previous shifts had recorded, to keep the per-shift sums
  // in 0003 working - but that made shift B store 11 € where its own report
  // says 83 €, and moved its result by 72 €. The aggregation is what had to
  // change instead: a day is its LAST shift, never the sum (0040).
  const totalScratchNet =
    roundCurrency(safeNum(scratchSales) - safeNum(scratchPayouts))
    + nationalLotteryShiftContribution;
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
  // Entries from earlier shifts of the same day collapse into one summary;
  // only what this shift recorded stays editable. Both still count towards
  // the totals, because the day reconciles against all of them.
  // The same supplier for the same amount twice in a day is usually a double
  // entry, and the till then comes up short by exactly one of them. Checked
  // across the whole day's list - this shift's and what it inherited - because
  // the second entry is as likely to come from the other shift as from this
  // one. A question, never a block: a shop really can buy ice twice.
  const duplicateExpenseWarnings = duplicateGroups(expenses as any[]);
  const [acknowledgedDuplicates, setAcknowledgedDuplicates] = useState(false);

  const carriedExpenses = expenses.filter((e: any) => !!e.carried_from_shift_id);
  const ownExpenses = expenses.filter((e: any) => !e.carried_from_shift_id);

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

  const signedVltsOut = safeNum(vltsOut);

  // The same resolution the discrepancy uses, so the «Ταμείο FnB» panel below
  // cannot show a cash figure the calculation disagrees with.
  const fnbCashInDrawer = resolveFnbCash({
    fnb_cash: safeNum(fnbCash),
    fnb_sales: safeNum(fnbSales),
    fnb_card: safeNum(fnbCard),
  });

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
    // Pass all three as typed. The fallback belongs in one place, where it
    // can see the cards, instead of being decided twice.
    fnb_cash: safeNum(fnbCash),
    fnb_sales: safeNum(fnbSales),
    fnb_card: safeNum(fnbCard),
  });

  // The cup is counted apart from the drawer, but the money was still taken
  // in by this till - leaving it out would read as a shortage of exactly its
  // amount. It goes into the counted total and then leaves with the envelope
  // instead of staying behind as float.
  const countedCash = roundCurrency(
    calculateCountedCash(denominations) + Math.max(0, safeNum(coinHandover))
  );

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

  const reconciliationNetTotal = reconciliationBreakdown.netTotal;

  const discResult = calculateDiscrepancy(
    reconciliationNetTotal,
    expectedCash,
    safeNum(discrepancyThreshold)
  );

  // The tolerance used to be decoration: the trigger charged the operator the
  // whole shortage however small it was. 0034 splits it - the tolerance is
  // absorbed by the discrepancy ledger, only the excess reaches the person.
  // The same arithmetic runs in the database, so this is what will happen,
  // not a preview of it.
  const split = splitDiscrepancy(discResult.discrepancy, safeNum(discrepancyThreshold));

  // Owners are never charged for their own till (0018, kept in 0034).
  const operatorIsExempt =
    shift.opened_by_user_id === user?.id &&
    roles.some((r) => ['ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN'].includes(r.code));
  const chargeReachesOperator = split.charged > 0 && !operatorIsExempt;

  // «Φάκελος = ταμείο»: the drawer keeps its fixed float - the 1000 € that
  // runs from day to day - and everything above it is counted into an
  // envelope for the supervisor. It is the figure they check against what is
  // actually inside, so it goes on the review rather than being worked out in
  // somebody's head at the end of a long count.
  //
  // Computed after the split because an immediate settlement travels inside
  // the same envelope and the person receiving it has to see that too.
  const settlementCash =
    chargeReachesOperator && discrepancySettlement === 'PAID_CASH' ? split.charged : 0;
  const envelope = calculateEnvelope({
    countedCash,
    fixedFloat: openingCashTotal,
    safeDrops: totalSafeDrops(safeDrops),
    discrepancySettlement: settlementCash,
    coinHandover: safeNum(coinHandover),
  });

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
    openingTopUp1: topUpsForLegacyFields(topUps).opening_topup_1,
    openingTopUp2: topUpsForLegacyFields(topUps).opening_topup_2,
    openingCashTotal: openingCashTotal,

    arithmoGross: safeNum(arithmoGross),
    arithmoCancels: safeNum(arithmoCancels),
    arithmoPayouts: safeNum(arithmoPayouts),
    arithmoVouchers: safeNum(arithmoVouchers),
    arithmoNet: totalArithmoNet,

    scratchSales: safeNum(scratchSales),
    scratchPayouts: safeNum(scratchPayouts),
    scratchNet: totalScratchNet,
    nationalLotteryPortion: nationalLotteryShiftContribution,

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
      scratch_payouts: safeNum(scratchPayouts),
      scratch_gross_sales: safeNum(scratchSales),
      scratch_lotto_sales: totalScratchNet,

      // POS & TORA fields (tora_total is DB-generated from tora_pos_1 + tora_pos_2, not writable)
      tora_pos_1: safeNum(toraPosItems[0]?.amount),
      tora_pos_2: safeNum(toraPosItems[1]?.amount),
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
      ...safeDropShiftFields(safeDrops),

      counted_denominations: denominations,
      counted_cash: countedCash,
      expected_cash: expectedCash,
      discrepancy: discResult.discrepancy,
      discrepancy_percentage: discResult.discrepancyPercentage,
      discrepancy_threshold: safeNum(discrepancyThreshold),
      is_unbalanced: discResult.isUnbalanced,
      // Only meaningful when something actually reached the operator. Sent as
      // null otherwise so a choice made before a correction cannot linger and
      // mark a balanced shift as "paid in cash".
      discrepancy_settlement: chargeReachesOperator ? discrepancySettlement : null,
      coin_handover: safeNum(coinHandover),

      employee_notes: employeeNotes,
      handover_message: handoverMessage,
      custom_field_values: {
        ...(shift.custom_field_values || {}),
        ...(localDraft?.custom_field_values || {}),
        safe_drops: safeDrops,
        opening_topups: topUps.map((v) => safeNum(v)).filter((n) => n !== 0),
        ...topUpsForLegacyFields(topUps),
        customer_credits: customerCredits,
        // Never send a locked field this user isn't allowed to change - see
        // lockScratchRowsForSave. Otherwise drift introduced by the mount-time
        // merge makes the database refuse the entire update (42501).
        scratch_ticket_items: lockScratchRowsForSave(
          scratchRows,
          shift.custom_field_values?.scratch_ticket_items,
          canEditScratchLockedFields
        ),
        store_pos_items: storePosItems,
        tora_pos_items: toraPosItems,
        reconciliation_net_total: reconciliationNetTotal,
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
        setDraftSaveError(null);
        setTimeout(() => setIsAutoSaved(false), TOAST_AUTO_DISMISS_MS);
      } catch (err: any) {
        // A swallowed autosave failure is worse than the failure itself: the
        // employee keeps working a shift that stopped persisting. Surface it
        // in the same banner the manual save uses.
        console.warn('Autosave error:', err);
        setDraftSaveError(err?.message || 'Αποτυχία αυτόματης αποθήκευσης προχείρου');
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [
    openingNotesAmount,
    openingCoinsAmount,
    topUps,
    scratchRows,
    scratchSales,
    scratchPayouts,
    storePosItems,
    toraPosItems,
    cleverPointTotal,
    ippodromosBalance,
    vltsIn,
    vltsOut,
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
    discrepancySettlement,
    denominations,
    expenses,
    customerCredits,
    employeeNotes,
    handoverMessage,
  ]);

  // Manual Autosave Draft function
  const saveDraft = async () => {
    setIsSavingDraft(true);
    setDraftSaveError(null);
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

      const timeStr = new Date().toLocaleTimeString('el-GR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setDraftSavedAt(timeStr);
      setIsAutoSaved(true);
      setTimeout(() => setIsAutoSaved(false), TOAST_AUTO_DISMISS_MS);
    } catch (e: any) {
      console.warn('Draft autosave warning:', e);
      setDraftSaveError(e.message || 'Αποτυχία αποθήκευσης προχείρου');
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
  // Creates a real shift_expenses row immediately (durable from the
  // moment it's added, not just in local/draft state - see
  // createAndSyncShiftExpense), then adds it to the local list the same
  // way it always rendered. On failure, nothing is added locally either -
  // every row in `expenses` is guaranteed to have a real id, which is
  // what lets handleRemoveExpense below skip the old temp_-id check.
  const handleAddExpense = async () => {
    setIsAddingExpense(true);
    try {
      const orgId = shift.organization_id || organization!.id;
      const created = await createAndSyncShiftExpense(
        {
          organization_id: orgId,
          store_id: shift.store_id,
          category: 'SUPPLIES',
          amount: 0,
          payment_method: 'CASH',
          recipient: '',
          created_by_user_id: user?.id,
          created_by_user_name: user ? `${user.first_name} ${user.last_name}` : 'Υπάλληλος',
        },
        shift
      );
      setExpenses([
        ...expenses,
        {
          id: created.id,
          category: created.category,
          amount: created.amount,
          payment_method: created.payment_method === 'CARD' ? 'CARD' : 'CASH',
          description: created.recipient,
          receipt_url: '',
        },
      ]);
    } catch (err) {
      console.warn('Could not create expense row:', err);
      setSyncNotification('Αποτυχία προσθήκης εξόδου. Δοκιμάστε ξανά.');
    } finally {
      setIsAddingExpense(false);
    }
  };

  // Pushes an inline field edit (category/amount/description) to the real
  // row on blur, not on every keystroke - setExpenses above already keeps
  // typing responsive; this just keeps the persisted row from drifting
  // out of sync with what's shown once the user moves on from the field.
  const handleExpenseFieldBlur = (index: number) => {
    const exp = expenses[index];
    if (!exp?.id) return;
    updateExpenseInFirestore(exp.id, {
      category: exp.category,
      amount: Number(exp.amount) || 0,
      recipient: exp.description || '',
    })
      .then(() => setExpenseActionError(null))
      .catch((err) => {
        // Said out loud, not written to a console nobody has open.
        //
        // A failed edit here leaves the figure on screen and the old one in
        // the database - usually the 0 the row was created with. The
        // operator's own till still reconciles, because the total comes from
        // what they can see, but the next shift inherits nothing and the P&L
        // reads the stored rows. The books and the screen disagree, and the
        // only clue was a console warning.
        console.warn('Could not sync expense edit:', err);
        setExpenseActionError(
          `Το έξοδο ΔΕΝ αποθηκεύτηκε στη βάση (${
            err?.message || 'άγνωστο σφάλμα'
          }). Δοκιμάστε ξανά — αλλιώς δεν θα περάσει στην επόμενη βάρδια ούτε στα κέρδη.`
        );
      });
  };

  const handleRemoveExpense = async (index: number) => {
    const exp = expenses[index];
    setExpenseActionError(null);
    if (exp?.id) {
      try {
        await deleteAndSyncShiftExpense({
          id: exp.id,
          organization_id: shift.organization_id || organization!.id,
          store_id: shift.store_id,
          shift_id: shift.id,
        });
      } catch (err: any) {
        console.warn('Could not delete expense from Firestore:', err);
        setExpenseActionError(err.message || 'Αποτυχία διαγραφής εξόδου - η γραμμή δεν αφαιρέθηκε.');
        return;
      }
    }
    setExpenses(expenses.filter((_, i) => i !== index));
  };

  // File receipt uploader to base64, synced to the real row (shift_expenses.receipt_url)
  const handleFileUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const receiptUrl = reader.result as string;
        const updated = [...expenses];
        updated[index].receipt_url = receiptUrl;
        setExpenses(updated);

        const expId = updated[index].id;
        if (expId) {
          updateExpenseInFirestore(expId, { receipt_url: receiptUrl }).catch((err) =>
            console.warn('Could not sync receipt photo:', err)
          );
        }
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
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitSucceeded, setSubmitSucceeded] = useState(false);

  const handleSubmitShift = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const submitPayload = buildCurrentPayload('SUBMITTED');

      await updateShiftInFirestore(shift.id, submitPayload);

      // Apply customer credit debt balances to store directory
      try {
        const creditOrgId = shift.organization_id || organization!.id;
        await applyShiftCustomerCredits(customerCredits, creditOrgId, shift.store_id, shift.id, user?.id || '');
      } catch (custErr) {
        console.warn('Customer credit sync warning:', custErr);
      }

      // Trigger automated shift closing summary email to owners/managers
      try {
        await fetch('/api/notify-shift-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            store_id: shift.store_id,
            store_name: shift.store_name,
            shift_type: shift.shift_type === 'MORNING' ? 'Πρωινή Βάρδια' : 'Απογευματινή / Βραδινή',
            closed_by_user_name: shift.closed_by_user_name || 'Υπάλληλος Βάρδιας',
            counted_cash: submitPayload.counted_cash,
            expected_cash: submitPayload.expected_cash,
            discrepancy: submitPayload.discrepancy,
          }),
        });
      } catch (emailErr) {
        console.warn('Shift closing summary email notification warning:', emailErr);
      }

      setShowSubmitConfirm(false);
      setSubmitSucceeded(true);
      requestNotificationsRefresh();
      setTimeout(() => onSubmitted(), SUBMIT_SUCCESS_REDIRECT_MS);
    } catch (err: any) {
      setError(err.message || 'Σφάλμα κατά την υποβολή βάρδιας');
      setShowSubmitConfirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const [showDeleteDraftConfirm, setShowDeleteDraftConfirm] = useState(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [deleteDraftError, setDeleteDraftError] = useState<string | null>(null);

  const handleDeleteDraft = async () => {
    setIsDeletingDraft(true);
    setDeleteDraftError(null);
    try {
      try {
        localStorage.removeItem(`shift_draft_${shift.id}`);
      } catch (e) {}

      await deleteShiftFromFirestore(shift.id);
      onBack();
    } catch (err: any) {
      setDeleteDraftError(err.message || 'Σφάλμα κατά τη διαγραφή του προχείρου');
    } finally {
      setIsDeletingDraft(false);
    }
  };

  const steps = [
    { num: 1, name: 'Έναρξη', icon: Building2 },
    { num: 2, name: 'ΟΠΑΠ & VLTs', icon: Ticket },
    // A store without a café has no FnB step to speak of - the step is still
    // where expenses are entered, so it stays, under a name that is true.
    { num: 3, name: modules.fnb ? 'FnB & Έξοδα' : 'Έξοδα', icon: modules.fnb ? Coffee : Receipt },
    { num: 4, name: 'Καταμέτρηση', icon: Coins },
    { num: 5, name: 'Επιβεβαίωση', icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
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
              className={`text-xs px-2.5 py-1 rounded-xl border font-medium flex items-center space-x-1.5 transition-colors duration-300 ${
                isAutoSaved
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${isAutoSaved ? 'text-emerald-600' : 'text-slate-500'}`}
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

      {draftSaveError && (
        <div className="flex items-center justify-between gap-3 bg-rose-100 border border-rose-300 rounded-xl p-3">
          <div className="flex items-center space-x-2 text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold">{draftSaveError}</span>
          </div>
          <button
            type="button"
            onClick={() => setDraftSaveError(null)}
            aria-label="Κλείσιμο"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteDraftConfirm}
        layer="stacked"
        closeOnBackdropClick={false}
        title="Διαγραφή Προχείρου Βάρδιας"
        message={
          <div className="space-y-3">
            <p className="text-micro font-bold text-rose-600 tracking-wider">ΕΝΕΡΓΕΙΑ ΙΔΙΟΚΤΗΤΗ / ΔΙΑΧΕΙΡΙΣΤΗ</p>
            <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-3.5 space-y-2 text-xs text-rose-950">
              <p className="font-bold">
                Είστε βέβαιοι ότι θέλετε να διαγράψετε οριστικά αυτό το πρόχειρο βάρδιας ({shift.store_name} - {shift.register_id});
              </p>
              <p className="text-micro text-rose-700">
                ⚠️ Όλα τα πρόχειρα καταγεγραμμένα στοιχεία της βάρδιας θα διαγραφούν οριστικά.
              </p>
            </div>
            {deleteDraftError && (
              <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 text-xs font-semibold text-rose-800">
                {deleteDraftError}
              </div>
            )}
          </div>
        }
        confirmLabel="Οριστική Διαγραφή"
        isLoading={isDeletingDraft}
        loadingLabel="Διαγραφή..."
        onConfirm={handleDeleteDraft}
        onCancel={() => {
          setShowDeleteDraftConfirm(false);
          setDeleteDraftError(null);
        }}
      />

      {/* Submit Confirmation */}
      <ConfirmDialog
        isOpen={showSubmitConfirm}
        tone="positive"
        layer="stacked"
        closeOnBackdropClick={false}
        title="Οριστική Υποβολή Βάρδιας"
        message={
          <div className="space-y-3">
            <p className="text-micro font-bold text-slate-500 tracking-wider">
              {shift.store_name} • {shift.register_id}
            </p>
            {chargeReachesOperator ? (
              /* The shortage got past the accepted tolerance, so part of it
                 reaches the operator and they choose how to deal with it
                 here, before the shift is submitted. The split itself is
                 shown line by line - being told "you owe 3 €" without seeing
                 where the 3 came from is how a figure gets argued about
                 instead of paid. */
              <div className="space-y-3">
                <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 space-y-2 text-xs text-rose-950">
                  <p className="font-bold flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Έλλειμμα πάνω από την αποδεκτή απόκλιση</span>
                  </p>
                  <dl className="space-y-1 font-mono tabular-nums">
                    <div className="flex justify-between">
                      <dt className="font-sans">Διαφορά ταμείου</dt>
                      <dd className="font-bold">
                        {formatCurrency(discResult.discrepancy, { showSign: true })}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-sans">
                        Αποδεκτή απόκλιση ({formatCurrency(safeNum(discrepancyThreshold))})
                      </dt>
                      <dd>{formatCurrency(split.absorbed, { showSign: true })}</dd>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-rose-300/70">
                      <dt className="font-sans font-bold">Σε βάρος σας</dt>
                      <dd className="font-black">{formatCurrency(split.charged)}</dd>
                    </div>
                  </dl>
                </div>

                <p className="text-xs font-bold text-slate-700">Πώς θα τακτοποιηθεί;</p>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setDiscrepancySettlement('PAID_CASH')}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-colors cursor-pointer ${
                      discrepancySettlement === 'PAID_CASH'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-sm font-bold text-slate-900">
                      Άμεση εξόφληση ({formatCurrency(split.charged)})
                    </span>
                    <span className="block text-xs text-slate-600 mt-0.5">
                      Βάζετε τα χρήματα στο ταμείο τώρα. Παραδίδονται μαζί με τον φάκελο
                      ως εξόφληση απόκλισης — δεν προσμετρώνται στις εισπράξεις.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscrepancySettlement('CHARGE')}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-colors cursor-pointer ${
                      discrepancySettlement === 'CHARGE'
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-sm font-bold text-slate-900">
                      Αποθήκευση ελλείμματος
                    </span>
                    <span className="block text-xs text-slate-600 mt-0.5">
                      Καταγράφεται ως χρέωση στο όνομά σας και παραμένει ενεργή στο
                      ιστορικό σας μέχρι να εξοφληθεί.
                    </span>
                  </button>
                </div>
                {!discrepancySettlement && (
                  <p className="text-xs text-slate-500">
                    Επιλέξτε έναν από τους δύο τρόπους για να συνεχίσετε.
                  </p>
                )}
              </div>
            ) : discResult.isExceedingThreshold ? (
              <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 space-y-1.5 text-xs text-rose-950">
                <p className="font-bold flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Η διαφορά ταμείου ξεπερνά το όριο ({formatCurrency(discrepancyThreshold)})</span>
                </p>
                <p>
                  Τρέχουσα διαφορά: <strong>{formatCurrency(discResult.discrepancy, { showSign: true })}</strong>.
                  Επιβεβαιώστε ότι θέλετε να υποβάλετε τη βάρδια παρά την απόκλιση.
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700">
                Η βάρδια θα υποβληθεί προς έγκριση. Μετά την υποβολή, δεν μπορείτε να την επεξεργαστείτε χωρίς αίτημα διόρθωσης από τον υπεύθυνο.
              </div>
            )}
            {duplicateExpenseWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950">
                <span className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Διπλοκαταχωρημένα έξοδα
                </span>
                <ul className="mt-1 space-y-0.5">
                  {duplicateExpenseWarnings.map((d) => (
                    <li key={d.id}>
                      {d.recipient} — {formatCurrency(d.amount)} × {d.matches}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <div className="bg-rose-100 border border-rose-300 rounded-xl p-3 text-xs font-semibold text-rose-800">
                {error}
              </div>
            )}
          </div>
        }
        confirmLabel="Ναι, Υποβολή"
        isLoading={isSubmitting}
        loadingLabel="Υποβολή..."
        confirmDisabled={chargeReachesOperator && !discrepancySettlement}
        onConfirm={handleSubmitShift}
        onCancel={() => setShowSubmitConfirm(false)}
      />

      {/* Brief success confirmation before returning to the shift list */}
      {submitSucceeded && (
        <div className="fixed inset-0 z-80 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs transition-opacity duration-150 starting:opacity-0">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center space-y-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="font-extrabold text-slate-900">Η βάρδια υποβλήθηκε επιτυχώς</p>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {shift.store_name} • {shift.register_id}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {shift.shift_type === 'MORNING'
                  ? '☀️ Πρωινή'
                  : shift.shift_type === 'AFTERNOON'
                  ? '🌤️ Απογευματινή'
                  : '🌙 Βραδινή / Ειδική'}
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
              <p className="text-micro font-extrabold text-slate-500 uppercase tracking-wider">Αναμενόμενο Ταμείο</p>
              <p className="text-xl font-black text-emerald-400">{formatCurrency(expectedCash)}</p>
            </div>
            <div className="h-10 w-px bg-slate-700"></div>
            <div>
              <p className="text-micro font-extrabold text-slate-500 uppercase tracking-wider">Μετρημένα</p>
              <p className="text-xl font-black text-indigo-300">{formatCurrency(countedCash)}</p>
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
                className={`flex flex-col items-center py-2.5 px-2 rounded-2xl text-center transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white font-extrabold shadow-md scale-102 ring-2 ring-indigo-400'
                    : isDone
                    ? 'bg-slate-800/80 text-emerald-400 font-bold hover:bg-slate-800'
                    : 'bg-slate-800/30 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 mb-1" />
                <span className="text-xs truncate w-full hidden sm:inline">{step.name}</span>
                <span className="text-micro font-bold sm:hidden">{step.num}</span>
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
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6 transition-opacity duration-150 starting:opacity-0">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">1</span>
                <span>Έναρξη Βάρδιας & Αρχικό Ταμείο</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Ελέγξτε & επιβεβαιώστε την κατανομή μετρητών + κερμάτων στο αρχικό ταμείο.
              </p>
            </div>
            <span className="text-sm font-black text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
              Αρχικό Σύνολο: {formatCurrency(openingCashTotal)}
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
                    min="0"
                    max={MAX_CURRENCY_AMOUNT}
                    value={openingNotesAmount}
                    disabled={!floatEditableByEmployee}
                    onChange={(e) => setOpeningNotesAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Κέρματα / Ψιλά (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={MAX_CURRENCY_AMOUNT}
                    value={openingCoinsAmount}
                    disabled={!floatEditableByEmployee}
                    onChange={(e) => setOpeningCoinsAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                  />
                </div>

                {topUps.map((value, idx) => (
                  <div key={idx}>
                    <label htmlFor={`topup-${idx}`} className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>Προσαύξηση #{idx + 1} (€)</span>
                      {topUps.length > 1 && (canManage || topUpAllowedForEmployee) && (
                        <button
                          type="button"
                          onClick={() => setTopUps((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          aria-label={`Αφαίρεση προσαύξησης ${idx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </label>
                    <input
                      id={`topup-${idx}`}
                      type="number"
                      step="0.01"
                      min="0"
                      max={MAX_CURRENCY_AMOUNT}
                      placeholder="0.00"
                      value={value}
                      disabled={!canManage && !topUpAllowedForEmployee}
                      onChange={(e) =>
                        setTopUps((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                    />
                  </div>
                ))}

                {(canManage || topUpAllowedForEmployee) && (
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setTopUps((prev) => [...prev, ''])}
                      className="w-full px-3 py-2.5 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 text-indigo-700 text-xs font-extrabold hover:bg-indigo-50 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Προσαύξηση
                    </button>
                  </div>
                )}
              </div>

              <div className="p-2.5 bg-white rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Σύνολο Αρχικού Κεφαλαίου:</span>
                <span className="font-black text-indigo-900 text-sm">{formatCurrency(openingCashTotal)}</span>
              </div>

              {(!floatEditableByEmployee || (!canManage && !topUpAllowedForEmployee)) && (
                <p className="text-micro text-slate-500 mt-2 leading-relaxed">
                  {!floatEditableByEmployee && !canManage && !topUpAllowedForEmployee
                    ? 'Το αρχικό ταμείο ορίζεται στη Διαμόρφωση· οι προσαυξήσεις καταχωρούνται από τον υπεύθυνο.'
                    : !floatEditableByEmployee
                    ? 'Το αρχικό ταμείο ορίζεται στη Διαμόρφωση του καταστήματος.'
                    : 'Οι προσαυξήσεις καταχωρούνται από τον υπεύθυνο.'}
                </p>
              )}
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

          {/* Shown, not asked. This was an input: the employee whose till is
              being measured set the figure that decides whether it is short.
              It is the Owner's, in «Διαμόρφωση». */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Όριο Αποδεκτής Απόκλισης
              </span>
              <span className="block text-micro text-slate-500 mt-0.5">
                Ορίζεται από τον ιδιοκτήτη στη Διαμόρφωση.
              </span>
            </div>
            <span className="text-base font-black font-mono text-slate-900 bg-white px-4 py-2 rounded-xl border border-slate-300">
              {formatCurrency(safeNum(discrepancyThreshold))}
            </span>
          </div>
        </div>
      )}

      {/* STEP 2: OPAP TRANSACTION CATEGORIES & GRANULAR REPORTS */}
      {currentStep === 2 && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6 transition-opacity duration-150 starting:opacity-0">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">2</span>
                <span>Αναφορές ΟΠΑΠ, VLTs & Υπηρεσιών</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Εισάγετε τα ποσά ανά κατηγορία από την ημερήσια αναφορά του τερματικού ΟΠΑΠ & POS.
              </p>
            </div>
            <div className="bg-slate-900 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold">
              Καθαρό Σύνολο ΟΠΑΠ: {formatCurrency(opapGrossTotal - opapPayoutsTotal)}
            </div>
          </div>

          <div className="space-y-6">
            {/* 1. Ελληνικά Λαχεία | Σκρατς */}
            {modules.scratch && (
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 flex-wrap gap-2">
                <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                  <span>🎫 Ελληνικά Λαχεία | Σκρατς</span>
                </h4>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="text-xs font-bold text-slate-500">
                    Πωλήσεις ημέρας:{' '}
                    <span className="font-mono text-slate-900">{formatCurrency(scratchSales)}</span>
                  </span>
                  {/* Without this line the panel reads «Πωλήσεις 140, Καθαρό
                      70» and looks broken. The table counts from the day's
                      opening, so the figure above covers the earlier shifts
                      too; only the difference belongs to this one. */}
                  <span className="text-xs font-bold text-rose-600">
                    - Εξαργ.: <span className="font-mono">{formatCurrency(scratchPayouts)}</span>
                  </span>
                  {nationalLotteryShiftContribution > 0 && (
                    <span className="text-xs font-bold text-indigo-600" title="Παραλαβές Εθνικού Λαχείου σε αυτή τη βάρδια">
                      + Εθν. Λαχείο: <span className="font-mono">{formatCurrency(nationalLotteryShiftContribution)}</span>
                    </span>
                  )}
                  {/* The day's net, because both figures beside it are the
                      day's. What this shift alone contributed sits under it -
                      that is what gets stored and what the reports sum. */}
                  <span
                    className={`text-xs font-black px-2.5 py-1 rounded-lg border font-mono ${
                      totalScratchNet < 0
                        ? 'text-rose-700 bg-rose-50 border-rose-200'
                        : 'text-emerald-700 bg-emerald-50 border-emerald-100'
                    }`}
                  >
                    Καθαρό: {formatCurrency(totalScratchNet)}
                  </span>
                </div>
              </div>

              {/* Detailed Scratch Ticket Counter Table (Initial & Final Ticket Serial Numbers) */}
              <ScratchCalculatorTable
                rows={scratchRows}
                onChangeRows={handleScratchRowsChange}
                sellingMode={scratchSellingMode}
                specialEditionEnabled={specialEditionEnabled}
                laikoSellingMode={laikoSellingMode}
              />

              {/* Direct inputs summary & payouts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/80">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center space-x-1.5">
                      <span>
                        Πωλήσεις Σκρατς & Λαχείων — ΑΠΟ ΤΗΝ ΑΡΧΗ ΤΗΣ ΗΜΕΡΑΣ (€)
                      </span>
                    </span>
                    <span className="text-micro text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 inline" />
                      <span>{scratchSalesManualOverride ? 'Χειροκίνητη Τιμή' : 'Αυτόματος Υπολογισμός'}</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={MAX_CURRENCY_AMOUNT}
                      readOnly={!scratchSalesManualOverride}
                      value={scratchSales}
                      onChange={(e) => setScratchSales(e.target.value)}
                      placeholder="0.00"
                      className={`w-full pl-3.5 pr-8 py-2.5 rounded-xl border text-base font-black font-mono shadow-2xs transition-colors ${
                        scratchSalesManualOverride
                          ? 'border-indigo-400 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500'
                          : 'border-emerald-300 bg-emerald-50/50 text-emerald-950 cursor-default'
                      }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-xs font-black text-slate-500 font-mono">
                      €
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-micro">
                    <p className="text-slate-500">
                      {scratchSalesManualOverride
                        ? 'Χειροκίνητη καταχώρηση ποσού.'
                        : 'Εμφανίζεται αυτόματα από το σύνολο του παραπάνω πίνακα καταμέτρησης.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (scratchSalesManualOverride) {
                          setScratchSalesManualOverride(false);
                          setScratchSales(autoCalculatedScratchSales.toFixed(2));
                        } else {
                          setScratchSalesManualOverride(true);
                        }
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-bold text-micro underline ml-2 shrink-0 cursor-pointer"
                    >
                      {scratchSalesManualOverride ? 'Επαναφορά σε αυτόματο' : 'Χειροκίνητη αλλαγή'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-rose-800 mb-1 flex items-center justify-between">
                    <span>
                      Εξαργυρώσεις Σκρατς — ΑΠΟ ΤΗΝ ΑΡΧΗ ΤΗΣ ΗΜΕΡΑΣ (€)
                    </span>
                    <span className="text-micro text-rose-600 font-normal">Πληρωμές κερδών</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={MAX_CURRENCY_AMOUNT}
                      value={scratchPayouts}
                      onChange={(e) => setScratchPayouts(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-3.5 pr-8 py-2.5 rounded-xl border border-rose-200 text-base font-bold text-rose-700 bg-white focus:ring-2 focus:ring-rose-500 font-mono shadow-2xs transition-colors"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-xs font-black text-rose-400 font-mono">
                      €
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Tora Direct και Clever Point στην ίδια σειρά. Tora is the wider
                of the two - several terminals, each with its own figure - so it
                takes two thirds and Clever Point, a single number, takes one. */}
            {(modules.tora || modules.cleverPoint) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              {modules.tora && (
              <div className="lg:col-span-2">
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 flex-wrap gap-2">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                        <span>📱 Tora Direct (Υπηρεσίες Tora)</span>
                      </h4>
                      <p className="text-micro font-medium text-slate-500 mt-0.5">
                        Εισάγετε τα ποσά από τα τερματικά Tora Direct — Κοινά φυσικά μηχανήματα POS με τις πληρωμές καρτών
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 flex-wrap gap-1.5">
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-200" title="Κοινά φυσικά μηχανήματα καταστήματος">
                        {toraPosItems.length} Τερματικά POS
                      </span>
                      {/* «Προσθήκη POS» used to live here, so the number of
                          terminals a shop owns was decided mid-count, by whoever
                          was counting, and stored in their own browser. It is a
                          property of the shop, set once in «Διαμόρφωση». */}
                      <span className="text-xs font-black text-slate-800 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs font-mono">
                        Σύνολο TORA DIRECT: {formatCurrency(totalToraPos)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {toraPosItems.map((item, idx) => (
                      <div key={item.id} className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2 relative group shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5 min-w-0">
                            <span className="text-micro font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0">
                              Μηχάνημα #{idx + 1}
                            </span>
                            {canManage ? (
                              <input
                                type="text"
                                maxLength={MAX_LABEL_LENGTH}
                                value={item.name}
                                onChange={(e) => handleUpdatePosItem(item.id, 'name', e.target.value)}
                                className="text-xs font-bold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-hidden px-1 py-0.5 min-w-0"
                                placeholder={`TORA DIRECT #${idx + 1}`}
                              />
                            ) : (
                              <span className="text-xs font-bold text-slate-800 truncate">{item.name}</span>
                            )}
                          </div>

                          {/* No per-terminal delete either: removing a machine here
                              changed how many the shop had, from inside a count. */}
                        </div>

                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={MAX_CURRENCY_AMOUNT}
                            value={item.amount}
                            onChange={(e) => handleUpdatePosItem(item.id, 'amount', e.target.value)}
                            placeholder="0.00"
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-slate-950 bg-white focus:ring-2 focus:ring-indigo-500 font-black font-mono text-base shadow-2xs"
                          />
                          <span className="absolute right-3 top-3 text-xs font-bold text-slate-500">€</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              )}
              {modules.cleverPoint && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    📍 Clever Point
                  </label>
                  <div className="space-y-1">
                    <span className="text-micro font-semibold text-slate-500">Σύνολο (€)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={MAX_CURRENCY_AMOUNT}
                      value={cleverPointTotal}
                      onChange={(e) => setCleverPointTotal(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Ιππόδρομος, VLTs και Pame Stoixima από κάτω. */}
            {(modules.ippodromos || modules.vlts || modules.pameStoixima) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              {modules.ippodromos && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    🏇 Ιππόδρομος
                  </label>
                  <div className="space-y-1">
                    <span className="text-micro font-semibold text-slate-500">Υπόλοιπο Ταμείου (€)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={MAX_CURRENCY_AMOUNT}
                      value={ippodromosBalance}
                      onChange={(e) => setIppodromosBalance(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
              {modules.vlts && (
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 flex-wrap gap-2">
                    <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                      <span>🎰 PLAY VLTs</span>
                    </h4>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                        Καθαρό: {formatCurrency(safeNum(vltsIn) + signedVltsOut)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Μετρητά στα VLTs (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={MAX_CURRENCY_AMOUNT}
                        value={vltsIn}
                        onChange={(e) => setVltsIn(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="vlts-out" className={`block text-xs font-bold mb-1 ${
                        signedVltsOut < 0 ? 'text-rose-800' : 'text-slate-700'
                      }`}>
                        Ροή Μετρητών VLTs (€)
                      </label>
                      <input
                        id="vlts-out"
                        type="number"
                        step="0.01"
                        min={-MAX_CURRENCY_AMOUNT}
                        max={MAX_CURRENCY_AMOUNT}
                        value={vltsOut}
                        onChange={(e) => setVltsOut(e.target.value)}
                        placeholder="0.00"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-base font-bold font-mono ${
                          signedVltsOut < 0
                            ? 'border-rose-300 text-rose-700 bg-white focus:ring-2 focus:ring-rose-500'
                            : 'border-slate-300 text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500'
                        }`}
                      />
                      <p className="text-micro text-slate-500 mt-1">
                        Με πρόσημο: <span className="font-mono font-bold">-</span> για εκροή/πληρωμή,
                        χωρίς πρόσημο για είσπραξη.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {modules.pameStoixima && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    ⚽ Pame Stoixima | Virtuals
                  </label>
                  <div className="space-y-1">
                    <label htmlFor="pame-stoixima" className="text-micro font-semibold text-slate-500">
                      Υπόλοιπο Ταμείου (€)
                    </label>
                    {/* Signed, like the VLT flow beside it: a negative balance is
                        typed with its own minus and simply shows red. */}
                    <input
                      id="pame-stoixima"
                      type="number"
                      step="0.01"
                      min={-MAX_CURRENCY_AMOUNT}
                      max={MAX_CURRENCY_AMOUNT}
                      value={pameStoiximaBalance}
                      onChange={(e) => setPameStoiximaBalance(e.target.value)}
                      placeholder="0.00"
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-base font-bold font-mono bg-white ${
                        safeNum(pameStoiximaBalance) < 0
                          ? 'border-rose-300 text-rose-700 focus:ring-2 focus:ring-rose-500'
                          : 'border-slate-300 text-slate-900 focus:ring-2 focus:ring-indigo-500'
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>
            )}

            {/* 7. Αριθμοπαιχνίδια (KINO, Τζόκερ, Λόττο κλπ.) */}
            {modules.numberGames && (
            <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/40 border border-indigo-100 space-y-3">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                <h4 className="font-extrabold text-sm text-indigo-950 uppercase tracking-wider flex items-center space-x-2">
                  <span>🎯 Αριθμοπαιχνίδια (KINO, Τζόκερ, Λόττο)</span>
                </h4>
                <span className="text-xs font-black text-indigo-900 bg-indigo-100 px-2.5 py-1 rounded-lg">
                  Σύνολο: {formatCurrency(totalArithmoNet)}
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
                    min="0"
                    max={MAX_CURRENCY_AMOUNT}
                    value={arithmoGross}
                    onChange={(e) => setArithmoGross(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">
                    Ακυρώσεις (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={MAX_CURRENCY_AMOUNT}
                    value={arithmoCancels}
                    onChange={(e) => setArithmoCancels(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-amber-200 text-base font-bold font-mono text-amber-800 bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-rose-800 mb-1">
                    Εξαργυρώσεις (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={MAX_CURRENCY_AMOUNT}
                    value={arithmoPayouts}
                    onChange={(e) => setArithmoPayouts(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-rose-200 text-base font-bold font-mono text-rose-700 bg-white focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vouchers (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={MAX_CURRENCY_AMOUNT}
                    value={arithmoVouchers}
                    onChange={(e) => setArithmoVouchers(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: FnB, EXPENSES & CUSTOMER CREDITS */}
      {currentStep === 3 && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-8 transition-opacity duration-150 starting:opacity-0">
          {/* FnB Sales */}
          {modules.fnb && (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">3</span>
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
                  min="0"
                  max={MAX_CURRENCY_AMOUNT}
                  value={fnbSales}
                  onChange={(e) => setFnbSales(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-lg font-extrabold font-mono text-slate-900 bg-white"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                <label className="block text-xs font-bold text-emerald-900 uppercase tracking-wider mb-1">
                  Μετρητά FnB (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={MAX_CURRENCY_AMOUNT}
                  value={fnbCash}
                  onChange={(e) => setFnbCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-200 text-lg font-extrabold font-mono text-emerald-800 bg-white"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                <label className="block text-xs font-bold text-indigo-900 uppercase tracking-wider mb-1">
                  Κάρτες FnB (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={MAX_CURRENCY_AMOUNT}
                  value={fnbCard}
                  onChange={(e) => setFnbCard(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-200 text-lg font-extrabold font-mono text-indigo-800 bg-white"
                />
              </div>
            </div>
          </div>
          )}

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
                  <span className="text-slate-600">ΓΠ: <span className="text-slate-900 font-mono">{formatCurrency(expensesGpCashTotal)}</span></span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-600">FnB: <span className="text-slate-900 font-mono">{formatCurrency(expensesFnbCashTotal)}</span></span>
                  <span className="text-slate-300">|</span>
                  <span className="text-indigo-700">Σύνολο: <span className="font-mono">{formatCurrency(expensesCashTotal)}</span></span>
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
                  disabled={isAddingExpense}
                  className="px-4 py-2 active:scale-[0.97] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAddingExpense ? 'Προσθήκη...' : '+ Προσθήκη Εξόδου'}</span>
                </button>
              </div>
            </div>

            {syncNotification && (
              <div className="p-3 rounded-xl bg-indigo-50/80 border border-indigo-100 flex items-center justify-between text-xs text-indigo-900 font-semibold transition-opacity duration-150 starting:opacity-0">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{syncNotification}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSyncNotification(null)}
                  aria-label="Κλείσιμο ειδοποίησης"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 ml-2 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {expenseActionError && (
              <div className="p-3 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-between text-xs text-rose-800 font-semibold">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{expenseActionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExpenseActionError(null)}
                  aria-label="Κλείσιμο ειδοποίησης"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-50 ml-2 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {duplicateExpenseWarnings.length > 0 && !acknowledgedDuplicates && (
              <div className="mb-3 p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2">
                <span className="text-xs font-black flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {toGreekUpper('Πιθανη Διπλοκαταχωρηση')}
                </span>
                <ul className="space-y-1">
                  {duplicateExpenseWarnings.map((d) => (
                    <li key={d.id} className="text-xs">
                      <strong>{d.recipient}</strong> για{' '}
                      <strong className="font-mono">{formatCurrency(d.amount)}</strong>{' '}
                      καταχωρήθηκε <strong>{d.matches} φορές</strong> σήμερα
                      {d.acrossShifts ? ' — και σε προηγούμενη βάρδια' : ' σε αυτή τη βάρδια'}.
                    </li>
                  ))}
                </ul>
                <p className="text-micro">
                  Αν είναι σωστό, συνεχίστε. Αν όχι, διαγράψτε το διπλό — αλλιώς το ταμείο θα
                  βγει λιγότερο κατά το ποσό του.
                </p>
                <button
                  type="button"
                  onClick={() => setAcknowledgedDuplicates(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-micro font-black cursor-pointer"
                >
                  Ναι, είναι σωστό
                </button>
              </div>
            )}

            {carriedExpenses.length > 0 && (
              <div className="mb-3">
                <CarriedOverSummary
                  title="Έξοδα από προηγούμενες βάρδιες της ημέρας"
                  rows={carriedExpenses.map((e: any) => ({
                    id: String(e.id),
                    label: e.description || e.category || 'Έξοδο',
                    amount: Number(e.amount) || 0,
                    detail: e.category === 'EXPENSES_FNB' ? 'Έξοδα FnB' : 'Έξοδα ΓΠ',
                  }))}
                />
              </div>
            )}

            {ownExpenses.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500 font-medium space-y-1.5">
                <Receipt className="w-6 h-6 mx-auto text-slate-300" />
                <p>Δεν έχουν καταχωρηθεί έξοδα σε αυτή τη βάρδια.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ownExpenses.map((exp) => {
                  const idx = expenses.indexOf(exp);
                  return (
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
                        onBlur={() => handleExpenseFieldBlur(idx)}
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
                        maxLength={MAX_NOTES_LENGTH}
                        placeholder="Προμηθευτής / Περιγραφή εξόδου..."
                        value={exp.description || ''}
                        onChange={(e) => {
                          const updated = [...expenses];
                          updated[idx].description = e.target.value;
                          setExpenses(updated);
                        }}
                        onBlur={() => handleExpenseFieldBlur(idx)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={MAX_CURRENCY_AMOUNT}
                        placeholder="Ποσό €"
                        value={exp.amount || ''}
                        onChange={(e) => {
                          const updated = [...expenses];
                          updated[idx].amount = parseNonNegativeAmount(e.target.value, MAX_CURRENCY_AMOUNT).value;
                          setExpenses(updated);
                        }}
                        onBlur={() => handleExpenseFieldBlur(idx)}
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
                        aria-label="Διαγραφή Εξόδου"
                        className="p-2.5 text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* Datalist for fast supplier selection */}
            {/* The agency's own suppliers, from «Προμηθευτές».
                This was twelve invented names - «Coca-Cola 3Ε Ελλάδος
                Α.Β.Ε.Ε.», «Nova / Wind», «Προμηθευτής Καφέ & Ροφημάτων» -
                none of which was anybody's actual supplier, while the
                Έξοδα screen next door already offered the real ones. An
                expense typed against a suggested name that is not in the
                registry is a supplier the books will never match up. */}
            <datalist id="shift-suppliers-list">
              {supplierNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          {/* Customer Credit Feature */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            {carriedCredits.length > 0 && (
              <CarriedOverSummary
                title="Χρεώσεις & εισπράξεις από προηγούμενες βάρδιες της ημέρας"
                tone="amber"
                rows={carriedCredits.map((c) => ({
                  id: c.id,
                  label: c.customer_name,
                  amount: Number(c.amount) || 0,
                  detail: c.type === 'COLLECTED' ? 'Είσπραξη' : 'Χορήγηση πίστωσης',
                  negative: c.type === 'COLLECTED',
                }))}
              />
            )}
            <CustomerCreditSection
              customerCredits={customerCredits}
              onChangeCredits={setCustomerCredits}
              orgId={shift.organization_id || organization!.id}
              storeId={shift.store_id}
              isOwnerOrManager={isOwnerOrManager}
            />
          </div>
        </div>
      )}

      {/* STEP 4: EUR DENOMINATION CASH COUNTER */}
      {currentStep === 4 && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6 transition-opacity duration-150 starting:opacity-0">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">4</span>
                <span>Καταμέτρηση Μετρητών Ταμείου</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Μετρήστε τα χαρτονομίσματα και τα κέρματα στο συρτάρι.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <div className="text-right bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200">
                <span className="text-micro font-extrabold text-slate-600 uppercase tracking-wider block">
                  Μετρητά Συρταριού
                </span>
                <span className="text-xl font-black text-slate-900">{formatCurrency(countedCash)}</span>
              </div>
              <div className="text-right bg-indigo-600 text-white px-4 py-2 rounded-2xl border border-indigo-700 shadow-xs">
                <span className="text-micro font-extrabold text-indigo-100 uppercase tracking-wider block">
                  Σύνολο Καταμέτρησης
                </span>
                <span className="text-xl font-black text-white">{formatCurrency(reconciliationNetTotal)}</span>
              </div>
            </div>
          </div>

          {/* Formula summary pill */}
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 text-xs text-indigo-950 flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold flex items-center space-x-1">
              <span>🧮 Τύπος Υπολογισμού:</span>
            </span>
            <span className="font-mono text-micro bg-white px-2.5 py-1 rounded-xl border border-indigo-100 text-indigo-900 font-medium">
              (Μετρημένα + POS + Έξοδα + Πιστώσεις - Επιστροφές) - Αρχικό
            </span>
          </div>

          {/* Cash Denomination Counter Component */}
          <CashDenominationCounter
            denominations={denominations}
            onChange={setDenominations}
            theme="light"
          />

          {/* Παράδοση κερμάτων, straight after the count because that is when
              the cup is in front of the operator. Its own field and not an
              expense: the shop used to book it as one and delete it later,
              which cut the day's profit while it stood and erased the money
              once it was gone. */}
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <span className="text-sm font-black text-amber-950 flex items-center gap-1.5">
                  🪙 {toGreekUpper('Παραδοση Κερματων')}
                </span>
                <p className="text-micro text-amber-900/80 mt-0.5 max-w-xl">
                  Τα κέρματα που δεν χωρούν στην κερματοθήκη και μπαίνουν στο ποτηράκι.
                  Παραδίδονται μαζί με τον φάκελο και <strong>δεν μένουν</strong> για
                  την επόμενη μέρα. Δεν είναι έξοδο — μετρώνται κανονικά στο ταμείο.
                </p>
              </div>
              <div className="w-40 shrink-0">
                <label htmlFor="coin-handover" className="block text-micro font-bold text-amber-900 mb-1">
                  Ποσό (€)
                </label>
                <div className="relative">
                  <input
                    id="coin-handover"
                    type="text"
                    inputMode="decimal"
                    value={coinHandover}
                    onChange={(e) => setCoinHandover(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 pr-7 rounded-xl border border-amber-300 bg-white text-sm font-black text-amber-950 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-700 text-sm font-bold">
                    €
                  </span>
                </div>
              </div>
            </div>
            {safeNum(coinHandover) > 0 && (
              <p className="text-micro font-bold text-amber-900 border-t border-amber-200 pt-2">
                Στο συρτάρι μένουν {formatCurrency(banknotesAndCoins.coins)} κέρματα ·
                παραδίδονται {formatCurrency(safeNum(coinHandover))} επιπλέον με τον φάκελο.
              </p>
            )}
          </div>

          {/* Πωλήσεις POS Καταστήματος (POS Καταμέτρησης) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-150 pb-3 flex-wrap gap-2">
              <div>
                <h4 className="font-extrabold text-sm text-indigo-950 uppercase tracking-wider flex items-center space-x-2">
                  <span>💳 Πωλήσεις POS Καταστήματος (POS Καταμέτρησης)</span>
                </h4>
                <p className="text-micro font-medium text-indigo-700/80 mt-0.5">
                  Τερματικά POS για πωλήσεις κάρτας — Υπολογίζονται απευθείας στο Σύνολο Καταμέτρησης
                </p>
              </div>
              <div className="flex items-center space-x-2 flex-wrap gap-1.5">
                <span className="text-xs font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-xl border border-indigo-200" title="Κοινά φυσικά μηχανήματα καταστήματος">
                  {storePosItems.length} Τερματικά POS
                </span>
                {/* Same again: the shop's terminal count is set in
                    «Διαμόρφωση», not partway through a count. */}
                <span className="text-xs font-black text-indigo-800 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-2xs font-mono">
                  Σύνολο POS: {formatCurrency(totalStorePos)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {storePosItems.map((item, idx) => (
                <div key={item.id} className="bg-white p-3.5 rounded-xl border border-indigo-150 space-y-2 relative group shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span className="text-micro font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0">
                        Μηχάνημα #{idx + 1}
                      </span>
                      {canManage ? (
                        <input
                          type="text"
                          maxLength={MAX_LABEL_LENGTH}
                          value={item.name}
                          onChange={(e) => handleUpdateStorePosItem(item.id, 'name', e.target.value)}
                          className="text-xs font-bold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-hidden px-1 py-0.5 min-w-0"
                          placeholder={`Pos #${idx + 1}`}
                        />
                      ) : (
                        <span className="text-xs font-bold text-slate-800 truncate">{item.name}</span>
                      )}
                    </div>

                    {/* and no delete here, for the same reason. */}
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={MAX_CURRENCY_AMOUNT}
                      value={item.amount}
                      onChange={(e) => handleUpdateStorePosItem(item.id, 'amount', e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2.5 rounded-xl border border-indigo-200 text-slate-950 bg-white focus:ring-2 focus:ring-indigo-500 font-black font-mono text-base shadow-2xs"
                    />
                    <span className="absolute right-3 top-3 text-xs font-bold text-slate-500">€</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Καταθέσεις χρηματοκιβωτίου (safe drops).
              Money that left the drawer during the shift and is not missing:
              the reconciliation adds it back, which is why it is listed here
              beside the count rather than buried in the review. */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200/80 pb-2">
              <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Vault className="w-4 h-4 text-indigo-600" />
                <span>Χρηματοκιβώτιο (Safe Drop)</span>
              </h4>
              <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 font-mono">
                {formatCurrency(totalSafeDrops(safeDrops))}
              </span>
            </div>

            {safeDrops.length === 0 ? (
              <p className="text-xs text-slate-500">
                Καμία κατάθεση σε αυτή τη βάρδια.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {safeDrops.map((drop, idx) => (
                  <li
                    key={`${drop.at}-${idx}`}
                    className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-900 font-mono">
                        {formatCurrency(drop.amount)}
                      </span>
                      <span className="block text-micro text-slate-500 truncate">
                        {drop.at ? new Date(drop.at).toLocaleString('el-GR') : '—'}
                        {drop.note ? ` · ${drop.note}` : ''}
                        {drop.by ? ` · ${drop.by}` : ''}
                      </span>
                    </span>
                    {(canManage || safeDropAllowedForEmployee) && (
                      <button
                        type="button"
                        onClick={() => setSafeDrops((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                        aria-label={`Αφαίρεση κατάθεσης ${formatCurrency(drop.amount)}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canManage || safeDropAllowedForEmployee ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-32">
                  <label htmlFor="safe-drop-amount" className="block text-micro font-bold text-slate-600 mb-1">
                    Ποσό (€)
                  </label>
                  <input
                    id="safe-drop-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    max={MAX_CURRENCY_AMOUNT}
                    value={newSafeDropAmount}
                    onChange={(e) => setNewSafeDropAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold font-mono text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex-1 min-w-40">
                  <label htmlFor="safe-drop-note" className="block text-micro font-bold text-slate-600 mb-1">
                    Σημείωση
                  </label>
                  <input
                    id="safe-drop-note"
                    type="text"
                    maxLength={MAX_LABEL_LENGTH}
                    value={newSafeDropNote}
                    onChange={(e) => setNewSafeDropNote(e.target.value)}
                    placeholder="προαιρετικά"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  disabled={safeNum(newSafeDropAmount) <= 0}
                  onClick={() => {
                    setSafeDrops((prev) =>
                      sortSafeDrops([
                        ...prev,
                        {
                          amount: safeNum(newSafeDropAmount),
                          note: newSafeDropNote.trim() || undefined,
                          at: new Date().toISOString(),
                          by: user?.first_name ? `${user.first_name} ${user.last_name ?? ''}`.trim() : undefined,
                        },
                      ])
                    );
                    setNewSafeDropAmount('');
                    setNewSafeDropNote('');
                  }}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-extrabold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Κατάθεση
                </button>
              </div>
            ) : (
              <p className="text-micro text-slate-500">
                Οι καταθέσεις χρηματοκιβωτίου καταχωρούνται από τον υπεύθυνο.
              </p>
            )}
          </div>

        </div>
      )}

      {/* STEP 5: REVIEW, RECONCILIATION & SUBMISSION */}
      {currentStep === 5 && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6 transition-opacity duration-150 starting:opacity-0">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 font-extrabold flex items-center justify-center text-sm">5</span>
                <span>Τελικός Έλεγχος & Επιβεβαίωση</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Επιβεβαιώστε το ισοζύγιο ταμείου και το Σύνολο Καταμέτρησης πριν την οριστική υποβολή.
              </p>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                id="btn-preview-receipt-step5"
                onClick={() => setShowReceiptModal(true)}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center space-x-2 shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-95"
                title="Προεπισκόπηση τελικής απόδειξης βάρδιας"
              >
                <Eye className="w-4 h-4 text-white" />
                <span>Προεπισκόπηση Τελικής Απόδειξης</span>
              </button>
            </div>
          </div>

          {/* The four figures that close a shift, in the order the Owner reads
              them: the difference first and loudest, the envelope beside it
              because that is what physically changes hands, and underneath
              the two numbers the difference comes from. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Διαφορά Ταμείου - the answer, so it leads. */}
            <div
              className={`p-5 rounded-2xl border-2 shadow-md ${
                discResult.isExceedingThreshold
                  ? 'bg-rose-50 border-rose-400'
                  : discResult.isUnbalanced
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-emerald-50 border-emerald-300'
              }`}
            >
              <span className="text-xs font-black uppercase tracking-wider block text-slate-700">
                Διαφορά Ταμείου
              </span>
              <p
                className={`text-3xl font-black mt-1 font-mono ${
                  discResult.discrepancy < 0
                    ? 'text-rose-700'
                    : discResult.discrepancy > 0
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}
              >
                {formatCurrency(discResult.discrepancy, { showSign: true })}
              </p>
              <p className="text-xs font-bold mt-1">
                {discResult.isExceedingThreshold ? (
                  <span className="text-rose-700 flex items-center space-x-1">
                    <AlertTriangle className="w-4 h-4 inline shrink-0" />
                    <span>Υπέρβαση ορίου ({formatCurrency(discrepancyThreshold)})</span>
                  </span>
                ) : discResult.isUnbalanced ? (
                  <span className="text-amber-700">Μικρή απόκλιση εντός ορίου</span>
                ) : (
                  <span className="text-emerald-700">✓ Απόλυτα ισοσκελισμένο</span>
                )}
              </p>
            </div>

            {/* 2. Φάκελος Παράδοσης - what actually leaves the shop. */}
            <div
              className={`p-5 rounded-2xl border-2 shadow-md ${
                envelope.isShort ? 'bg-rose-50 border-rose-300' : 'bg-indigo-50 border-indigo-300'
              }`}
            >
              <span className="text-xs font-black uppercase tracking-wider block text-slate-700">
                Φάκελος Παράδοσης
              </span>
              <p
                className={`text-3xl font-black mt-1 font-mono ${
                  envelope.isShort ? 'text-rose-800' : 'text-indigo-900'
                }`}
              >
                {formatCurrency(envelope.handedOver)}
              </p>
              <div className="text-micro mt-1 space-y-0.5 text-slate-600">
                {envelope.isShort ? (
                  <p className="text-rose-700 font-semibold">
                    Το συρτάρι έχει λιγότερα από το πάγιο κεφάλαιο
                    ({formatCurrency(openingCashTotal)}).
                  </p>
                ) : (
                  <p>
                    Μένουν {formatCurrency(envelope.retained)} στο συρτάρι ως πάγιο
                    κεφάλαιο για αύριο.
                  </p>
                )}
                {envelope.coinHandover > 0 && (
                  <p>
                    Περιλαμβάνει {formatCurrency(envelope.coinHandover)} παράδοση
                    κερμάτων.
                  </p>
                )}
                {envelope.settlement > 0 && (
                  <p className="text-emerald-700">
                    Περιλαμβάνει {formatCurrency(envelope.settlement)} εξόφληση
                    απόκλισης — εκτός εισπράξεων.
                  </p>
                )}
                {totalSafeDrops(safeDrops) > 0 && (
                  <p>
                    Επιπλέον {formatCurrency(totalSafeDrops(safeDrops))} ήδη στο
                    χρηματοκιβώτιο.
                  </p>
                )}
              </div>
            </div>

            {/* 3 + 4. The two figures the difference is the gap between. */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Αναμενόμενο Ταμείο
              </span>
              <p className="text-2xl font-black text-slate-900 mt-1 font-mono">
                {formatCurrency(expectedCash)}
              </p>
              <p className="text-micro text-slate-500 mt-1">
                Βάσει εισροών/εκροών συστήματος.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 text-white border border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Σύνολο Καταμέτρησης
              </span>
              <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">
                {formatCurrency(reconciliationNetTotal)}
              </p>
              <p className="text-micro text-slate-400 mt-1 font-medium">
                Μετρητά {formatCurrency(countedCash)} + POS + Έξοδα + Πιστώσεις -
                Επιστροφές - Αρχικό
              </p>
            </div>
          </div>

          {/* 📋 Πλήρες Φύλλο Ισοσκελισμού Βάρδιας (Ακριβές Πρότυπο Excel) */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-xl space-y-5">
            {/* Excel Top Header */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60 text-xs">
              <div className="space-y-1.5 border-b md:border-b-0 md:border-r border-slate-700/60 pb-3 md:pb-0 md:pr-4">
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-slate-500 font-bold">Κατάστημα:</span>
                  <span className="font-mono font-bold text-white bg-slate-900/60 px-2.5 py-0.5 rounded border border-slate-700/40">
                    {shift.store_code || shift.store_id || '100343'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-slate-500 font-bold">Ημερομηνία:</span>
                  <span className="font-mono font-bold text-white">
                    {shift.opened_at ? new Date(shift.opened_at).toLocaleDateString('el-GR') : new Date().toLocaleDateString('el-GR')}
                  </span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-slate-500 font-bold">Βάρδια:</span>
                  <span className="font-mono font-bold text-indigo-300">
                    {shift.shift_type === 'MORNING' ? 'A (Πρωινή)' : shift.shift_type === 'AFTERNOON' ? 'B (Απογευματινή)' : (shift.shift_type || 'B')}
                  </span>
                </div>
              </div>

              <div className="space-y-2 flex flex-col justify-between">
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-slate-500 font-bold">Όνομα Χρήστη:</span>
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
                    {formatCurrency(discResult.discrepancy, { showSign: true })}
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
                  {modules.scratch && (
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
                      Ελληνικά Λαχεία | Σκρατς
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Πωλήσεις:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(scratchSales))}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Εξαργυρώσεις:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(scratchPayouts))}</span>
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{formatCurrency(totalScratchNet)}</span>
                    </div>
                  </div>
                  )}

                  {/* 2. Tora */}
                  {modules.tora && (
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
                      Tora
                    </div>
                    {toraPosItems.map((item, idx) => (
                      <div key={item.id || idx} className="flex justify-between text-slate-300 py-0.5">
                        <span>{item.name || `Tora Pos #${idx + 1}`}:</span>
                        <span className="font-mono font-bold text-white">{formatCurrency(safeNum(item.amount))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{formatCurrency(totalToraPos)}</span>
                    </div>
                  </div>
                  )}

                  {/* 3. Clever Point */}
                  {modules.cleverPoint && (
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
                      Clever Point
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold pt-0.5">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{formatCurrency(safeNum(cleverPointTotal))}</span>
                    </div>
                  </div>
                  )}

                  {/* 4. Ιππόδρομος */}
                  {modules.ippodromos && (
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
                      Ιππόδρομος
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Υπόλοιπο Ταμείου:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(ippodromosBalance))}</span>
                    </div>
                  </div>
                  )}

                  {/* 5. VLTs */}
                  {modules.vlts && (
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
                      VLTs
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Μετρητά στα VLTs:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(vltsIn))}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Ροή Μετρητών:</span>
                      <span className={`font-mono font-bold ${signedVltsOut < 0 ? 'text-rose-400' : signedVltsOut > 0 ? 'text-emerald-400' : 'text-white'}`}>
                        {formatCurrency(signedVltsOut, { showSign: true })}
                      </span>
                    </div>
                  </div>
                  )}

                  {/* 6. Pame Stoixima | Virtuals */}
                  {modules.pameStoixima && (
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
                      Pame Stoixima | Virtuals
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Υπόλοιπο Ταμείου:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(pameStoiximaBalance))}</span>
                    </div>
                  </div>
                  )}

                  {/* 7. Αριθμοπαιχνίδια */}
                  {modules.numberGames && (
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
                      Αριθμοπαιχνίδια
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Πωλήσεις:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(arithmoGross))}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Ακυρώσεις:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(arithmoCancels))}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Εξαργυρώσεις:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(arithmoPayouts))}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Vouchers:</span>
                      <span className={`font-mono font-bold ${safeNum(arithmoVouchers) < 0 ? 'text-rose-400' : 'text-white'}`}>
                        {formatCurrency(safeNum(arithmoVouchers))}
                      </span>
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{formatCurrency(totalArithmoNet)}</span>
                    </div>
                  </div>
                  )}

                  {/* 8. Ταμείο FnB */}
                  {modules.fnb && (
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
                      Ταμείο FnB
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Μετρητά:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(fnbCashInDrawer)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Pos:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(fnbCard))}</span>
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{formatCurrency(fnbCashInDrawer + safeNum(fnbCard))}</span>
                    </div>
                  </div>
                  )}
                </div>

                {/* Bottom Left Blue Bar */}
                <div className="bg-blue-900 text-white px-4 py-2.5 flex justify-between items-center text-xs font-black uppercase tracking-wider border-t border-blue-800">
                  <span>Σύνολο Ταμείου (Αναφορές):</span>
                  <span className="font-mono text-sm">{formatCurrency(expectedCash)}</span>
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
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
                      Αρχικό κεφάλαιο
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Μετρητά:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(openingNotesAmount))}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Κέρματα:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(openingCoinsAmount))}</span>
                    </div>
                    {topUps.map((value, idx) =>
                      safeNum(value) === 0 ? null : (
                        <div key={idx} className="flex justify-between text-slate-300 py-0.5">
                          <span>Προσαύξηση #{idx + 1}:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(safeNum(value))}</span>
                        </div>
                      )
                    )}
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{formatCurrency(openingCashTotal)}</span>
                    </div>
                  </div>

                  {/* Block 2: Κέρματα Ταμείου */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
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
                            <span className="font-mono font-bold text-white w-20 text-right">{formatCurrency(subtotal)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{formatCurrency(banknotesAndCoins.coins)}</span>
                    </div>
                  </div>

                  {/* Block 3: Μετρητά Ταμείου */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
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
                            <span className="font-mono font-bold text-white w-20 text-right">{formatCurrency(subtotal)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{formatCurrency(banknotesAndCoins.banknotes)}</span>
                    </div>
                  </div>

                  {/* Block 4: Ταμείο */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/40 space-y-1">
                    <div className="text-center font-black text-indigo-300 border-b border-slate-700/40 pb-1 text-micro uppercase tracking-wider">
                      Ταμείο
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Μετρητά:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(banknotesAndCoins.banknotes)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Κέρματα:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(banknotesAndCoins.coins)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Χρηματοκιβώτιο:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(safeNum(bankDeposits))}</span>
                    </div>
                    {storePosItems.map((item, idx) => (
                      <div key={item.id || idx} className="flex justify-between text-slate-300 py-0.5">
                        <span>{item.name || `Pos #${idx + 1}`}:</span>
                        <span className="font-mono font-bold text-white">{formatCurrency(safeNum(item.amount))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Έξοδα ΓΠ:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(expensesGpCashTotal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Έξοδα FnB:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(expensesFnbCashTotal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Πιστώσεις:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(creditGrantedTotal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 py-0.5">
                      <span>Επιστροφές:</span>
                      <span className="font-mono font-bold text-rose-300">{creditCollectedTotal > 0 ? `-${formatCurrency(creditCollectedTotal)}` : formatCurrency(0)}</span>
                    </div>
                    <div className="flex justify-between text-indigo-200 font-bold border-t border-slate-700/30 pt-1">
                      <span>Σύνολο:</span>
                      <span className="font-mono text-white">{formatCurrency(reconciliationBreakdown.grossTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Right Blue Bar */}
                <div className="bg-blue-900 text-white px-4 py-2.5 flex justify-between items-center text-xs font-black uppercase tracking-wider border-t border-blue-800">
                  <span>Σύνολο Καταμέτρησης:</span>
                  <span className="font-mono text-sm text-emerald-300">{formatCurrency(reconciliationNetTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* The «Αναλυτικό Ισοζύγιο Βάρδιας (Σύστημα)» table stood here. It
              restated, line by line, figures the three cards above already
              give - and it did so at the point where someone is trying to
              decide whether the till balances. Removed at the Owner's
              request; nothing was computed only here. */}

          {/* This used to announce that the WHOLE shortage would be charged,
              which stopped being true in 0034: the accepted tolerance is
              absorbed and only the excess reaches the operator. A banner that
              overstates what someone owes is worse than no banner. */}
          {discResult.discrepancy < 0 && !operatorIsExempt && (
            <div
              className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${
                chargeReachesOperator
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {chargeReachesOperator ? (
                <span>
                  Από το έλλειμμα {formatCurrency(Math.abs(discResult.discrepancy))}, τα{' '}
                  <strong>{formatCurrency(Math.abs(split.absorbed))}</strong> καλύπτονται από
                  την αποδεκτή απόκλιση και τα{' '}
                  <strong>{formatCurrency(split.charged)}</strong> χρεώνονται στον χειριστή
                  ({shift.opened_by_user_name || 'Υπάλληλος'}). Στην υποβολή θα επιλέξετε
                  άμεση εξόφληση ή αποθήκευση του ελλείμματος.
                </span>
              ) : (
                <span>
                  Το έλλειμμα {formatCurrency(Math.abs(discResult.discrepancy))} καλύπτεται
                  από την αποδεκτή απόκλιση ({formatCurrency(safeNum(discrepancyThreshold))}).
                  Καταγράφεται στο ιστορικό αποκλίσεων και δεν χρεώνεται σε κανέναν.
                </span>
              )}
            </div>
          )}

          {/* Employee Closing Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 tracking-wider mb-1.5">
              {toGreekUpper('Σημειώσεις Βάρδιας (Προαιρετικό)')}
            </label>
            <textarea
              value={employeeNotes}
              maxLength={MAX_NOTES_LENGTH}
              onChange={(e) => setEmployeeNotes(e.target.value)}
              placeholder="Γράψτε τυχόν παρατηρήσεις ή αιτιολογήστε τυχόν αποκλίσεις..."
              rows={3}
              className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="handover-message"
              className="block text-xs font-bold text-slate-700 tracking-wider mb-1.5"
            >
              {toGreekUpper('Μήνυμα για την επόμενη βάρδια (Προαιρετικό)')}
            </label>
            <textarea
              id="handover-message"
              value={handoverMessage}
              maxLength={MAX_NOTES_LENGTH}
              onChange={(e) => setHandoverMessage(e.target.value)}
              placeholder="π.χ. Ο κ. Παπαδόπουλος θα περάσει να εξοφλήσει. Το VLT 3 κολλάει."
              rows={3}
              className="w-full px-4 py-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Εμφανίζεται ως αναδυόμενο μήνυμα στους συναδέλφους μετά την υποβολή.
            </p>
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
            className="transition px-5 py-2.5 rounded-xl duration-150 ease-out active:scale-[0.97] disabled:active:scale-100 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center space-x-1"
          >
            <span>Επόμενο Βήμα</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              id="btn-preview-receipt-footer"
              onClick={() => setShowReceiptModal(true)}
              className="px-4 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center space-x-2 shadow-2xs transition-colors cursor-pointer hover:border-slate-400"
              title="Προεπισκόπηση τελικής απόδειξης βάρδιας"
            >
              <Eye className="w-4 h-4 text-indigo-600" />
              <span>Προεπισκόπηση Απόδειξης</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSubmitConfirm(true)}
              disabled={isSubmitting}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md transition-all active:scale-95 flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Οριστική Υποβολή Βάρδιας</span>
            </button>
          </div>
        )}
      </div>

      {/* Print Receipt Modal (Only opened when user clicks Preview) */}
      <ShiftReceiptPrintView
        data={receiptData}
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
      />
    </div>
  );
};

