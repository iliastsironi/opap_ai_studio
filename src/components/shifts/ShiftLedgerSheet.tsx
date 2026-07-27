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
  RefreshCw,
  Sparkles,
  Info,
  DollarSign,
  Building,
  Plus,
  Trash2,
  Lock,
  CheckSquare,
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
  readOnly = false,
  onValuesChange,
}) => {
  // Store details & Header
  const storeCode = shift.store_code || shift.store_name || '100343';
  const userName = shift.closed_by_user_name || shift.opened_by_user_name || 'Περικλής Βέττας';
  const dateStr = shift.closed_at
    ? new Date(shift.closed_at).toLocaleDateString('el-GR')
    : new Date().toLocaleDateString('el-GR');
  const shiftTypeLabel = shift.shift_type === 'MORNING' ? 'A' : shift.shift_type === 'AFTERNOON' ? 'B' : shift.shift_type || 'B';

  // SECTION 1: REPORTS (Left Column)
  // Scratch / Lottery
  const [scratchSales, setScratchSales] = useState<string>(String(shift.scratch_lotto_sales ?? 731.0));
  const [scratchPayouts, setScratchPayouts] = useState<string>('442.00');

  // Tora POS
  const [toraPos1, setToraPos1] = useState<string>(String(shift.tora_pos_1 ?? 2669.67));
  const [toraPos2, setToraPos2] = useState<string>(String(shift.tora_pos_2 ?? ''));

  // Clever Point
  const [cleverPoint, setCleverPoint] = useState<string>(String(shift.clever_point_total ?? ''));

  // Ippodromos (Horse Racing)
  const [ippodromos, setIppodromos] = useState<string>(String(shift.ippodromos_balance ?? ''));

  // VLTs
  const [vltsCashIn, setVltsCashIn] = useState<string>(String(shift.vlts_cash_in ?? ''));
  const [vltsCashflow, setVltsCashflow] = useState<string>(String(shift.vlts_net ?? -471.85));

  // Pame Stoixima / Virtuals
  const [pameStoixima, setPameStoixima] = useState<string>(String(shift.pame_stoixima_balance ?? 136.41));

  // Number Games (Αριθμοπαιχνίδια: Joker, Keno, etc)
  const [numberSales, setNumberSales] = useState<string>(String(shift.number_games_sales ?? 4217.0));
  const [numberCancellations, setNumberCancellations] = useState<string>(String(shift.number_games_cancellations ?? 5.0));
  const [numberPayouts, setNumberPayouts] = useState<string>(String(shift.number_games_payouts ?? 2989.36));
  const [numberVouchers, setNumberVouchers] = useState<string>(String(shift.number_games_vouchers ?? -63.75));

  // FnB Bar Register
  const [fnbCash, setFnbCash] = useState<string>(String(shift.fnb_cash ?? 172.30));
  const [fnbCard, setFnbCard] = useState<string>(String(shift.fnb_card ?? ''));

  // SECTION 2: COUNTING (Right Column)
  // Starting Cash Float (Αρχικό Κεφάλαιο)
  const [floatCashNotes, setFloatCashNotes] = useState<string>(String(shift.starting_cash_notes ?? 1000.0));
  const [floatCoins, setFloatCoins] = useState<string>(String(shift.starting_coin_notes ?? 274.70));
  const [floatAdd1, setFloatAdd1] = useState<string>(String(shift.starting_addition_1 ?? ''));
  const [floatAdd2, setFloatAdd2] = useState<string>(String(shift.starting_addition_2 ?? ''));

  // Coin Denominations
  const [coinsCount, setCoinsCount] = useState<Record<string, number>>({
    '2': 35,
    '1': 208,
    '0.50': 30,
    '0.20': 36,
    '0.10': 28,
    '0.05': 0,
    '0.02': 0,
    '0.01': 0,
    ...(shift.counted_denominations || {}),
  });

  // Banknote Denominations
  const [notesCount, setNotesCount] = useState<Record<string, number>>({
    '5': 15,
    '10': 23,
    '20': 19,
    '50': 25,
    '100': 0,
    '200': 0,
    '500': 0,
    ...(shift.counted_denominations || {}),
  });

  // Cash Register Physical Counts & Outflows
  const [safeDrop, setSafeDrop] = useState<string>(String(shift.safe_drop ?? ''));
  const [registerPos1, setRegisterPos1] = useState<string>(String(shift.card_payments ?? 739.94));
  const [registerPos2, setRegisterPos2] = useState<string>('');
  const [opapExpenses, setOpapExpenses] = useState<string>(String(shift.opap_expenses ?? 2383.82));
  const [fnbExpenses, setFnbExpenses] = useState<string>(String(shift.fnb_expenses ?? 18.00));
  const [creditsGranted, setCreditsGranted] = useState<string>(String(shift.customer_credit_granted ?? 45.00));
  const [customerReturns, setCustomerReturns] = useState<string>(String(shift.customer_returns ?? 195.00));

  // Custom Fields state & Template resolution
  const activeTemplate = template || DEFAULT_OPAP_SHIFT_TEMPLATE;
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>(
    shift.custom_field_values || {
      custom_safe_drop: '250.00',
      custom_cleaning_expense: '15.00',
      custom_courier_vouchers: '4',
      custom_sanitization_check: true,
      custom_shift_note: 'Όλα pota & τερματικά λειτούργησαν κανονικά.',
    }
  );

  // -------------------------------------------------------------
  // AUTOMATIC FORMULA CALCULATIONS
  // -------------------------------------------------------------

  // 1. Scratch Net = Sales - Payouts
  const scratchTotal = roundCurrency(safeNum(scratchSales) - safeNum(scratchPayouts));

  // 2. Tora Total = Pos 1 + Pos 2
  const toraTotal = roundCurrency(safeNum(toraPos1) + safeNum(toraPos2));

  // 3. Number Games Net = Sales - Cancellations - Payouts + Vouchers
  const numberGamesNet = roundCurrency(
    safeNum(numberSales) - safeNum(numberCancellations) - safeNum(numberPayouts) + safeNum(numberVouchers)
  );

  // 4. FnB Total = Cash + Card
  const fnbTotal = roundCurrency(safeNum(fnbCash) + safeNum(fnbCard));

  // 5. Total Expected System Cash Flow (Σύνολο Ταμείου)
  // Formula = Scratch Net + Tora + Clever Point + Ippodromos + VLT Cashflow + Pame Stoixima + Number Games Net + FnB Total
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

  // 6. Starting Float Total = Float Cash + Float Coins + Add1 + Add2
  const floatTotal = roundCurrency(
    safeNum(floatCashNotes) + safeNum(floatCoins) + safeNum(floatAdd1) + safeNum(floatAdd2)
  );

  // 7. Coin Calculator Total
  const coinsTotal = roundCurrency(
    safeNum(coinsCount['2']) * 2 +
      safeNum(coinsCount['1']) * 1 +
      safeNum(coinsCount['0.50']) * 0.5 +
      safeNum(coinsCount['0.20']) * 0.2 +
      safeNum(coinsCount['0.10']) * 0.1 +
      safeNum(coinsCount['0.05']) * 0.05 +
      safeNum(coinsCount['0.02']) * 0.02 +
      safeNum(coinsCount['0.01']) * 0.01
  );

  // 8. Banknotes Calculator Total
  const banknotesTotal = roundCurrency(
    safeNum(notesCount['5']) * 5 +
      safeNum(notesCount['10']) * 10 +
      safeNum(notesCount['20']) * 20 +
      safeNum(notesCount['50']) * 50 +
      safeNum(notesCount['100']) * 100 +
      safeNum(notesCount['200']) * 200 +
      safeNum(notesCount['500']) * 500
  );

  // 9. Total Physical Count Value (Σύνολο Καταμέτρησης)
  // Banknotes + Coins + Safe Drop + POS1 + POS2 + OPAP Expenses + FnB Expenses + Credits + Returns
  const totalCountedRegister = roundCurrency(
    banknotesTotal +
      coinsTotal +
      safeNum(safeDrop) +
      safeNum(registerPos1) +
      safeNum(registerPos2) +
      safeNum(opapExpenses) +
      safeNum(fnbExpenses) +
      safeNum(creditsGranted) +
      safeNum(customerReturns)
  );

  // 10. Discrepancy Result (Αποτέλεσμα Ταμείου) = Σύνολο Καταμέτρησης - Σύνολο Ταμείου
  const discrepancyResult = roundCurrency(totalCountedRegister - totalSystemRegister);

  // Notify parent on change
  useEffect(() => {
    if (onValuesChange) {
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
        counted_cash: banknotesTotal + coinsTotal,
        safe_drop: safeNum(safeDrop),
        card_payments: safeNum(registerPos1) + safeNum(registerPos2),
        opap_expenses: safeNum(opapExpenses),
        fnb_expenses: safeNum(fnbExpenses),
        customer_credit_granted: safeNum(creditsGranted),
        customer_returns: safeNum(customerReturns),
        total_counted: totalCountedRegister,
        discrepancy: discrepancyResult,
        counted_denominations: { ...coinsCount, ...notesCount },
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
    floatAdd1,
    floatAdd2,
    coinsCount,
    notesCount,
    safeDrop,
    registerPos1,
    registerPos2,
    opapExpenses,
    fnbExpenses,
    creditsGranted,
    customerReturns,
  ]);

  // Section visibility based on template (or show all if no template)
  const showScratch = template ? template.show_scratch : true;
  const showTora = template ? template.show_tora : true;
  const showCleverPoint = template ? template.show_clever_point : true;
  const showIppodromos = template ? template.show_ippodromos : true;
  const showVlts = template ? template.show_vlts : true;
  const showPameStoixima = template ? template.show_pame_stoixima : true;
  const showNumberGames = template ? template.show_number_games : true;
  const showFnb = template ? template.show_fnb : true;

  const formattedDiscrepancyStr =
    (discrepancyResult >= 0 ? '+' : '') + discrepancyResult.toFixed(2) + ' €';

  const renderCustomFieldsBySection = (section: 'REPORTS' | 'COUNTING') => {
    const fields = (activeTemplate.custom_fields || []).filter(
      (f) => f.enabled && f.section === section && !f.isSystemManaged && f.type !== 'SYSTEM_MANAGED'
    );

    if (fields.length === 0) return null;

    return (
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-3.5 space-y-3">
        <div className="border-b border-slate-700 pb-1.5 flex items-center justify-between">
          <span className="font-extrabold text-xs text-indigo-300 uppercase tracking-wide flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Προσαρμοσμένα Πεδία Βάρδιας ({section === 'REPORTS' ? 'Αναφορές' : 'Καταμέτρηση'})</span>
          </span>
          <span className="text-[10px] text-slate-400 font-semibold">
            {fields.length} πεδία
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {fields.map((field) => (
            <div key={field.id} className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-700/60 space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-200">
                  {field.label} {field.required && <span className="text-rose-400">*</span>}
                </label>
              </div>

              {field.description && (
                <p className="text-[10px] text-slate-400">{field.description}</p>
              )}

              {field.type === 'CURRENCY' ? (
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    placeholder={field.placeholder || '0.00'}
                    value={customFieldValues[field.key] ?? ''}
                    onChange={(e) =>
                      setCustomFieldValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-right font-mono font-bold text-emerald-400 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                  <span className="absolute left-2.5 top-1 text-[11px] text-slate-500 font-bold">€</span>
                </div>
              ) : field.type === 'NUMBER' ? (
                <input
                  type="number"
                  disabled={readOnly}
                  placeholder={field.placeholder || '0'}
                  value={customFieldValues[field.key] ?? ''}
                  onChange={(e) =>
                    setCustomFieldValues((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-right font-mono font-bold text-white focus:outline-none focus:border-indigo-500 text-xs"
                />
              ) : field.type === 'BOOLEAN' ? (
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() =>
                    setCustomFieldValues((prev) => ({
                      ...prev,
                      [field.key]: !prev[field.key],
                    }))
                  }
                  className={`w-full py-1.5 px-2.5 rounded font-bold text-xs flex items-center justify-between transition-all cursor-pointer ${
                    customFieldValues[field.key]
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-950 text-slate-400 border border-slate-700'
                  }`}
                >
                  <span>{customFieldValues[field.key] ? 'ΝΑΙ - Ολοκληρώθηκε' : 'ΟΧΙ - Εκκρεμεί'}</span>
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
              ) : (
                <input
                  type="text"
                  disabled={readOnly}
                  placeholder={field.placeholder || 'Σημείωση...'}
                  value={customFieldValues[field.key] ?? ''}
                  onChange={(e) =>
                    setCustomFieldValues((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-900 text-slate-100 p-4 sm:p-6 rounded-2xl shadow-2xl border border-slate-800 font-sans max-w-6xl mx-auto space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* SHEET HEADER: Κατάστημα, Ημερομηνία, Βάρδια, Χρήστης, Αποτέλεσμα */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-700/60 pb-3 mb-3 gap-3">
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-indigo-600/30 text-indigo-400 rounded-lg border border-indigo-500/30">
              <Calculator className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white uppercase">
                Αναφορά Βάρδιας (Shift Ledger Report Sheet)
              </h2>
              <p className="text-xs text-slate-400">
                Πλήρης φύλλο καταμετρήσεων & αναφορών ταμείου ΟΠΑΠ
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div
              className={`px-4 py-2 rounded-xl border flex items-center space-x-2 ${
                discrepancyResult === 0
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : Math.abs(discrepancyResult) <= 10
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
              }`}
            >
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
                Αποτέλεσμα Ταμείου:
              </span>
              <span className="text-base font-black font-mono">
                {formattedDiscrepancyStr}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">
              Κατάστημα:
            </span>
            <span className="font-extrabold text-indigo-300 font-mono text-sm">
              {storeCode}
            </span>
          </div>

          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">
              Ημερομηνία:
            </span>
            <span className="font-extrabold text-slate-200">{dateStr}</span>
          </div>

          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">
              Βάρδια:
            </span>
            <span className="font-extrabold text-amber-400">{shiftTypeLabel}</span>
          </div>

          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">
              Όνομα Χρήστη:
            </span>
            <span className="font-extrabold text-slate-200 truncate block">
              {userName}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DUAL COLUMN MAIN LAYOUT: ΑΝΑΦΟΡΕΣ (LEFT) vs ΚΑΤΑΜΕΤΡΗΣΗ (RIGHT) */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ========================================================= */}
        {/* LEFT COLUMN: ΑΝΑΦΟΡΕΣ (SYSTEM REPORTS) */}
        {/* ========================================================= */}
        <div className="space-y-5">
          <div className="bg-indigo-950/40 border border-indigo-900/50 px-4 py-2.5 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Ticket className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-indigo-200">
                Αναφορές
              </h3>
            </div>
            <span className="text-[10px] text-indigo-400 font-semibold bg-indigo-900/60 px-2 py-0.5 rounded-md">
              Συστήματα & Πωλήσεις
            </span>
          </div>

          {/* 1. Ελληνικά Λαχεία | Σκρατς */}
          {showScratch && (
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 space-y-2.5">
              <div className="border-b border-slate-700/60 pb-1.5 flex justify-between items-center">
                <span className="font-bold text-xs text-indigo-300 uppercase tracking-wide">
                  Ελληνικά Λαχεία | Σκρατς
                </span>
                <span className="text-[10px] text-slate-400">
                  (Σύνολο = Πωλήσεις - Εξαργυρώσεις)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Πωλήσεις:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={scratchSales}
                    onChange={(e) => setScratchSales(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Εξαργυρώσεις:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={scratchPayouts}
                    onChange={(e) => setScratchPayouts(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-mono font-bold text-rose-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-indigo-400 block mb-1 font-bold">
                    Σύνολο Σκρατς:
                  </label>
                  <div className="w-full bg-slate-950 border border-indigo-900/60 rounded-lg px-2.5 py-1.5 text-right font-mono font-black text-indigo-300">
                    {scratchTotal.toFixed(2)} €
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Tora POS */}
          {showTora && (
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 space-y-2.5">
              <div className="border-b border-slate-700/60 pb-1.5 flex justify-between items-center">
                <span className="font-bold text-xs text-indigo-300 uppercase tracking-wide">
                  Tora
                </span>
                <span className="text-[10px] text-slate-400">
                  (Πληρωμές Τερματικών Tora)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Pos #1:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={toraPos1}
                    onChange={(e) => setToraPos1(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Pos #2:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={toraPos2}
                    onChange={(e) => setToraPos2(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-indigo-400 block mb-1 font-bold">
                    Σύνολο Tora:
                  </label>
                  <div className="w-full bg-slate-950 border border-indigo-900/60 rounded-lg px-2.5 py-1.5 text-right font-mono font-black text-indigo-300">
                    {toraTotal.toFixed(2)} €
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Clever Point & Ιππόδρομος */}
          <div className="grid grid-cols-2 gap-3">
            {showCleverPoint && (
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3">
                <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
                  Clever Point (Σύνολο)
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={cleverPoint}
                  placeholder="0.00 €"
                  onChange={(e) => setCleverPoint(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-mono font-bold text-white focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>
            )}

            {showIppodromos && (
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3">
                <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
                  Ιππόδρομος (Υπόλοιπο)
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={ippodromos}
                  placeholder="0.00 €"
                  onChange={(e) => setIppodromos(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-mono font-bold text-white focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>
            )}
          </div>

          {/* 4. VLTs & Pame Stoixima */}
          <div className="grid grid-cols-2 gap-3">
            {showVlts && (
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 space-y-2">
                <span className="font-bold text-xs text-indigo-300 block">
                  VLTs (PLAY Games)
                </span>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">
                    Ροή Μετρητών VLTs:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={vltsCashflow}
                    onChange={(e) => setVltsCashflow(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-mono font-bold text-amber-300 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            {showPameStoixima && (
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 space-y-2">
                <span className="font-bold text-xs text-indigo-300 block">
                  Pame Stoixima | Virtuals
                </span>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">
                    Υπόλοιπο Ταμείου:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={pameStoixima}
                    onChange={(e) => setPameStoixima(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 5. Αριθμοπαιχνίδια (Joker, Keno, Lotto, etc) */}
          {showNumberGames && (
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 space-y-2.5">
              <div className="border-b border-slate-700/60 pb-1.5 flex justify-between items-center">
                <span className="font-bold text-xs text-indigo-300 uppercase tracking-wide">
                  Αριθμοπαιχνίδια (Τζόκερ, Κίνο, Λόττο)
                </span>
                <span className="text-[10px] text-slate-400">
                  (Σύνολο = Πωλήσεις - Ακυρώσεις - Εξαργυρώσεις + Vouchers)
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Πωλήσεις:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={numberSales}
                    onChange={(e) => setNumberSales(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Ακυρώσεις:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={numberCancellations}
                    onChange={(e) => setNumberCancellations(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-rose-300 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Εξαργυρώσεις:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={numberPayouts}
                    onChange={(e) => setNumberPayouts(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-rose-300 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Vouchers:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={numberVouchers}
                    onChange={(e) => setNumberVouchers(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-amber-300 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-700/60 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-300">
                  Σύνολο Αριθμοπαιχνιδιών:
                </span>
                <span className="text-sm font-black font-mono text-indigo-300 bg-slate-950 px-3 py-1 rounded-lg border border-indigo-900/60">
                  {numberGamesNet.toFixed(2)} €
                </span>
              </div>
            </div>
          )}

          {/* 6. Ταμείο FnB */}
          {showFnb && (
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-xs text-indigo-300 uppercase tracking-wide block">
                Ταμείο FnB (Bar / Καφέ)
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Μετρητά:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={fnbCash}
                    onChange={(e) => setFnbCash(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    POS:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    value={fnbCard}
                    onChange={(e) => setFnbCard(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-indigo-400 block mb-1 font-bold">
                    Σύνολο FnB:
                  </label>
                  <div className="w-full bg-slate-950 border border-indigo-900/60 rounded-lg px-2 py-1 text-right font-mono font-black text-indigo-300 text-xs">
                    {fnbTotal.toFixed(2)} €
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Custom Manager Fields (Left Column - Reports) */}
          {renderCustomFieldsBySection('REPORTS')}

          {/* SYSTEM SUMMARY BAR (LEFT COLUMN BOTTOM) */}
          <div className="bg-slate-950 border-2 border-indigo-500/40 rounded-xl p-4 flex items-center justify-between shadow-lg">
            <span className="text-sm font-black text-white uppercase tracking-wider">
              Σύνολο Ταμείου (Expected Cash System):
            </span>
            <span className="text-xl font-black font-mono text-emerald-400 bg-slate-900 px-3.5 py-1.5 rounded-xl border border-emerald-500/30">
              {totalSystemRegister.toFixed(2)} €
            </span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: ΚΑΤΑΜΕΤΡΗΣΗ (PHYSICAL COUNT & BREAKDOWN) */}
        {/* ========================================================= */}
        <div className="space-y-5">
          <div className="bg-emerald-950/40 border border-emerald-900/50 px-4 py-2.5 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Coins className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-emerald-200">
                Καταμέτρηση
              </h3>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-900/60 px-2 py-0.5 rounded-md">
              Φυσική Καταμέτρηση & Παραστατικά
            </span>
          </div>

          {/* 1. Αρχικό κεφάλαιο (Float Cash) */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 space-y-2">
            <div className="border-b border-slate-700/60 pb-1.5 flex justify-between items-center">
              <span className="font-bold text-xs text-emerald-300 uppercase tracking-wide">
                Αρχικό Κεφάλαιο (Shift Float)
              </span>
              <span className="text-xs font-black font-mono text-emerald-400">
                Σύνολο: {floatTotal.toFixed(2)} €
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Μετρητά:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={floatCashNotes}
                  onChange={(e) => setFloatCashNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Κέρματα:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={floatCoins}
                  onChange={(e) => setFloatCoins(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Προσαύξηση #1:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={floatAdd1}
                  placeholder="0.00"
                  onChange={(e) => setFloatAdd1(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Προσαύξηση #2:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={floatAdd2}
                  placeholder="0.00"
                  onChange={(e) => setFloatAdd2(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* 2. Κέρματα Ταμείου (Coins Calculator) */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 space-y-2">
            <div className="border-b border-slate-700/60 pb-1.5 flex justify-between items-center">
              <span className="font-bold text-xs text-emerald-300 uppercase tracking-wide">
                Κέρματα Ταμείου
              </span>
              <span className="text-xs font-black font-mono text-emerald-400">
                Σύνολο Κερμάτων: {coinsTotal.toFixed(2)} €
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {[
                { denom: '2', val: 2, label: '2x' },
                { denom: '1', val: 1, label: '1x' },
                { denom: '0.50', val: 0.5, label: '0.5x' },
                { denom: '0.20', val: 0.2, label: '0.2x' },
                { denom: '0.10', val: 0.1, label: '0.1x' },
              ].map((item) => {
                const count = coinsCount[item.denom] || 0;
                const subtotal = count * item.val;
                return (
                  <div
                    key={item.denom}
                    className="bg-slate-900 p-2 rounded-lg border border-slate-700/60 text-center"
                  >
                    <span className="text-[10px] text-slate-400 block font-bold">
                      {item.label} ({item.denom}€)
                    </span>
                    <input
                      type="number"
                      min="0"
                      disabled={readOnly}
                      value={count || ''}
                      placeholder="0"
                      onChange={(e) =>
                        setCoinsCount((prev) => ({
                          ...prev,
                          [item.denom]: Math.max(0, parseInt(e.target.value) || 0),
                        }))
                      }
                      className="w-full text-center bg-slate-950 border border-slate-700 rounded my-1 font-mono font-bold text-white text-xs py-0.5 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[11px] font-mono font-extrabold text-emerald-300 block">
                      {subtotal.toFixed(2)} €
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Μετρητά Ταμείου (Banknotes Calculator) */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 space-y-2">
            <div className="border-b border-slate-700/60 pb-1.5 flex justify-between items-center">
              <span className="font-bold text-xs text-emerald-300 uppercase tracking-wide">
                Μετρητά Ταμείου (Χαρτονομίσματα)
              </span>
              <span className="text-xs font-black font-mono text-emerald-400">
                Σύνολο Μετρητών: {banknotesTotal.toFixed(2)} €
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                { denom: '5', val: 5, label: '5x' },
                { denom: '10', val: 10, label: '10x' },
                { denom: '20', val: 20, label: '20x' },
                { denom: '50', val: 50, label: '50x' },
                { denom: '100', val: 100, label: '100x' },
                { denom: '200', val: 200, label: '200x' },
                { denom: '500', val: 500, label: '500x' },
              ].map((item) => {
                const count = notesCount[item.denom] || 0;
                const subtotal = count * item.val;
                return (
                  <div
                    key={item.denom}
                    className="bg-slate-900 p-2 rounded-lg border border-slate-700/60 text-center"
                  >
                    <span className="text-[10px] text-slate-400 block font-bold">
                      {item.label} ({item.denom}€)
                    </span>
                    <input
                      type="number"
                      min="0"
                      disabled={readOnly}
                      value={count || ''}
                      placeholder="0"
                      onChange={(e) =>
                        setNotesCount((prev) => ({
                          ...prev,
                          [item.denom]: Math.max(0, parseInt(e.target.value) || 0),
                        }))
                      }
                      className="w-full text-center bg-slate-950 border border-slate-700 rounded my-1 font-mono font-bold text-white text-xs py-0.5 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[11px] font-mono font-extrabold text-emerald-300 block">
                      {subtotal.toFixed(2)} €
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Ταμείο Breakdown (Physical Counts, POS, Safe & Outflows) */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 space-y-2">
            <span className="font-bold text-xs text-emerald-300 uppercase tracking-wide block border-b border-slate-700/60 pb-1">
              Ανακεφαλαίωση Ταμείου & Έξοδα
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Μετρητά (Χαρτ.):</span>
                <span className="font-mono font-extrabold text-white text-sm">
                  {banknotesTotal.toFixed(2)} €
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Κέρματα:</span>
                <span className="font-mono font-extrabold text-white text-sm">
                  {coinsTotal.toFixed(2)} €
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Χρηματοκιβώτιο:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={safeDrop}
                  placeholder="0.00"
                  onChange={(e) => setSafeDrop(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Pos #1:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={registerPos1}
                  onChange={(e) => setRegisterPos1(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Pos #2:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={registerPos2}
                  placeholder="0.00"
                  onChange={(e) => setRegisterPos2(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-amber-300 block mb-0.5 font-bold">
                  Έξοδα ΓΠ:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={opapExpenses}
                  onChange={(e) => setOpapExpenses(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-amber-300 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-amber-300 block mb-0.5 font-bold">
                  Έξοδα FnB:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={fnbExpenses}
                  onChange={(e) => setFnbExpenses(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-amber-300 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-sky-300 block mb-0.5 font-bold">
                  Πιστώσεις:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={creditsGranted}
                  onChange={(e) => setCreditsGranted(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-sky-300 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-rose-300 block mb-0.5 font-bold">
                  Επιστροφές:
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  value={customerReturns}
                  onChange={(e) => setCustomerReturns(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono font-bold text-rose-300 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Custom Manager Fields (Right Column - Counting) */}
          {renderCustomFieldsBySection('COUNTING')}

          {/* TOTAL COUNTED BAR (RIGHT COLUMN BOTTOM) */}
          <div className="bg-slate-950 border-2 border-emerald-500/40 rounded-xl p-4 flex items-center justify-between shadow-lg">
            <span className="text-sm font-black text-white uppercase tracking-wider">
              Σύνολο Καταμέτρησης:
            </span>
            <span className="text-xl font-black font-mono text-emerald-400 bg-slate-900 px-3.5 py-1.5 rounded-xl border border-emerald-500/30">
              {totalCountedRegister.toFixed(2)} €
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
