import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, SkipForward } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { NumericField } from '../ui/NumericField.tsx';
import {
  InspectionLine, lineFinding, summariseInspection, inspectionHandover,
} from '../../lib/shiftInspection.ts';
import {
  formatQuantity, looseOf, quantityView, toPieces, unitsOf,
} from '../../lib/lotteryQuantityView.ts';
import type { LegacyUnitSettings } from '../../lib/lotteryUnits.ts';

/**
 * Η επιθεώρηση παράδοσης, on the morning shift's opening screen.
 *
 * Three sections in the order the Owner described: the cash float, the coins,
 * then the tickets - σκρατς by ascending serial and λαχεία by remaining count.
 * Each line shows what the night declared, takes what the morning actually
 * found, and prices the difference.
 *
 * «Expected» is not invented here: it is the figure the opening screen is
 * about to write into this shift. If the operator corrects it, the correction
 * is what the shift opens on - otherwise they would be measured against money
 * that is not in the drawer.
 *
 * Skipping is a first-class choice, not a hidden one, because the Owner made
 * it one: the button says what it costs the person pressing it.
 */
/**
 * Τα παραδοτέα, σε μεγάλα γράμματα.
 *
 * Ο πίνακας έδειχνε γραμμή-γραμμή τι δηλώθηκε και κανένα σύνολο, οπότε για
 * να μάθει κανείς τι παραλαμβάνει έπρεπε να προσθέσει στο μυαλό του πριν
 * καν αρχίσει να μετράει. Μπαίνει σε δύο σημεία επίτηδες: πάνω από τον
 * πίνακα όταν κάνεις την επιθεώρηση, και μέσα στο πλαίσιο όταν την
 * προσπεράσεις - γιατί αν την προσπεράσεις, τα νούμερα αυτά είναι ΑΚΡΙΒΩΣ
 * ό,τι μόλις αποδέχτηκες, και ήταν το μόνο σημείο που δεν τα έλεγε.
 *
 * Χαρτονομίσματα και κέρματα χωριστά - δες lib/shiftInspection.ts για το
 * γιατί τα σκρατς μετρούν γραμμές και όχι αξία.
 */
export const InspectionHandoverSummary: React.FC<{
  lines: InspectionLine[];
  tone?: 'indigo' | 'amber';
}> = ({ lines, tone = 'indigo' }) => {
  const h = useMemo(() => inspectionHandover(lines), [lines]);
  const frame = tone === 'amber'
    ? 'bg-amber-100/60 border-amber-300'
    : 'bg-white/80 border-indigo-200';

  return (
    <div className={`rounded-xl border p-2.5 ${frame}`}>
      <span className="text-micro font-black uppercase tracking-wider text-slate-500 block mb-1.5">
        Παραλαμβάνετε
      </span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-micro text-slate-500 block">Χαρτονομίσματα</span>
          <span className="text-lg font-black font-mono text-slate-900 block leading-tight">
            {formatCurrency(h.notes)}
          </span>
        </div>
        <div>
          <span className="text-micro text-slate-500 block">Κέρματα</span>
          <span className="text-lg font-black font-mono text-slate-900 block leading-tight">
            {formatCurrency(h.coins)}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-slate-300/70">
        <span className="text-micro font-black uppercase tracking-wider text-slate-600">
          Σύνολο μετρητών
        </span>
        <span className="text-sm font-black font-mono text-slate-900">
          {formatCurrency(h.money)}
        </span>
      </div>
      {h.ticketLines > 0 && (
        <p className="text-micro text-slate-600 mt-1.5 font-medium">
          {/* Τα λαχεία έχουν αξία γιατί το νούμερό τους είναι απόθεμα· τα
              σκρατς μόνο γραμμές, γιατί το δικό τους είναι θέση σε πακέτο. */}
          {h.lotteryLines > 0 && (
            <>
              {/* ΟΧΙ άθροισμα μονάδων. Το 200 του Λαϊκού είναι κομμάτια και
                  το 80 του Εθνικού πεντάδες· προστιθέμενα έδιναν «280
                  τεμάχια», έναν αριθμό που δεν μετράει τίποτα - ακριβώς το
                  μπέρδεμα που φτιάχνουμε παρακάτω γραμμή-γραμμή. Η αξία
                  προστίθεται σωστά, γιατί κάθε γραμμή πολλαπλασιάζεται με τη
                  δική της τιμή. */}
              Λαχεία: <strong className="font-mono">{h.lotteryLines}</strong>{' '}
              {h.lotteryLines === 1 ? 'γραμμή' : 'γραμμές'}
              (<strong className="font-mono">{formatCurrency(h.lotteryValue)}</strong>)
              {h.scratchLines > 0 ? ' · ' : ''}
            </>
          )}
          {h.scratchLines > 0 && (
            <>
              Σκρατς: <strong className="font-mono">{h.scratchLines}</strong>{' '}
              {h.scratchLines === 1 ? 'γραμμή' : 'γραμμές'} προς έλεγχο
            </>
          )}
        </p>
      )}
    </div>
  );
};

