import React, { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';

/**
 * Κάμερα ως σαρωτής.
 *
 * Η βιβλιοθήκη ανάγνωσης (zxing) φορτώνεται ΜΟΝΟ όταν ανοίξει αυτό το
 * παράθυρο, με δυναμικό import: κανείς που δεν χρησιμοποιεί κάμερα δεν
 * πληρώνει το βάρος της σε κάθε άνοιγμα της εφαρμογής.
 *
 * Δεν αποφασίζει τι σημαίνει ένα σκανάρισμα: το δίνει όπως το διάβασε στον
 * καλούντα (`onDetected`) και δείχνει την απάντησή του. Η κάμερα διαβάζει το
 * ίδιο barcode ξανά και ξανά όσο μένει μπροστά της, οπότε το ίδιο κείμενο
 * μέσα σε λίγα δευτερόλεπτα αγνοείται εδώ - όχι ως «διπλό πακέτο», γιατί
 * αυτό το ξέρει η λίστα.
 */

export interface CameraFeedback {
  ok: boolean;
  message: string;
}

interface Props {
  onClose: () => void;
  /** Καλείται με το κείμενο που διαβάστηκε· επιστρέφει τι να δείξει το παράθυρο. */
  onDetected: (text: string) => CameraFeedback;
}

/** Το ίδιο barcode μέσα σε αυτό το διάστημα είναι το ίδιο σκανάρισμα. */
const SAME_READING_MS = 2500;

function describeCameraError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Δεν δόθηκε άδεια για την κάμερα. Επιτρέψτε την από τη γραμμή διευθύνσεων του προγράμματος περιήγησης και ανοίξτε ξανά.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Δεν βρέθηκε κάμερα σε αυτή τη συσκευή.';
  }
  if (name === 'NotReadableError') {
    return 'Η κάμερα χρησιμοποιείται από άλλη εφαρμογή. Κλείστε την και ξαναδοκιμάστε.';
  }
  return 'Η κάμερα δεν μπόρεσε να ανοίξει. Μπορείτε να σκανάρετε με σαρωτή ή να γράψετε τον κωδικό.';
}

export const BarcodeCameraModal: React.FC<Props> = ({ onClose, onDetected }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [feedback, setFeedback] = useState<CameraFeedback | null>(null);
  // Ο καλών αλλάζει σε κάθε σκανάρισμα (η λίστα μεγαλώνει)· το παράθυρο
  // πρέπει να καλεί πάντα την τελευταία του εκδοχή χωρίς να ξαναρχίζει την
  // κάμερα κάθε φορά.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    let last: { text: string; at: number } | null = null;

    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (cancelled || !videoRef.current) return;

        // Γραμμικά barcode μόνο: αυτό που τυπώνεται κάτω από το δελτίο. Το
        // τετράγωνο πάνω δεξιά είναι ο κωδικός επαλήθευσης του εισιτηρίου και
        // δεν είναι αυτό που ζητάμε.
        const hints = new Map<any, any>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.ITF,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.EAN_13,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (!result || cancelled) return;
            const text = result.getText();
            const now = Date.now();
            if (last && last.text === text && now - last.at < SAME_READING_MS) return;
            last = { text, at: now };
            setFeedback(onDetectedRef.current(text));
          }
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
        setStarting(false);
      } catch (err) {
        if (!cancelled) {
          setError(describeCameraError(err));
          setStarting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <Modal
      isOpen
      onClose={onClose}
      headerStyle="bordered"
      icon={Camera}
      title="Σάρωση με κάμερα"
      size="md"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
        >
          Τέλος
        </button>
      }
    >
      <div className="space-y-3">
        {error ? (
          <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : (
          <>
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/80">
                  Άνοιγμα κάμερας…
                </div>
              )}
            </div>
            <p className="text-micro text-slate-500">
              Στοχεύστε το <strong>μακρόστενο</strong> barcode κάτω από το εισιτήριο (όχι το
              τετράγωνο). Κάθε πακέτο μπαίνει στη λίστα· συνεχίστε με το επόμενο χωρίς να κλείσετε.
            </p>
          </>
        )}
        {feedback && (
          <p
            role="status"
            className={`text-xs font-bold rounded-lg px-3 py-2 border ${
              feedback.ok
                ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                : 'text-amber-800 bg-amber-50 border-amber-200'
            }`}
          >
            {feedback.ok ? '✓ ' : ''}
            {feedback.message}
          </p>
        )}
      </div>
    </Modal>
  );
};
