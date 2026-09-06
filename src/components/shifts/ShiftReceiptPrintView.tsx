import React, { useEffect } from 'react';
import { Printer, X, Download, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Shift, ShiftExpense } from '../../types/index.ts';
import { safeNum, roundCurrency } from '../../services/financialCalculator.ts';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';

export interface ShiftReceiptData {
  shift: Partial<Shift>;
  storeName?: string;
  storeCode?: string;
  registerId?: string;
  cashierName?: string;
  shiftType?: string;
  openedAt?: string;
  closedAt?: string;
  denominations?: Record<string, number | string>;
  // Calculated or Override values
  openingNotes?: number;
  openingCoins?: number;
  openingTopUp1?: number;
  openingTopUp2?: number;
  openingCashTotal?: number;
  
  // OPAP Sales
  arithmoGross?: number;
  arithmoCancels?: number;
  arithmoPayouts?: number;
  arithmoVouchers?: number;
  arithmoNet?: number;

  scratchSales?: number;
  scratchPayouts?: number;
  scratchNet?: number;

  vltsIn?: number;
  vltsOut?: number;
  vltsNet?: number;

  pameStoiximaBalance?: number;
  cleverPointTotal?: number;
  ippodromosBalance?: number;

  fnbCash?: number;
  fnbCard?: number;
  fnbTotal?: number;

  // Expenses
  expensesGpCash?: number;
  expensesFnbCash?: number;
  expensesTotalCash?: number;
  expensesList?: Array<{ id?: string; category?: string; recipient?: string; amount?: number; notes?: string }>;

  // Outflows & Cards
  safeDrop?: number;
  storePos1?: number;
  storePos2?: number;
  totalStorePos?: number;
  toraPos1?: number;
  toraPos2?: number;
  totalToraPos?: number;

  creditGranted?: number;
  creditCollected?: number;

  // Counted Totals
  banknotesTotal?: number;
  coinsTotal?: number;
  drawerCashTotal?: number;
  totalCountedCash?: number;
  totalExpectedCash?: number;
  discrepancy?: number;
  isUnbalanced?: boolean;
  employeeNotes?: string;
  managerNotes?: string;
}

interface ShiftReceiptPrintViewProps {
  data: ShiftReceiptData;
  isOpen?: boolean;
  onClose?: () => void;
  isInline?: boolean; // If true, rendered inline inside step 5 or a view
}

