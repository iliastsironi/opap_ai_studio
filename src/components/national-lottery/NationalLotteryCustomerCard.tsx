import React, { useEffect, useState, useCallback } from 'react';
import { Phone, Hash, AlertTriangle, ExternalLink, Check, X, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters.ts';
import { fetchActiveShiftFromFirestore } from '../../services/shiftService.ts';
import {
  getCustomerEdition,
  getEditionDrawStatuses,
  getNationalLotteryDebtWarning,
  NationalLotteryDebtWarning,
  NATIONAL_LOTTERY_DISPLAY_PRICES,
} from '../../services/nationalLotteryService.ts';
import {
  NationalLotteryCustomer,
  NationalLotteryEdition,
  NationalLotteryCustomerEdition,
  NationalLotteryDrawStatus,
  NationalLotteryDrawCode,
  NATIONAL_LOTTERY_DRAW_CODES,
} from '../../types/index.ts';
import { NationalLotteryCollectionModal } from './NationalLotteryCollectionModal.tsx';
import { NationalLotteryCancelCollectionModal } from './NationalLotteryCancelCollectionModal.tsx';

const DRAW_LABELS: Record<NationalLotteryDrawCode, string> = { A: 'Α', B: 'Β', C: 'Γ', D: 'Δ', ST: 'ΣΤ' };

interface NationalLotteryCustomerCardProps {
  customer: NationalLotteryCustomer;
  edition: NationalLotteryEdition | null;
  orgId: string;
  storeId: string;
  actorUserId: string;
  canCollect: boolean;
  canReverse: boolean;
  onOpenTefteri: (searchQuery: string) => void;
}

export const NationalLotteryCustomerCard: React.FC<NationalLotteryCustomerCardProps> = ({
  customer,
  edition,
  orgId,
  storeId,
  actorUserId,
  canCollect,
  canReverse,
  onOpenTefteri,
}) => {
  const [customerEdition, setCustomerEdition] = useState<NationalLotteryCustomerEdition | null>(null);
  const [drawStatuses, setDrawStatuses] = useState<NationalLotteryDrawStatus[]>([]);
  const [debtWarning, setDebtWarning] = useState<NationalLotteryDebtWarning | null>(null);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDraws, setSelectedDraws] = useState<Set<NationalLotteryDrawCode>>(new Set());
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ batchId: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [ce, warning, shift] = await Promise.all([
        edition ? getCustomerEdition(customer.id, edition.id) : Promise.resolve(null),
        getNationalLotteryDebtWarning(customer.customer_id),
        fetchActiveShiftFromFirestore(orgId, storeId),
      ]);
      setCustomerEdition(ce);
      setDebtWarning(warning);
      setActiveShiftId(shift?.id || null);
      if (ce) {
        setDrawStatuses(await getEditionDrawStatuses(ce.id));
      } else {
        setDrawStatuses([]);
      }
    } catch (err: any) {
      setLoadError(err.message || 'Σφάλμα φόρτωσης στοιχείων συνδρομητή');
    } finally {
      setLoading(false);
    }
  }, [customer.id, customer.customer_id, edition, orgId, storeId]);

  useEffect(() => {
    setSelectedDraws(new Set());
    load();
  }, [load]);

  const toggleDraw = (code: NationalLotteryDrawCode) => {
    setSelectedDraws((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const unitPrice = NATIONAL_LOTTERY_DISPLAY_PRICES[customer.participation_type];
  const selectedTotal = selectedDraws.size * unitPrice;

  const handleCollectionSuccess = () => {
    setSelectedDraws(new Set());
    load();
  };

  const handleCancelClick = (status: NationalLotteryDrawStatus) => {
    if (!status.collection) return;
    const batchId = status.collection.batch_id;
    const siblings = drawStatuses.filter((s) => s.collection?.batch_id === batchId);
    const label =
      siblings.length > 1
        ? `${siblings.length} κληρώσεις (${siblings.map((s) => DRAW_LABELS[s.drawCode]).join(', ')})`
        : `Κλήρωση ${DRAW_LABELS[status.drawCode]}`;
    setCancelTarget({ batchId, label });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-6 text-sm text-rose-700">{loadError}</div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
      <div className="p-5 border-b border-slate-100 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900">{customer.full_name}</h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
              {customer.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {customer.phone}
                </span>
              )}
              {customer.lottery_number && (
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" /> {customer.lottery_number}
                </span>
              )}
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
            {customer.participation_type === 'FIVE' ? '5άδα' : '10άδα'}
          </span>
        </div>
        {edition && <p className="text-micro text-slate-400">Έκδοση {edition.label}</p>}
      </div>

      {debtWarning && (
        <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-rose-800">Υπάρχει οφειλή στο Τεφτέρι</p>
              <p className="text-micro text-rose-700 mt-0.5">
                Προηγούμενη έκδοση: {debtWarning.editionLabel} · Κληρώσεις: {debtWarning.drawCodes.map((c) => DRAW_LABELS[c]).join(', ')} · Υπόλοιπο: {formatCurrency(debtWarning.currentDebt)}
              </p>
              <button
                type="button"
                onClick={() => onOpenTefteri(customer.full_name)}
                className="mt-1.5 text-micro font-bold text-rose-700 hover:text-rose-900 flex items-center gap-1 cursor-pointer"
              >
                Άνοιγμα καρτέλας στο Τεφτέρι <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!edition && (
        <p className="p-5 text-sm text-slate-500">Δεν υπάρχει ενεργή έκδοση για αυτό το κατάστημα.</p>
      )}

      {edition && !customerEdition && (
        <p className="p-5 text-sm text-slate-500">Ο συνδρομητής δεν είναι εγγεγραμμένος στην τρέχουσα έκδοση.</p>
      )}

      {edition && customerEdition && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-5 gap-2">
            {NATIONAL_LOTTERY_DRAW_CODES.map((code) => {
              const status = drawStatuses.find((s) => s.drawCode === code)!;
              const isSelected = selectedDraws.has(code);
              if (status.received) {
                return (
                  <div
                    key={code}
                    className="relative flex flex-col items-center gap-1 p-2 rounded-xl border border-emerald-200 bg-emerald-50"
                  >
                    <span className="text-xs font-black text-emerald-700">{DRAW_LABELS[code]}</span>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-[9px] font-bold text-emerald-600 uppercase">Παραλήφθηκε</span>
                    {canReverse && (
                      <button
                        type="button"
                        onClick={() => handleCancelClick(status)}
                        aria-label={`Ακύρωση κλήρωσης ${DRAW_LABELS[code]}`}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-rose-300 text-rose-500 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={code}
                  type="button"
                  disabled={!canCollect}
                  onClick={() => toggleDraw(code)}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border cursor-pointer disabled:cursor-not-allowed transition-colors ${
                    isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  } ${!canCollect ? 'opacity-60' : ''}`}
                >
                  <span className="text-xs font-black text-slate-600">{DRAW_LABELS[code]}</span>
                  <span className="w-4 h-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                    {isSelected && <Check className="w-3 h-3 text-indigo-600" />}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Εκκρεμεί</span>
                </button>
              );
            })}
          </div>

          {canCollect && selectedDraws.size > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-600">
                {selectedDraws.size} {selectedDraws.size === 1 ? 'λαχείο' : 'λαχεία'} × {formatCurrency(unitPrice)} = <strong className="text-slate-900">{formatCurrency(selectedTotal)}</strong>
              </p>
              <button
                type="button"
                onClick={() => setShowCollectionModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer shrink-0"
              >
                Παραλαβή
              </button>
            </div>
          )}
        </div>
      )}

      {showCollectionModal && customerEdition && edition && (
        <NationalLotteryCollectionModal
          isOpen={showCollectionModal}
          onClose={() => setShowCollectionModal(false)}
          customer={customer}
          customerEdition={customerEdition}
          edition={edition}
          drawCodes={Array.from(selectedDraws)}
          orgId={orgId}
          storeId={storeId}
          shiftId={activeShiftId}
          actorUserId={actorUserId}
          onSuccess={handleCollectionSuccess}
        />
      )}

      {cancelTarget && (
        <NationalLotteryCancelCollectionModal
          isOpen={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          batchId={cancelTarget.batchId}
          drawLabel={cancelTarget.label}
          actorUserId={actorUserId}
          onSuccess={load}
        />
      )}
    </div>
  );
};
