import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { fetchShiftHandoverReceipts, HandoverReceipt } from '../../services/notificationService.ts';

export const HandoverReceipts: React.FC<{ shiftId: string }> = ({ shiftId }) => {
  const [receipts, setReceipts] = useState<HandoverReceipt[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchShiftHandoverReceipts(shiftId).then((rows) => {
      if (!cancelled) setReceipts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  if (receipts.length === 0) return null;

  const readCount = receipts.filter((r) => r.read_at).length;

  return (
    <div className="mt-2 space-y-1.5">
      <span className="text-xs font-bold text-slate-500">
        Το είδαν {readCount} από {receipts.length}
      </span>
      <ul className="flex flex-wrap gap-1.5">
        {receipts.map((r) => (
          <li
            key={r.recipient_user_id}
            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${
              r.read_at
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-slate-100 border-slate-200 text-slate-600'
            }`}
          >
            {r.read_at && <Check className="w-3 h-3" />}
            <span className="font-semibold">{r.recipient_name || 'Χρήστης'}</span>
            <span>
              ·{' '}
              {r.read_at
                ? new Date(r.read_at).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : 'Δεν το έχει δει'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