export const ShiftInspectionPanel: React.FC<{
  previousOperatorName: string;
  lines: InspectionLine[];
  onChangeFound: (key: string, found: number) => void;
  onSkip: () => void;
  disabled?: boolean;
  skipped?: boolean;
  /** Μετράει ο ίδιος που δούλεψε τη βάρδια που επιθεωρείται. */
  selfInspection?: boolean;
  /**
   * Σε τι μετράει το μαγαζί κάθε λαχείο (shift_templates.lottery_units).
   *
   * «Τα λαχεία να τα εμφανίζει σαν πεντάδες και όχι σαν κομμάτια, γιατί τα
   * βλέπουν και μπερδεύονται.» Η απάντηση υπήρχε ήδη δηλωμένη ανά παιχνίδι
   * και το ταμείο τη σέβεται· η επιθεώρηση δεν τη ρωτούσε ποτέ και έγραφε
   * κομμάτια. Ο αριθμός από κάτω δεν αλλάζει - μόνο αυτό που διαβάζεται.
   */
  lotteryUnits?: Record<string, unknown> | null;
  legacyUnits?: LegacyUnitSettings | null;
}> = ({
  previousOperatorName, lines, onChangeFound, onSkip,
  disabled = false, skipped = false, selfInspection = false,
  lotteryUnits, legacyUnits,
}) => {
  const summary = useMemo(() => summariseInspection(lines), [lines]);

  const sections: { kind: InspectionLine['kind'][]; title: string; hint: string }[] = [
    {
      kind: ['CASH'],
      title: '1. Αρχικό Κεφάλαιο (Χαρτονομίσματα)',
      hint: 'Προκαθορισμένο από τη Διαμόρφωση. Μετρήστε το και διορθώστε αν διαφέρει.',
    },
    {
      kind: ['COINS'],
      title: '2. Κέρματα',
      hint: 'Ό,τι έμεινε στο συρτάρι από το προηγούμενο βράδυ.',
    },
    {
      kind: ['SCRATCH', 'LOTTERY'],
      title: '3. Σκρατς & Λαχεία',
      hint: 'Στα σκρατς ελέγχετε τον αύξοντα αριθμό, στα λαχεία το πλήθος που παραλαμβάνετε — στη μονάδα που μετράει το μαγαζί.',
    },
  ];

  if (skipped) {
    return (
      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-2.5">
        <SkipForward className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <span className="font-bold block">{toGreekUpper('Η Επιθεωρηση Προσπεραστηκε')}</span>
          <span className="text-micro font-medium block mt-0.5">
            Αποδέχεστε το ταμείο και τα λαχεία όπως τα παρέδωσε ο/η{' '}
            {previousOperatorName}. Τυχόν διαφορά που βρεθεί αργότερα δεν θα χρεωθεί
            σε εκείνον/εκείνη.
          </span>
          {/* Ό,τι μόλις αποδέχτηκες, σε νούμερα. Χωρίς αυτό το μόνο που
              έβλεπε κανείς ήταν ότι «προσπεράστηκε». */}
          <div className="mt-2">
            <InspectionHandoverSummary lines={lines} tone="amber" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
      <div className="flex items-start gap-2.5">
        <ClipboardCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <span className="text-xs font-extrabold text-indigo-950 block">
            {toGreekUpper('Επιθεωρηση Παραδοσης')}
          </span>
          <span className="text-micro text-indigo-900/80 font-medium">
            Ελέγξτε τι παραλαμβάνετε από τον/την {previousOperatorName}. Ό,τι λείπει
            χρεώνεται σε εκείνον/εκείνη, ολόκληρο.
          </span>
        </div>
      </div>

      {selfInspection && (
        /* Η επιθεώρηση είναι καταμέτρηση, όχι έγκριση - οπότε επιτρέπεται.
           Αλλά δεν είναι ανεξάρτητος έλεγχος, και αυτό πρέπει να το ξέρει
           και όποιος τη διαβάσει αργότερα: καταγράφεται στην εγγραφή. */
        <p className="text-micro font-bold text-amber-900 bg-amber-100/70 border border-amber-200 rounded-lg px-3 py-2">
          Μετράτε βάρδια που δουλέψατε εσείς. Καταγράφεται ως αυτο-καταμέτρηση.
        </p>
      )}

      {/* Η προεπισκόπηση πριν τις γραμμές: πρώτα το μεγάλο νούμερο, μετά η
          δουλειά. */}
      <InspectionHandoverSummary lines={lines} />

      {sections.map((section) => {
        const sectionLines = lines.filter((l) => section.kind.includes(l.kind));
        if (sectionLines.length === 0) return null;

        return (
          <div key={section.title} className="space-y-2">
            <div>
              <span className="text-micro font-black text-slate-700 uppercase tracking-wider block">
                {section.title}
              </span>
              <span className="text-micro text-slate-500">{section.hint}</span>
            </div>

            <div className="space-y-1.5">
              {sectionLines.map((line) => {
                const finding = lineFinding(line);
                const isMoney = line.kind === 'CASH' || line.kind === 'COINS';
                // Η μονάδα που μετράει το μαγαζί. Στα χρήματα δεν ισχύει.
                const view = quantityView(
                  { id: line.rowId, bundleSize: line.bundleSize, price: line.unitPrice },
                  line.kind === 'LOTTERY',
                  lotteryUnits,
                  legacyUnits
                );
                // Ο αριθμός που βλέπει και γράφει ο χειριστής.
                const current = line.found ?? line.expected;
                const shown = view.size > 0 ? unitsOf(current, view) : current;
                // Το σπασμένο υπόλοιπο εμφανίζεται ΜΟΝΟ αν υπάρχει· αλλιώς
                // ένα «+ 0 κομμάτια» σε κάθε γραμμή μαθαίνει τον χειριστή να
                // μη διαβάζει τη γραμμή. Όταν υπάρχει, πρέπει να μπορεί να
                // γραφτεί: μια μετατροπή που το έκοβε θα χρέωνε δελτία που
                // είναι στο ράφι.
                const hasLoose = view.size > 0 && looseOf(line.expected, view) !== 0;
                const loose = view.size > 0 ? looseOf(current, view) : 0;
                return (
                  <div
                    key={line.key}
                    className={`grid grid-cols-[1fr_auto_auto] items-center gap-2 p-2 rounded-xl border ${
                      finding.shortfall > 0
                        ? 'bg-rose-50 border-rose-200'
                        : finding.corrected
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 block truncate">
                        {line.label}
                      </span>
                      <span className="text-micro text-slate-500 font-mono">
                        Δηλώθηκε:{' '}
                        {isMoney
                          ? formatCurrency(line.expected)
                          : formatQuantity(line.expected, view, false)}
                        {!isMoney && view.unitPrice
                          ? ` · ${formatCurrency(view.unitPrice)}/${view.nounSingular}`
                          : ''}
                      </span>
                    </div>

                    {/* Prefilled with what the night declared, so the
                        operator changes only what differs - which is how the
                        Owner described it: «αν δε βρει 1000 θα βρει 995». A
                        blank field would make every line a chore and an
                        untouched one ambiguous. */}
                    <div className={hasLoose ? 'w-36 flex items-center gap-1' : 'w-28'}>
                      <NumericField
                        value={shown}
                        onChange={(next) =>
                          onChangeFound(
                            line.key,
                            view.size > 0 ? toPieces(next, loose, view) : next
                          )
                        }
                        decimals={isMoney ? 2 : 0}
                        min={0}
                        disabled={disabled}
                        aria-label={`Βρήκα — ${line.label}${
                          isMoney ? '' : ` (${view.noun})`
                        }`}
                      />
                      {hasLoose && (
                        <>
                          <span className="text-micro text-slate-400 shrink-0">+</span>
                          <NumericField
                            value={loose}
                            onChange={(next) =>
                              onChangeFound(line.key, toPieces(unitsOf(current, view), next, view))
                            }
                            decimals={0}
                            min={0}
                            disabled={disabled}
                            aria-label={`Βρήκα — ${line.label} (κομμάτια)`}
                          />
                        </>
                      )}
                    </div>

                    <span
                      className={`text-xs font-mono font-black w-20 text-right ${
                        finding.shortfall > 0 ? 'text-rose-700' : 'text-slate-400'
                      }`}
                    >
                      {finding.shortfall > 0 ? `-${formatCurrency(finding.shortfall)}` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div
        className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${
          summary.shortfall > 0
            ? 'bg-rose-50 border-rose-300 text-rose-950'
            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}
      >
        {summary.shortfall > 0 ? (
          <>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Σύνολο που λείπει: <strong className="font-mono">{formatCurrency(summary.shortfall)}</strong>.
              Με την έναρξη της βάρδιας θα χρεωθεί στον/στην {previousOperatorName} και θα
              ειδοποιηθεί ο υπεύθυνος.
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {summary.correctedKeys.length > 0
                ? 'Οι διορθώσεις σας δεν δημιουργούν χρέωση — βρήκατε περισσότερα απ’ όσα δηλώθηκαν.'
                : 'Δεν βρέθηκε διαφορά.'}
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        className="w-full text-left p-2.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <SkipForward className="w-3.5 h-3.5" />
          Προσπέρασε την επιθεώρηση
        </span>
        <span className="text-micro text-slate-500 block mt-0.5">
          Δηλώνετε ότι τα παραλάβατε όπως δηλώθηκαν. Καταγράφεται στο όνομά σας και
          τυχόν διαφορά δεν θα χρεωθεί στην προηγούμενη βάρδια.
        </span>
      </button>
    </div>
  );
};

/**
 * The lines to inspect, from the figures the shift is about to open on and
 * the serials the night declared.
 *
 * «Expected» is deliberately the resolved opening float rather than the raw
 * configured one: that is the number the screen will write into the shift, so
 * it is the number the drawer has to match. Measuring against the configured
 * float while opening on something else would charge the night for a gap the
 * app created.
 *
 * The ticket lines take their direction from the row's own kind - σκρατς count
 * up through a pack, λαχεία count down as stock - and their expected value
 * from whichever end of the row carries the handover position.
 */
export function buildInspectionLines(
  resolvedFloat: { notes: number; coins: number },
  declaredScratchRows: any[]
): InspectionLine[] {
  const lines: InspectionLine[] = [
    {
      key: 'cash',
      label: 'Χαρτονομίσματα στο συρτάρι',
      kind: 'CASH',
      expected: Number(resolvedFloat.notes) || 0,
      found: null,
    },
    {
      key: 'coins',
      label: 'Κέρματα στο συρτάρι',
      kind: 'COINS',
      expected: Number(resolvedFloat.coins) || 0,
      found: null,
    },
  ];

  for (const row of declaredScratchRows ?? []) {
    // The handover position is the row's closing figure when it has one,
    // otherwise its opening - a pack nobody touched hands over where it
    // started.
    const closing = String(row?.endNo ?? '').trim();
    const opening = String(row?.startNo ?? '').trim();
    const position = closing !== '' ? closing : opening;
    if (position === '') continue;

    const expected = Number(position);
    if (!Number.isFinite(expected)) continue;

    lines.push({
      key: String(row?.id ?? row?.name ?? lines.length),
      label: String(row?.name ?? 'Παιχνίδι'),
      kind: isLotteryRowShape(row) ? 'LOTTERY' : 'SCRATCH',
      expected,
      found: null,
      unitPrice: Number(row?.price) || 0,
      // Μόνο για την εμφάνιση: ο αριθμός μένει σε κομμάτια.
      rowId: String(row?.id ?? ''),
      bundleSize: Number(row?.bundleSize) || 0,
    });
  }

  return lines;
}

/**
 * Lottery or scratch, without importing ScratchCalculatorTable.
 *
 * That module pulls in the whole counting table and its localStorage cache,
 * and the service layer already imports FROM it - bringing it in here as well
 * would close a cycle. The rule is the one the table itself applies: an
 * explicit `kind` wins, otherwise the category says it.
 */
function isLotteryRowShape(row: any): boolean {
  if (row?.kind === 'LOTTERY') return true;
  if (row?.kind === 'SCRATCH') return false;
  return String(row?.category ?? '').includes('Λαχ');
}

/**
 * The declared rows with the morning's corrections applied.
 *
 * A corrected serial is the real position of the pack, so it has to become
 * what the next shift opens on - otherwise the correction charges the night
 * operator and then throws the figure away, and the same ticket goes missing
 * again tomorrow.
 *
 * Writes the closing end of each row, because that is what
 * carryOverScratchInventory turns into the next shift's opening.
 */
export function applyInspectionToScratchRows(
  declaredRows: any[] | null,
  lines: InspectionLine[] | null
): any[] | null {
  if (!declaredRows || declaredRows.length === 0) return declaredRows;
  if (!lines || lines.length === 0) return declaredRows;

  const byKey = new Map(
    lines
      .filter((l) => l.kind === 'SCRATCH' || l.kind === 'LOTTERY')
      .map((l) => [l.key, l])
  );

  return declaredRows.map((row, index) => {
    const line = byKey.get(String(row?.id ?? row?.name ?? index));
    if (!line || line.found === null || line.found === undefined) return row;
    if (Number(line.found) === Number(line.expected)) return row;

    // The row's handover position lives in endNo when the shift recorded a
    // close, and in startNo when it never touched the pack. Correct whichever
    // one the carry-over will read.
    const hasClosing = String(row?.endNo ?? '').trim() !== '';
    const corrected = String(line.found);
    return hasClosing ? { ...row, endNo: corrected } : { ...row, startNo: corrected };
  });
}
