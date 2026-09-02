import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Coins,
  Receipt,
  Ticket,
  Coffee,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Info,
  DollarSign,
  Building,
  CheckSquare,
  Banknote,
  CreditCard,
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  User,
  Clock,
  Store,
} from 'lucide-react';
import { Shift, ShiftTemplateConfig } from '../../types/index.ts';
import { safeNum, roundCurrency } from '../../services/financialCalculator.ts';
import { DEFAULT_OPAP_SHIFT_TEMPLATE } from '../../services/shiftTemplateService.ts';

interface ShiftLedgerSheetProps {
  shift?: Partial<Shift>;
  template?: ShiftTemplateConfig;
  readOnly?: boolean;
  onValuesChange?: (updatedValues: Record<string, any>) => void;
}

export const ShiftLedgerSheet: React.FC<ShiftLedgerSheetProps> = ({
  shift = {},
  template,
  readOnly = true,
  onValuesChange,
}) => {
  // Store details & Header
  const storeName = shift.store_name || shift.store_code || 'OPAP Agency';
  const userName = shift.closed_by_user_name || shift.opened_by_user_name || 'Υπάλληλος Βάρδιας';
  const dateStr = shift.closed_at
    ? new Date(shift.closed_at).toLocaleDateString('el-GR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('el-GR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

  const shiftTypeLabel =
    shift.shift_type === 'MORNING'
      ? 'Πρωινή (A)'
      : shift.shift_type === 'AFTERNOON'
      ? 'Απογευματινή (B)'
      : shift.shift_type === 'NIGHT'
      ? 'Βραδινή (Γ)'
      : shift.shift_type || 'Βάρδια A';

  // SECTION 1: REPORTS (System Inputs / Calculated)
  const [scratchSales, setScratchSales] = useState<string>(
    String(shift.scratch_sales ?? shift.scratch_lotto_sales ?? 0)
  );
  const [scratchPayouts, setScratchPayouts] = useState<string>(String(shift.scratch_payouts ?? 0));

  const [toraPos1, setToraPos1] = useState<string>(
    String(shift.tora_pos1 ?? shift.tora_pos_1 ?? 0)
  );
  const [toraPos2, setToraPos2] = useState<string>(
    String(shift.tora_pos2 ?? shift.tora_pos_2 ?? 0)
  );

  const [cleverPoint, setCleverPoint] = useState<string>(String(shift.clever_point_total ?? 0));
  const [ippodromos, setIppodromos] = useState<string>(String(shift.ippodromos_balance ?? 0));

  const [vltsCashIn, setVltsCashIn] = useState<string>(String(shift.vlts_cash_in ?? 0));
  const [vltsCashflow, setVltsCashflow] = useState<string>(
    String(
      shift.vlts_net !== undefined
        ? shift.vlts_net
        : (shift.vlts_cash_in || 0) + (shift.vlts_cash_out || 0)
    )
  );

  const [pameStoixima, setPameStoixima] = useState<string>(String(shift.pame_stoixima_balance ?? 0));

  const [numberSales, setNumberSales] = useState<string>(
    String(shift.number_games_sales ?? shift.arithmo_gross ?? shift.opap_gross_sales ?? 0)
  );
  const [numberCancellations, setNumberCancellations] = useState<string>(
    String(shift.number_games_cancellations ?? shift.arithmo_cancels ?? 0)
  );
  const [numberPayouts, setNumberPayouts] = useState<string>(
    String(shift.number_games_payouts ?? shift.arithmo_payouts ?? shift.opap_payouts ?? 0)
  );
  const [numberVouchers, setNumberVouchers] = useState<string>(
    String(shift.number_games_vouchers ?? shift.arithmo_vouchers ?? 0)
  );

  const [fnbCash, setFnbCash] = useState<string>(String(shift.fnb_cash ?? 0));
  const [fnbCard, setFnbCard] = useState<string>(String(shift.fnb_card ?? 0));

  // SECTION 2: PHYSICAL COUNT & FLOAT
  const [floatCashNotes, setFloatCashNotes] = useState<string>(
    String(shift.opening_cash_notes ?? shift.starting_cash_notes ?? shift.starting_cash ?? 0)
  );
  const [floatCoins, setFloatCoins] = useState<string>(
    String(shift.opening_cash_coins ?? shift.starting_coin_notes ?? 0)
  );
  const [floatAdd1, setFloatAdd1] = useState<string>(
    String(shift.custom_field_values?.opening_topup_1 ?? shift.starting_addition_1 ?? 0)
  );
  const [floatAdd2, setFloatAdd2] = useState<string>(
    String(shift.custom_field_values?.opening_topup_2 ?? shift.starting_addition_2 ?? 0)
  );

  // Coin & Banknote Denominations
  const [coinsCount, setCoinsCount] = useState<Record<string, number>>({
    '2': 0,
    '1': 0,
    '0.50': 0,
    '0.20': 0,
    '0.10': 0,
    ...(shift.counted_denominations || {}),
  });

  const [notesCount, setNotesCount] = useState<Record<string, number>>({
    '5': 0,
    '10': 0,
    '20': 0,
    '50': 0,
    '100': 0,
    '200': 0,
    '500': 0,
    ...(shift.counted_denominations || {}),
  });

  // Physical Counts & Outflows
  const [safeDrop, setSafeDrop] = useState<string>(
    String(shift.safe_drop ?? shift.bank_deposits ?? 0)
  );
  const [registerPos1, setRegisterPos1] = useState<string>(
    String(shift.register_pos_1 ?? (shift.card_payments && !shift.register_pos_2 ? shift.card_payments : 0))
  );
  const [registerPos2, setRegisterPos2] = useState<string>(String(shift.register_pos_2 ?? 0));
  const [opapExpenses, setOpapExpenses] = useState<string>(
    String(shift.opap_expenses ?? shift.expenses_paid_cash ?? 0)
  );
  const [fnbExpenses, setFnbExpenses] = useState<string>(String(shift.fnb_expenses ?? 0));
  const [creditsGranted, setCreditsGranted] = useState<string>(
    String(shift.customer_credit_granted ?? 0)
  );
  const [customerReturns, setCustomerReturns] = useState<string>(
    String(shift.customer_credit_collected ?? shift.customer_returns ?? 0)
  );

  const activeTemplate = template || DEFAULT_OPAP_SHIFT_TEMPLATE;
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>(
    shift.custom_field_values || {}
  );
  const [showScratchDetails, setShowScratchDetails] = useState<boolean>(false);
  const savedScratchItems = Array.isArray(shift.custom_field_values?.scratch_ticket_items)
    ? shift.custom_field_values.scratch_ticket_items
    : [];
  const savedToraPosItems = Array.isArray(shift.custom_field_values?.tora_pos_items)
    ? shift.custom_field_values.tora_pos_items
    : null;
  const savedStorePosItems = Array.isArray(shift.custom_field_values?.store_pos_items)
    ? shift.custom_field_values.store_pos_items
    : null;

  // Sync state if shift prop updates externally
  useEffect(() => {
    setScratchSales(String(shift.scratch_sales ?? shift.scratch_lotto_sales ?? 0));
    setScratchPayouts(String(shift.scratch_payouts ?? 0));
    setToraPos1(String(shift.tora_pos1 ?? shift.tora_pos_1 ?? 0));
    setToraPos2(String(shift.tora_pos2 ?? shift.tora_pos_2 ?? 0));
    setCleverPoint(String(shift.clever_point_total ?? 0));
    setIppodromos(String(shift.ippodromos_balance ?? 0));
    setVltsCashIn(String(shift.vlts_cash_in ?? 0));
    setVltsCashflow(
      String(
        shift.vlts_net !== undefined
          ? shift.vlts_net
          : (shift.vlts_cash_in || 0) + (shift.vlts_cash_out || 0)
      )
    );
    setPameStoixima(String(shift.pame_stoixima_balance ?? 0));
    setNumberSales(String(shift.number_games_sales ?? shift.arithmo_gross ?? shift.opap_gross_sales ?? 0));
    setNumberCancellations(String(shift.number_games_cancellations ?? shift.arithmo_cancels ?? 0));
    setNumberPayouts(String(shift.number_games_payouts ?? shift.arithmo_payouts ?? shift.opap_payouts ?? 0));
    setNumberVouchers(String(shift.number_games_vouchers ?? shift.arithmo_vouchers ?? 0));
    setFnbCash(String(shift.fnb_cash ?? 0));
    setFnbCard(String(shift.fnb_card ?? 0));
    setSafeDrop(String(shift.safe_drop ?? shift.bank_deposits ?? 0));
    setRegisterPos1(
      String(shift.register_pos_1 ?? (shift.card_payments && !shift.register_pos_2 ? shift.card_payments : 0))
    );
    setRegisterPos2(String(shift.register_pos_2 ?? 0));
    setOpapExpenses(String(shift.opap_expenses ?? shift.expenses_paid_cash ?? 0));
    setFnbExpenses(String(shift.fnb_expenses ?? 0));
    setCreditsGranted(String(shift.customer_credit_granted ?? 0));
    setCustomerReturns(String(shift.customer_credit_collected ?? shift.customer_returns ?? 0));
    setCustomFieldValues(shift.custom_field_values || {});
    setCoinsCount({
      '2': 0,
      '1': 0,
      '0.50': 0,
      '0.20': 0,
      '0.10': 0,
      ...(shift.counted_denominations || {}),
    });
    setNotesCount({
      '5': 0,
      '10': 0,
      '20': 0,
      '50': 0,
      '100': 0,
      '200': 0,
      '500': 0,
      ...(shift.counted_denominations || {}),
    });
  }, [shift]);

  // -------------------------------------------------------------
  // AUTOMATIC CALCULATIONS
  // -------------------------------------------------------------
  const scratchTotal = roundCurrency(safeNum(scratchSales) - safeNum(scratchPayouts));
  const toraTotal = roundCurrency(
    savedToraPosItems && savedToraPosItems.length > 0
      ? savedToraPosItems.reduce((sum: number, item: any) => sum + safeNum(item.amount), 0)
      : safeNum(toraPos1) + safeNum(toraPos2)
  );
  const numberGamesNet = roundCurrency(
    safeNum(numberSales) - safeNum(numberCancellations) - safeNum(numberPayouts) + safeNum(numberVouchers)
  );
  const fnbTotal = roundCurrency(safeNum(fnbCash) + safeNum(fnbCard));

  const totalSystemRegister = roundCurrency(
    scratchTotal +
      toraTotal +
      safeNum(cleverPoint) +
      safeNum(ippodromos) +
      safeNum(vltsCashflow) +
      safeNum(pameStoixima) +
      numberGamesNet +
      fnbTotal
  );

  const floatTotal = roundCurrency(
    safeNum(floatCashNotes) + safeNum(floatCoins) + safeNum(floatAdd1) + safeNum(floatAdd2)
  );

  const coinsTotal = roundCurrency(
    safeNum(coinsCount['2']) * 2 +
      safeNum(coinsCount['1']) * 1 +
      safeNum(coinsCount['0.50']) * 0.5 +
      safeNum(coinsCount['0.20']) * 0.2 +
      safeNum(coinsCount['0.10']) * 0.1
  );

  const banknotesTotal = roundCurrency(
    safeNum(notesCount['5']) * 5 +
      safeNum(notesCount['10']) * 10 +
      safeNum(notesCount['20']) * 20 +
      safeNum(notesCount['50']) * 50 +
      safeNum(notesCount['100']) * 100 +
      safeNum(notesCount['200']) * 200 +
      safeNum(notesCount['500']) * 500
  );

  const totalPhysicalCash = banknotesTotal + coinsTotal > 0
    ? banknotesTotal + coinsTotal
    : safeNum(shift.actual_cash) || safeNum(shift.counted_cash) || 0;

  const totalOutflows = roundCurrency(
    safeNum(safeDrop) +
      safeNum(registerPos1) +
      safeNum(registerPos2) +
      safeNum(opapExpenses) +
      safeNum(fnbExpenses) +
      safeNum(creditsGranted) +
      safeNum(customerReturns)
  );

  const totalCountedRegister = roundCurrency(totalPhysicalCash + totalOutflows);
  const discrepancyResult = shift.discrepancy !== undefined
    ? shift.discrepancy
    : roundCurrency(totalCountedRegister - (totalSystemRegister + floatTotal));

  useEffect(() => {
    if (onValuesChange && !readOnly) {
      onValuesChange({
        scratch_lotto_sales: safeNum(scratchSales),
        scratch_payouts: safeNum(scratchPayouts),
        scratch_net: scratchTotal,
        tora_pos_1: safeNum(toraPos1),
        tora_pos_2: safeNum(toraPos2),
        tora_total: toraTotal,
        clever_point_total: safeNum(cleverPoint),
        ippodromos_balance: safeNum(ippodromos),
        vlts_cash_in: safeNum(vltsCashIn),
        vlts_net: safeNum(vltsCashflow),
        pame_stoixima_balance: safeNum(pameStoixima),
        number_games_sales: safeNum(numberSales),
        number_games_cancellations: safeNum(numberCancellations),
        number_games_payouts: safeNum(numberPayouts),
        number_games_vouchers: safeNum(numberVouchers),
        number_games_net: numberGamesNet,
        fnb_cash: safeNum(fnbCash),
        fnb_card: safeNum(fnbCard),
        fnb_total: fnbTotal,
        expected_cash: totalSystemRegister,
        counted_coins: coinsTotal,
        counted_banknotes: banknotesTotal,
        counted_cash: totalPhysicalCash,
        safe_drop: safeNum(safeDrop),
        card_payments: safeNum(registerPos1) + safeNum(registerPos2),
        opap_expenses: safeNum(opapExpenses),
        fnb_expenses: safeNum(fnbExpenses),
        customer_credit_granted: safeNum(creditsGranted),
        customer_returns: safeNum(customerReturns),
        total_counted: totalCountedRegister,
        discrepancy: discrepancyResult,
        custom_field_values: customFieldValues,
      });
    }
  }, [
    scratchSales,
    scratchPayouts,
    toraPos1,
    toraPos2,
    cleverPoint,
    ippodromos,
    vltsCashIn,
    vltsCashflow,
    pameStoixima,
    numberSales,
    numberCancellations,
    numberPayouts,
    numberVouchers,
    fnbCash,
    fnbCard,
    floatCashNotes,
    floatCoins,
    safeDrop,
    registerPos1,
    registerPos2,
    opapExpenses,
    fnbExpenses,
    creditsGranted,
    customerReturns,
    readOnly,
  ]);

  const formattedDiscrepancyStr =
    discrepancyResult === 0
      ? '0.00 €'
      : discrepancyResult > 0
      ? `+${discrepancyResult.toFixed(2)} €`
      : `${discrepancyResult.toFixed(2)} €`;

  return (
    <div className="bg-slate-50/60 p-4 sm:p-6 rounded-2xl border border-slate-200/80 font-sans space-y-6 text-slate-800">
      {/* ------------------------------------------------------------- */}
      {/* HEADER CARD: Katastima, Hmerominia, Vardia, Apotelesma */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Φύλλο Αναφοράς Βάρδιας
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                  {shiftTypeLabel}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Σύνοψη καταμετρήσεων, εισπράξεων & εκροών ταμείου
              </p>
            </div>
          </div>

          {/* Outcome Status Badge */}
          <div className="flex items-center gap-2">
            <div
              className={`px-4 py-2 rounded-xl border flex items-center space-x-2 ${
                Math.abs(discrepancyResult) < 0.01
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : discrepancyResult > 0
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {Math.abs(discrepancyResult) < 0.01 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                  Αποτέλεσμα Ταμείου:
                </span>
                <span className="text-sm font-black font-mono">
                  {formattedDiscrepancyStr}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-slate-400 font-bold block text-[10px] uppercase mb-0.5 flex items-center gap-1">
              <Store className="w-3 h-3" /> Κατάστημα
            </span>
            <span className="font-bold text-slate-900">{storeName}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-slate-400 font-bold block text-[10px] uppercase mb-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Ημερομηνία
            </span>
            <span className="font-bold text-slate-900">{dateStr}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-slate-400 font-bold block text-[10px] uppercase mb-0.5 flex items-center gap-1">
              <User className="w-3 h-3" /> Χρήστης
            </span>
            <span className="font-bold text-slate-900 truncate block">{userName}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-slate-400 font-bold block text-[10px] uppercase mb-0.5 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Κατάσταση
            </span>
            <span className="font-bold text-slate-900">
              {shift.status === 'APPROVED'
                ? 'Εγκεκριμένη'
                : shift.status === 'SUBMITTED'
                ? 'Υποβλήθηκε'
                : shift.status === 'CORRECTION_REQUESTED'
                ? 'Αίτηση Διόρθωσης'
                : 'Σε εξέλιξη'}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4 TOP KEY METRICS TILES */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
            1. Αρχικό Ταμείο
          </span>
          <p className="text-lg font-black text-slate-900 font-mono">
            {floatTotal.toFixed(2)} €
          </p>
          <p className="text-[10px] text-slate-400">Κεφάλαιο έναρξης</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
            2. Αναμενόμενα Έσοδα
          </span>
          <p className="text-lg font-black text-indigo-600 font-mono">
            {totalSystemRegister.toFixed(2)} €
          </p>
          <p className="text-[10px] text-slate-400">Σύνολο πωλήσεων/συστημάτων</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
            3. Φυσική Καταμέτρηση
          </span>
          <p className="text-lg font-black text-slate-900 font-mono">
            {totalCountedRegister.toFixed(2)} €
          </p>
          <p className="text-[10px] text-slate-400">Μετρητά & εκροές/POS</p>
        </div>

        <div
          className={`p-4 rounded-2xl border shadow-2xs space-y-1 ${
            Math.abs(discrepancyResult) < 0.01
              ? 'bg-emerald-50/60 border-emerald-200'
              : discrepancyResult > 0
              ? 'bg-indigo-50/60 border-indigo-200'
              : 'bg-rose-50/60 border-rose-200'
          }`}
        >
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
            4. Απόκλιση
          </span>
          <p
            className={`text-lg font-black font-mono ${
              Math.abs(discrepancyResult) < 0.01
                ? 'text-emerald-700'
                : discrepancyResult > 0
                ? 'text-indigo-700'
                : 'text-rose-700'
            }`}
          >
            {formattedDiscrepancyStr}
          </p>
          <p className="text-[10px] text-slate-500 font-medium">
            {Math.abs(discrepancyResult) < 0.01
              ? 'Πλήρης ταύτιση'
              : discrepancyResult > 0
              ? 'Πλεόνασμα'
              : 'Έλλειμμα'}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2 MAIN COLUMNS: ANALYTICS / SALES vs COUNT / OUTFLOWS */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN: SALES & SYSTEM REPORTS */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Ticket className="w-4 h-4 text-indigo-600" />
              1. Αναφορές & Εισπράξεις Συστημάτων
            </h3>
            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
              {totalSystemRegister.toFixed(2)} €
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {/* Number Games */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 block">Αριθμοπαιχνίδια (Kino, Joker, etc)</span>
                <span className="text-[10px] text-slate-400">
                  Πωλήσεις: {safeNum(numberSales).toFixed(2)}€ • Πληρωμές: -{safeNum(numberPayouts).toFixed(2)}€
                </span>
              </div>
              <span className="font-bold font-mono text-slate-900">
                {numberGamesNet.toFixed(2)} €
              </span>
            </div>

            {/* Scratch / Lotto */}
            <div className="py-2.5 space-y-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-800">Σκρατς & Λαχεία</span>
                    {savedScratchItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowScratchDetails(!showScratchDetails)}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 transition-colors"
                      >
                        {showScratchDetails ? 'Απόκρυψη Αριθμών' : 'Αναλυτικοί Αριθμοί (Αρχικό - Τελικό)'}
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Πωλήσεις: {safeNum(scratchSales).toFixed(2)}€ • Εξαργυρώσεις: -{safeNum(scratchPayouts).toFixed(2)}€
                  </span>
                </div>
                <span className="font-bold font-mono text-slate-900">
                  {scratchTotal.toFixed(2)} €
                </span>
              </div>

              {/* Expandable Breakdown of Scratch Serial Numbers */}
              {showScratchDetails && savedScratchItems.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] space-y-1.5 font-mono">
                  <div className="grid grid-cols-5 text-slate-500 font-bold uppercase text-[9px] pb-1 border-b border-slate-200">
                    <span className="col-span-2">Τύπος Σκρατς</span>
                    <span className="text-center">Αρχικό</span>
                    <span className="text-center">Τελικό</span>
                    <span className="text-right">Σύνολο (€)</span>
                  </div>
                  {savedScratchItems.map((item: any, idx: number) => {
                    const start = parseInt(item.startNo, 10);
                    const end = parseInt(item.endNo, 10);
                    const qty = (!isNaN(start) && !isNaN(end) && end >= start) ? (end - start) : (parseInt(item.manualQty, 10) || 0);
                    const rowTotal = qty * (item.price || 0);

                    return (
                      <div key={item.id || idx} className="grid grid-cols-5 text-slate-700 py-0.5 border-b border-slate-100 last:border-none">
                        <span className="col-span-2 font-bold font-sans text-slate-900">{item.name} ({item.price}€)</span>
                        <span className="text-center text-slate-600">{item.startNo !== '' ? item.startNo : '-'}</span>
                        <span className="text-center text-slate-600">{item.endNo !== '' ? item.endNo : '-'}</span>
                        <span className="text-right font-bold text-emerald-700">{rowTotal > 0 ? `${rowTotal.toFixed(2)}€` : '-'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tora POS */}
            <div className="py-2.5 space-y-2 border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block">TORA DIRECT</span>
                  <span className="text-[10px] text-slate-400">Πληρωμές λογαριασμών & TORA DIRECT (Ορίζονται από Manager)</span>
                </div>
                <span className="font-bold font-mono text-slate-900">
                  {toraTotal.toFixed(2)} €
                </span>
              </div>
              {savedToraPosItems && savedToraPosItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {savedToraPosItems.map((posItem: any, idx: number) => (
                    <span
                      key={posItem.id || idx}
                      className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-mono border border-slate-200"
                    >
                      <span className="font-sans font-bold text-slate-800 mr-1">{posItem.name}:</span>
                      {safeNum(posItem.amount).toFixed(2)} €
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* VLTs / PLAY */}
            {safeNum(vltsCashflow) !== 0 && (
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block">VLTs (PLAY Games)</span>
                  <span className="text-[10px] text-slate-400">Καθαρή ροή μετρητών</span>
                </div>
                <span className="font-bold font-mono text-slate-900">
                  {safeNum(vltsCashflow).toFixed(2)} €
                </span>
              </div>
            )}

            {/* Clever Point */}
            {safeNum(cleverPoint) !== 0 && (
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block">Clever Point</span>
                  <span className="text-[10px] text-slate-400">Υπηρεσίες δεμάτων</span>
                </div>
                <span className="font-bold font-mono text-slate-900">
                  {safeNum(cleverPoint).toFixed(2)} €
                </span>
              </div>
            )}

            {/* FnB */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 block">FnB & Αναψυκτήριο</span>
                <span className="text-[10px] text-slate-400">
                  Μετρητά: {safeNum(fnbCash).toFixed(2)}€ • Κάρτα: {safeNum(fnbCard).toFixed(2)}€
                </span>
              </div>
              <span className="font-bold font-mono text-slate-900">
                {fnbTotal.toFixed(2)} €
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: CASH COUNT & OUTFLOWS */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-600" />
              2. Καταμέτρηση Ταμείου & Εκροές
            </h3>
            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
              {totalCountedRegister.toFixed(2)} €
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {/* Physical Cash */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800 block">Μετρητά & Κέρματα στο Ταμείο</span>
                  <span className="text-[10px] text-slate-400">
                    Χαρτονομίσματα ({banknotesTotal.toFixed(2)}€) + Κέρματα ({coinsTotal.toFixed(2)}€)
                  </span>
                </div>
              </div>
              <span className="font-bold font-mono text-slate-900">
                {totalPhysicalCash.toFixed(2)} €
              </span>
            </div>

            {/* Safe Drop */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Building className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800 block">Αφαίρεση στο Χρηματοκιβώτιο (Safe Drop)</span>
                  <span className="text-[10px] text-slate-400">Μεταφορά ασφαλείας</span>
                </div>
              </div>
              <span className="font-bold font-mono text-slate-900">
                {safeNum(safeDrop).toFixed(2)} €
              </span>
            </div>

            {/* POS Payments */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-indigo-500 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800 block">Πληρωμές με Κάρτα (POS)</span>
                  <span className="text-[10px] text-slate-400">
                    {savedStorePosItems && savedStorePosItems.length > 0
                      ? savedStorePosItems
                          .map((p) => `${p.name}: ${safeNum(p.amount).toFixed(2)}€`)
                          .join(' | ')
                      : 'Τραπεζικές εισπράξεις POS'}
                  </span>
                </div>
              </div>
              <span className="font-bold font-mono text-slate-900">
                {(
                  savedStorePosItems && savedStorePosItems.length > 0
                    ? savedStorePosItems.reduce((acc, p) => acc + safeNum(p.amount), 0)
                    : safeNum(registerPos1) + safeNum(registerPos2)
                ).toFixed(2)}{' '}
                €
              </span>
            </div>

            {/* Expenses */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800 block">Έξοδα & Πληρωμές Βάρδιας</span>
                  <span className="text-[10px] text-slate-400">Πληρωμές προμηθευτών & δαπάνες</span>
                </div>
              </div>
              <span className="font-bold font-mono text-slate-900">
                {(safeNum(opapExpenses) + safeNum(fnbExpenses)).toFixed(2)} €
              </span>
            </div>

            {/* Credits / Returns */}
            {(safeNum(creditsGranted) > 0 || safeNum(customerReturns) > 0) && (
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block">Πιστώσεις & Επιστροφές</span>
                  <span className="text-[10px] text-slate-400">
                    Πιστώσεις ({safeNum(creditsGranted).toFixed(2)}€) • Επιστροφές ({safeNum(customerReturns).toFixed(2)}€)
                  </span>
                </div>
                <span className="font-bold font-mono text-slate-900">
                  {(safeNum(creditsGranted) + safeNum(customerReturns)).toFixed(2)} €
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CUSTOM FIELDS / NOTES */}
      {shift.custom_field_values && Object.keys(shift.custom_field_values).length > 0 && (
        (() => {
          const entries = Object.entries(shift.custom_field_values).filter(
            ([key, val]) =>
              key !== 'scratch_ticket_items' &&
              key !== 'tora_pos_items' &&
              val !== null &&
              val !== undefined &&
              val !== ''
          );

          if (entries.length === 0) return null;

          const formatCustomLabel = (rawKey: string) => {
            const labelsMap: Record<string, string> = {
              custom_safe_drop: 'Κατάθεση Safe Drop',
              custom_cleaning_expense: 'Έξοδα Καθαριότητας',
              custom_courier_vouchers: 'Vouchers Courier',
              custom_sanitization_check: 'Έλεγχος Καθαριότητας / Απολύμανσης',
              custom_shift_note: 'Σημείωση Βάρδιας',
            };
            if (labelsMap[rawKey]) return labelsMap[rawKey];
            return rawKey
              .replace(/^custom_/, '')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase());
          };

          const formatCustomValue = (val: any) => {
            if (typeof val === 'boolean') {
              return val ? (
                <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ✓ Ναι (Επιβεβαιώθηκε)
                </span>
              ) : (
                <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  ✗ Όχι (Εκκρεμεί)
                </span>
              );
            }
            if (typeof val === 'object') {
              try {
                return <span className="font-mono text-slate-700">{JSON.stringify(val)}</span>;
              } catch {
                return String(val);
              }
            }
            return <span className="font-bold text-slate-900">{String(val)}</span>;
          };

          return (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Σημειώσεις & Ειδικές Καταχωρήσεις Βάρδιας
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                {entries.map(([key, val]) => (
                  <div key={key} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between space-y-1">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">
                      {formatCustomLabel(key)}
                    </span>
                    <div>{formatCustomValue(val)}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};