export const ShiftReceiptPrintView: React.FC<ShiftReceiptPrintViewProps> = ({
  data,
  isOpen = true,
  onClose,
  isInline = false,
}) => {
  const {
    shift,
    storeName = shift.store_name || 'OPAP AGENCY',
    storeCode = shift.store_code || shift.store_id || '100343',
    registerId = shift.register_id || 'POS-01',
    cashierName = shift.closed_by_user_name || shift.opened_by_user_name || 'Υπάλληλος Βάρδιας',
    shiftType = shift.shift_type || 'MORNING',
    openedAt = shift.opened_at || new Date().toISOString(),
    closedAt = shift.closed_at || new Date().toISOString(),
    denominations = shift.counted_denominations || {},
  } = data;

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return `${d.toLocaleDateString('el-GR')} ${d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoStr;
    }
  };

  const shiftTypeDisplay = () => {
    switch (shiftType) {
      case 'MORNING':
        return 'ΠΡΩΙΝΗ (Α)';
      case 'AFTERNOON':
        return 'ΑΠΟΓΕΥΜΑΤΙΝΗ (Β)';
      case 'NIGHT':
        return 'ΒΡΑΔΙΝΗ (Γ)';
      default:
        return toGreekUpper(shiftType);
    }
  };

  // Denomination lists
  const banknoteList = [
    { label: '500€', key: '500', val: 500 },
    { label: '200€', key: '200', val: 200 },
    { label: '100€', key: '100', val: 100 },
    { label: '50€',  key: '50',  val: 50 },
    { label: '20€',  key: '20',  val: 20 },
    { label: '10€',  key: '10',  val: 10 },
    { label: '5€',   key: '5',   val: 5 },
  ];

  const coinList = [
    { label: '2.00€', key: '2', val: 2 },
    { label: '1.00€', key: '1', val: 1 },
    { label: '0.50€', key: '0.50', altKey: '0.5', val: 0.5 },
    { label: '0.20€', key: '0.20', altKey: '0.2', val: 0.2 },
    { label: '0.10€', key: '0.10', altKey: '0.1', val: 0.1 },
    { label: '0.05€', key: '0.05', altKey: '0.05', val: 0.05 },
  ];

  const getDenomQty = (key: string, altKey?: string) => {
    const val = denominations[key] ?? (altKey ? denominations[altKey] : undefined) ?? denominations[`eur_${key.replace('.', '')}`] ?? denominations[`eur_${key}`];
    return Math.floor(safeNum(val));
  };

  const calculatedBanknotes = banknoteList.reduce((sum, item) => sum + getDenomQty(item.key) * item.val, 0);
  const calculatedCoins = coinList.reduce((sum, item) => sum + getDenomQty(item.key, item.altKey) * item.val, 0);

  const banknotesTotal = data.banknotesTotal ?? calculatedBanknotes;
  const coinsTotal = data.coinsTotal ?? calculatedCoins;
  const drawerCash = banknotesTotal + coinsTotal;

  const openingCash = data.openingCashTotal ?? safeNum(shift.opening_cash ?? 200);
  const expectedCash = data.totalExpectedCash ?? safeNum(shift.expected_cash ?? 0);
  const countedCash = data.totalCountedCash ?? safeNum(shift.counted_cash ?? drawerCash);
  const discrepancy = data.discrepancy ?? (countedCash - expectedCash);

  const handlePrint = () => {
    document.body.classList.add('printing-receipt');
    window.print();
  };

  // Drop the print-isolation class once the print dialog closes (printed or
  // cancelled) so the app looks normal again.
  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-receipt');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // Close modal on Escape key press
  useEffect(() => {
    if (!isOpen || isInline) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isInline, onClose]);

  const receiptContent = (
    <div className="receipt-print-wrapper bg-white text-black text-[11px] font-mono leading-tight p-4 sm:p-5 max-w-[340px] mx-auto border border-dashed border-slate-300 sm:rounded-lg shadow-sm print:border-none print:shadow-none print:p-0 print:max-w-full">
      {/* RECEIPT HEADER */}
      <div className="text-center space-y-1 pb-2">
        <div className="font-black text-sm uppercase tracking-wider">
          {toGreekUpper(storeName)}
        </div>
        <div className="text-[10px] text-slate-700 print:text-black">
          ΠΡΑΚΤΟΡΕΙΟ ΟΠΑΠ • ΚΩΔ. {storeCode}
        </div>
        <div className="text-[10px] text-slate-700 print:text-black">
          ΤΑΜΕΙΟ: {registerId} • ΒΑΡΔΙΑ: {shiftTypeDisplay()}
        </div>
        <div className="text-[10px] font-semibold text-slate-800 print:text-black">
          ΧΕΙΡΙΣΤΗΣ: {toGreekUpper(cashierName)}
        </div>
        <div className="text-[9px] text-slate-500 print:text-black">
          ΕΝΑΡΞΗ: {formatDate(openedAt)}
        </div>
        <div className="text-[9px] text-slate-500 print:text-black">
          ΚΛΕΙΣΙΜΟ: {formatDate(closedAt)}
        </div>
      </div>

      <div className="receipt-hr my-2 border-t border-dashed border-slate-400 print:border-black" />

      {/* SECTION 1: ΠΩΛΗΣΕΙΣ & ΕΙΣΠΡΑΞΕΙΣ */}
      <div className="py-1">
        <div className="text-center font-bold text-[10px] uppercase tracking-wider py-0.5 bg-slate-100 print:bg-transparent text-slate-800 print:text-black">
          --- {toGreekUpper('Πωλησεις & Εισπραξεις')} ---
        </div>
        <div className="space-y-1 pt-1 text-[10.5px]">
          {/* Αριθμοπαιχνίδια */}
          <div className="flex justify-between items-center">
            <span>Αριθμοπαιχνίδια (Gross):</span>
            <span className="font-bold">{formatCurrency(safeNum(data.arithmoGross ?? shift.arithmo_gross ?? shift.number_games_sales))}</span>
          </div>
          {(safeNum(data.arithmoCancels ?? shift.arithmo_cancels) > 0) && (
            <div className="flex justify-between items-center text-slate-600 print:text-black pl-2">
              <span>- Ακυρώσεις:</span>
              <span>-{formatCurrency(safeNum(data.arithmoCancels ?? shift.arithmo_cancels))}</span>
            </div>
          )}
          {(safeNum(data.arithmoPayouts ?? shift.arithmo_payouts ?? shift.number_games_payouts) > 0) && (
            <div className="flex justify-between items-center text-slate-600 print:text-black pl-2">
              <span>- Πληρωμές Κερδών:</span>
              <span>-{formatCurrency(safeNum(data.arithmoPayouts ?? shift.arithmo_payouts ?? shift.number_games_payouts))}</span>
            </div>
          )}
          {(safeNum(data.arithmoVouchers ?? shift.arithmo_vouchers) !== 0) && (
            <div className="flex justify-between items-center text-slate-600 print:text-black pl-2">
              <span>± Vouchers ΟΠΑΠ:</span>
              <span>{formatCurrency(safeNum(data.arithmoVouchers ?? shift.arithmo_vouchers))}</span>
            </div>
          )}

          {/* VLTs */}
          <div className="flex justify-between items-center pt-0.5">
            <span>PLAY VLTs (In):</span>
            <span className="font-bold">{formatCurrency(safeNum(data.vltsIn ?? shift.vlts_cash_in))}</span>
          </div>
          {(safeNum(data.vltsOut ?? shift.vlts_cash_out) !== 0) && (
            <div className="flex justify-between items-center text-slate-600 print:text-black pl-2">
              <span>- VLTs Ροή / Out:</span>
              <span>{formatCurrency(safeNum(data.vltsOut ?? shift.vlts_cash_out))}</span>
            </div>
          )}

          {/* Σκρατς & Λαχεία */}
          <div className="flex justify-between items-center pt-0.5">
            <span>Σκρατς / Λαχεία:</span>
            <span className="font-bold">{formatCurrency(safeNum(data.scratchSales ?? shift.scratch_sales ?? shift.scratch_lotto_sales))}</span>
          </div>
          {(safeNum(data.scratchPayouts ?? shift.scratch_payouts) > 0) && (
            <div className="flex justify-between items-center text-slate-600 print:text-black pl-2">
              <span>- Εξαργυρώσεις Σκρατς:</span>
              <span>-{formatCurrency(safeNum(data.scratchPayouts ?? shift.scratch_payouts))}</span>
            </div>
          )}

          {/* Pame Stoixima & Clever Point */}
          {(safeNum(data.pameStoiximaBalance ?? shift.pame_stoixima_balance) !== 0) && (
            <div className="flex justify-between items-center pt-0.5">
              <span>Pame Stoixima / Virtuals:</span>
              <span>{formatCurrency(safeNum(data.pameStoiximaBalance ?? shift.pame_stoixima_balance))}</span>
            </div>
          )}
          {(safeNum(data.cleverPointTotal ?? shift.clever_point_total) !== 0) && (
            <div className="flex justify-between items-center">
              <span>Clever Point:</span>
              <span>{formatCurrency(safeNum(data.cleverPointTotal ?? shift.clever_point_total))}</span>
            </div>
          )}
          {(safeNum(data.ippodromosBalance ?? shift.ippodromos_balance) !== 0) && (
            <div className="flex justify-between items-center">
              <span>Ιππόδρομος:</span>
              <span>{formatCurrency(safeNum(data.ippodromosBalance ?? shift.ippodromos_balance))}</span>
            </div>
          )}

          {/* FnB */}
          {((data.fnbCash || shift.fnb_cash || data.fnbCard || shift.fnb_card || data.fnbTotal || shift.fnb_sales) ? (
            <div className="flex justify-between items-center pt-0.5">
              <span>FnB (Μετρητά + POS):</span>
              <span className="font-bold">
                {formatCurrency(roundCurrency(
                  safeNum(data.fnbCash ?? shift.fnb_cash) +
                  safeNum(data.fnbCard ?? shift.fnb_card) ||
                  safeNum(data.fnbTotal ?? shift.fnb_sales)
                ))}
              </span>
            </div>
          ) : null)}
        </div>
      </div>

      <div className="receipt-hr my-2 border-t border-dashed border-slate-400 print:border-black" />

      {/* SECTION 2: ΕΞΟΔΑ & ΠΛΗΡΩΜΕΣ ΜΕΤΡΗΤΩΝ */}
      <div className="py-1">
        <div className="text-center font-bold text-[10px] uppercase tracking-wider py-0.5 bg-slate-100 print:bg-transparent text-slate-800 print:text-black">
          --- {toGreekUpper('Εξοδα & Πληρωμες')} ---
        </div>
        <div className="space-y-1 pt-1 text-[10.5px]">
          <div className="flex justify-between items-center">
            <span>Έξοδα ΓΠ (Μετρητά):</span>
            <span className="font-bold">
              {formatCurrency(safeNum(data.expensesGpCash ?? shift.opap_expenses ?? (shift.expenses_paid_cash ? shift.expenses_paid_cash : 0)))}
            </span>
          </div>
          {(safeNum(data.expensesFnbCash ?? shift.fnb_expenses) > 0) && (
            <div className="flex justify-between items-center">
              <span>Έξοδα FnB (Μετρητά):</span>
              <span className="font-bold">{formatCurrency(safeNum(data.expensesFnbCash ?? shift.fnb_expenses))}</span>
            </div>
          )}

          {/* Itemized Expenses list if available */}
          {Array.isArray(data.expensesList) && data.expensesList.length > 0 && (
            <div className="pt-1 pl-2 border-l border-slate-300 print:border-black my-1 space-y-0.5 text-[9.5px]">
              {data.expensesList.map((exp, idx) => (
                <div key={exp.id || idx} className="flex justify-between items-start gap-2">
                  <span className="break-words">{exp.recipient || exp.notes || exp.category || 'Έξοδο'}:</span>
                  <span className="font-mono shrink-0">{formatCurrency(safeNum(exp.amount))}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center font-bold pt-0.5 border-t border-dotted border-slate-300 print:border-black">
            <span>Σύνολο Εξόδων Μετρητών:</span>
            <span>
              {formatCurrency(safeNum(
                data.expensesTotalCash ??
                (safeNum(data.expensesGpCash) + safeNum(data.expensesFnbCash) || shift.expenses_paid_cash || 0)
              ))}
            </span>
          </div>
        </div>
      </div>

      <div className="receipt-hr my-2 border-t border-dashed border-slate-400 print:border-black" />

      {/* SECTION 3: ΚΑΤΑΜΕΤΡΗΣΗ ΤΑΜΕΙΟΥ & ΧΑΡΤΟΝΟΜΙΣΜΑΤΑ */}
      <div className="py-1">
        <div className="text-center font-bold text-[10px] uppercase tracking-wider py-0.5 bg-slate-100 print:bg-transparent text-slate-800 print:text-black">
          --- {toGreekUpper('Καταμετρηση Μετρητων')} ---
        </div>
        
        {/* Banknotes Subtable */}
        <div className="pt-1">
          <div className="text-[9.5px] font-bold text-slate-700 print:text-black border-b border-dotted border-slate-300 print:border-black pb-0.5 flex justify-between">
            <span>Χαρτονόμισμα</span>
            <span>Ποσότητα</span>
            <span className="text-right">Σύνολο</span>
          </div>
          <div className="space-y-0.5 pt-0.5 text-[10px]">
            {banknoteList.map((b) => {
              const qty = getDenomQty(b.key);
              if (qty === 0) return null;
              return (
                <div key={b.key} className="flex justify-between items-center">
                  <span className="w-12">{b.label}</span>
                  <span className="text-center flex-1">x {qty}</span>
                  <span className="w-16 text-right font-bold">{formatCurrency(qty * b.val)}</span>
                </div>
              );
            })}
            <div className="flex justify-between items-center font-bold text-[10px] pt-0.5 border-t border-dotted border-slate-300 print:border-black">
              <span>Σύνολο Χαρτονομισμάτων:</span>
              <span>{formatCurrency(banknotesTotal)}</span>
            </div>
          </div>
        </div>

        {/* Coins Subtable */}
        <div className="pt-2">
          <div className="text-[9.5px] font-bold text-slate-700 print:text-black border-b border-dotted border-slate-300 print:border-black pb-0.5 flex justify-between">
            <span>Κέρμα</span>
            <span>Ποσότητα</span>
            <span className="text-right">Σύνολο</span>
          </div>
          <div className="space-y-0.5 pt-0.5 text-[10px]">
            {coinList.map((c) => {
              const qty = getDenomQty(c.key, c.altKey);
              if (qty === 0) return null;
              return (
                <div key={c.key} className="flex justify-between items-center">
                  <span className="w-12">{c.label}</span>
                  <span className="text-center flex-1">x {qty}</span>
                  <span className="w-16 text-right font-bold">{formatCurrency(qty * c.val)}</span>
                </div>
              );
            })}
            <div className="flex justify-between items-center font-bold text-[10px] pt-0.5 border-t border-dotted border-slate-300 print:border-black">
              <span>Σύνολο Κερμάτων:</span>
              <span>{formatCurrency(coinsTotal)}</span>
            </div>
          </div>
        </div>

        {/* Other Elements in Cash Register */}
        <div className="mt-2 pt-1 border-t border-dotted border-slate-400 print:border-black space-y-1 text-[10.5px]">
          <div className="flex justify-between items-center font-bold">
            <span>Φυσικά Μετρητά Συρταριού:</span>
            <span>{formatCurrency(drawerCash)}</span>
          </div>
          {(safeNum(data.safeDrop ?? shift.bank_deposits ?? shift.safe_drop) > 0) && (
            <div className="flex justify-between items-center">
              <span>Χρηματοκιβώτιο (Safe Drop):</span>
              <span className="font-bold">{formatCurrency(safeNum(data.safeDrop ?? shift.bank_deposits ?? shift.safe_drop))}</span>
            </div>
          )}
          {(safeNum(data.totalStorePos ?? shift.card_payments) > 0) && (
            <div className="flex justify-between items-center">
              <span>POS Καρτών (Store POS):</span>
              <span className="font-bold">{formatCurrency(safeNum(data.totalStorePos ?? shift.card_payments))}</span>
            </div>
          )}
          {(safeNum(data.totalToraPos ?? (safeNum(shift.tora_pos1) + safeNum(shift.tora_pos2))) > 0) && (
            <div className="flex justify-between items-center">
              <span>TORA Direct POS:</span>
              <span className="font-bold">{formatCurrency(safeNum(data.totalToraPos ?? (safeNum(shift.tora_pos1) + safeNum(shift.tora_pos2))))}</span>
            </div>
          )}
          {(safeNum(data.creditGranted ?? shift.customer_credit_granted) > 0) && (
            <div className="flex justify-between items-center">
              <span>Πιστώσεις Πελατών:</span>
              <span>+{formatCurrency(safeNum(data.creditGranted ?? shift.customer_credit_granted))}</span>
            </div>
          )}
          {(safeNum(data.creditCollected ?? shift.customer_credit_collected ?? shift.customer_returns) > 0) && (
            <div className="flex justify-between items-center">
              <span>Επιστροφές Πιστώσεων:</span>
              <span>-{formatCurrency(safeNum(data.creditCollected ?? shift.customer_credit_collected ?? shift.customer_returns))}</span>
            </div>
          )}
        </div>
      </div>

      <div className="receipt-hr-double my-2 border-t-2 border-slate-900 print:border-black" />

      {/* SECTION 4: ΤΑΜΕΙΑΚΟ ΙΣΟΖΥΓΙΟ & ΑΠΟΚΛΙΣΗ */}
      <div className="py-1 space-y-1 text-[11px]">
        <div className="flex justify-between items-center">
          <span>Αρχικό Ταμείο (Float):</span>
          <span className="font-bold">{formatCurrency(openingCash)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Αναμενόμενο Ταμείο:</span>
          <span className="font-bold">{formatCurrency(expectedCash)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Καταμετρημένο Ταμείο:</span>
          <span className="font-bold">{formatCurrency(countedCash)}</span>
        </div>

        <div className="border-t border-black my-1.5" />

        {/* Discrepancy Highlight */}
        <div className="p-2 border border-black rounded text-center space-y-0.5">
          <div className="text-[10px] font-bold uppercase tracking-wider">
            {toGreekUpper('Διαφορα Ταμειου (Αποκλιση)')}
          </div>
          <div className="text-sm font-black">
            {formatCurrency(discrepancy, { showSign: true })}
          </div>
          <div className="text-[9px] font-bold uppercase">
            {discrepancy === 0
              ? '✓ ΤΑΜΕΙΟ ΙΣΟΣΚΕΛΙΣΜΕΝΟ'
              : discrepancy > 0
              ? '▲ ΠΛΕΟΝΑΣΜΑ ΤΑΜΕΙΟΥ'
              : '▼ ΕΛΛΕΙΜΜΑ ΤΑΜΕΙΟΥ'}
          </div>
        </div>
      </div>

      {/* SECTION 5: ΣΗΜΕΙΩΣΕΙΣ & ΥΠΟΓΡΑΦΕΣ */}
      {(data.employeeNotes || shift.employee_notes) && (
        <div className="pt-2 text-[10px]">
          <span className="font-bold">Σημειώσεις: </span>
          <span className="italic">{data.employeeNotes || shift.employee_notes}</span>
        </div>
      )}

      <div className="pt-4 pb-2 space-y-5 text-[10px]">
        <div className="flex justify-between items-end pt-2">
          <div className="text-center w-36">
            <div className="border-b border-black w-full mb-1"></div>
            <span className="font-bold">Υπογραφή Υπαλλήλου</span>
          </div>
          <div className="text-center w-36">
            <div className="border-b border-black w-full mb-1"></div>
            <span className="font-bold">Υπογραφή Υπευθύνου</span>
          </div>
        </div>

        <div className="text-center text-[8.5px] text-slate-500 print:text-black pt-2">
          *** SHIFTLEDGER POS SYSTEM • {new Date().toLocaleString('el-GR')} ***
        </div>
      </div>
    </div>
  );

  // If inline inside Step 5 or a review container
  if (isInline) {
    return (
      <div className="w-full space-y-3">
        <div className="flex items-center justify-between no-print bg-slate-100 p-3 rounded-xl border border-slate-200">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-800">
              Προεπισκόπηση Εκτύπωσης Φυσικής Απόδειξης
            </span>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Εκτύπωση Απόδειξης</span>
          </button>
        </div>
        <div className="flex justify-center bg-slate-50 p-2 sm:p-4 rounded-2xl border border-slate-200 overflow-x-auto">
          {receiptContent}
        </div>
      </div>
    );
  }

  // Modal mode
  if (!isOpen) return null;

  return (
    <div
      id="receipt-preview-modal-backdrop"
      className="print-container-root fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto no-print:flex print:block print:p-0 print:bg-white print:static animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col max-h-[95vh] print:max-w-full print:border-none print:shadow-none print:rounded-none relative">
        {/* Modal Top Bar - Hidden during print */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between no-print shrink-0 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-black text-white">Προεπισκόπηση Τελικής Απόδειξης</h4>
              <p className="text-[10px] text-slate-300">Format εκτυπωτή αποδείξεων (Thermal 80mm / A4)</p>
            </div>
          </div>
          {/* Prominent Close X Button */}
          <button
            type="button"
            id="close-receipt-preview-modal"
            onClick={onClose}
            aria-label="Κλείσιμο Προεπισκόπησης"
            title="Κλείσιμο (X)"
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-slate-700"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-slate-100 flex-1 flex justify-center print:bg-white print:p-0">
          {receiptContent}
        </div>

        {/* Modal Bottom Actions - Hidden during print */}
        <div className="bg-white px-5 py-3.5 border-t border-slate-200 flex items-center justify-between no-print shrink-0">
          <button
            type="button"
            id="btn-close-receipt-footer"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer flex items-center space-x-1.5"
          >
            <X className="w-3.5 h-3.5 text-slate-500" />
            <span>Κλείσιμο</span>
          </button>
          <button
            type="button"
            id="btn-print-receipt-action"
            onClick={handlePrint}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center space-x-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Εκτύπωση (Print Receipt)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
