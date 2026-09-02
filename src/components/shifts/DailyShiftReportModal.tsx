import React from 'react';
import { X, Layers, Calendar, Printer, FileSpreadsheet } from 'lucide-react';
import { Shift } from '../../types/index.ts';
import { DailyAggregationView } from './DailyAggregationView.tsx';

interface DailyShiftReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  shifts: Shift[];
  stores: Array<{ id: string; name: string; code?: string }>;
  currentStoreId?: string;
  onOpenShiftDetails?: (shift: Shift) => void;
}

export const DailyShiftReportModal: React.FC<DailyShiftReportModalProps> = ({
  isOpen,
  onClose,
  shifts,
  stores,
  currentStoreId,
  onOpenShiftDetails,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-slate-50 rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl my-auto overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Ημερήσιο Συγκεντρωτικό Δελτίο Βαρδιών
              </h3>
              <p className="text-xs text-slate-500">
                Αυτόματος υπολογισμός ημερήσιου τζίρου & ταμειακής συμφωνίας (Anti-Double-Counting).
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          <DailyAggregationView
            shifts={shifts}
            stores={stores}
            currentStoreId={currentStoreId}
            onOpenShiftDetails={(s) => {
              onClose();
              onOpenShiftDetails?.(s);
            }}
          />
        </div>

        {/* Footer */}
        <div className="bg-white px-6 py-3.5 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 font-medium">
            ShiftLedger Reporting Engine • Καταμέτρηση χωρίς διπλοχρεώσεις
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Κλείσιμο
          </button>
        </div>
      </div>
    </div>
  );
};
