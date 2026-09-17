import React, { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Modal, ModalActions } from '../ui/Modal.tsx';
import { setEditionCancelDeadline } from '../../services/nationalLotteryService.ts';
import { NationalLotteryEdition } from '../../types/index.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  edition: NationalLotteryEdition;
  onSuccess: () => void;
}

// «Προθεσμία Ακύρωσης» - the deadline the daily reminder counts back from.
//
// Typed by the Owner rather than derived from the edition label: 0013 is
// explicit that a label ("2026-14") must never be treated as a date, so there
// is nothing in the schema to compute a draw time from. Leave it empty and this
// edition simply never produces a reminder.

// <input type="datetime-local"> speaks local wall-clock with no zone, which is
// what the person in the shop means. These two convert to and from the stored
// UTC instant so reopening the dialog shows back the hour that was typed.
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoOrNull(localValue: string): string | null {
  if (!localValue) return null;
  const d = new Date(localValue);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const NationalLotteryEditionDeadlineModal: React.FC<Props> = ({ isOpen, onClose, edition, onSuccess }) => {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(toLocalInputValue(edition.cancel_by));
      setError(null);
    }
  }, [isOpen, edition.cancel_by]);

  const save = async (next: string | null) => {
    setSaving(true);
    setError(null);
    try {
      await setEditionCancelDeadline(edition.id, next);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Η προθεσμία δεν αποθηκεύτηκε.');
    } finally {
      setSaving(false);
    }
  };

  const alreadySent = Boolean(edition.cancel_reminder_sent_at);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Προθεσμία Ακύρωσης Λαχείων"
      subtitle={`Έκδοση ${edition.label}`}
      icon={CalendarClock}
      size="sm"
      footer={
        <>
          {/* ModalActions covers only cancel/save, so the third action - clearing
              an existing deadline - sits beside it rather than inside it. */}
          {edition.cancel_by && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save(null)}
              className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer text-sm font-bold disabled:opacity-60 mr-auto"
            >
              Κατάργηση
            </button>
          )}
          <ModalActions
            onCancel={onClose}
            onSave={() => save(toIsoOrNull(value))}
            saveLabel="Αποθήκευση"
            isSaving={saving}
            savingLabel="Αποθήκευση..."
          />
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-600 leading-relaxed">
          Μία υπενθύμιση στέλνεται σε όλο το προσωπικό περίπου 24 ώρες πριν από την προθεσμία, για να ελεγχθούν και να
          ακυρωθούν τα απούλητα λαχεία. Αφήστε το κενό για να μην σταλεί υπενθύμιση.
        </p>

        <div>
          <label htmlFor="nl-cancel-by" className="text-micro font-bold text-slate-700 uppercase block mb-1">
            Ημερομηνία & Ώρα
          </label>
          <input
            id="nl-cancel-by"
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 bg-white focus:outline-hidden focus:border-indigo-500"
          />
        </div>

        {alreadySent && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
            Η υπενθύμιση για αυτή την προθεσμία έχει ήδη σταλεί. Αλλάζοντας την ημερομηνία θα σταλεί ξανά.
          </p>
        )}

        {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
};
