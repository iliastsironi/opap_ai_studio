import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, SkipForward } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters.ts';
import { toGreekUpper } from '../../lib/greekTypography.ts';
import { NumericField } from '../ui/NumericField.tsx';
import {
  InspectionLine, lineFinding, summariseInspection,
} from '../../lib/shiftInspection.ts';

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
export const ShiftInspectionPanel: React.FC<{
  previousOperatorName: string;
  lines: InspectionLine[];
  onChangeFound: (key: string, found: number) => void;
  onSkip: () => void;
  disabled?: boolean;
  skipped?: boolean;
}> = ({ previousOperatorName, lines, onChangeFound, onSkip, disabled = false, skipped = false }) => {
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
      hint: 'Στα σκρατς ελέγχετε τον αύξοντα αριθμό, στα λαχεία το πλήθος που παραλαμβάνετε.',
    },
  ];

  if (skipped) {
    return (
      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-2.5">
        <SkipForward className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block">{toGreekUpper('Η Επιθεωρηση Προσπεραστηκε')}</span>
          <span className="text-micro font-medium block mt-0.5">
            Αποδέχεστε το ταμείο και τα λαχεία όπως τα παρέδωσε ο/η{' '}
            {previousOperatorName}. Τυχόν διαφορά που βρεθεί αργότερα δεν θα χρεωθεί
            σε εκείνον/εκείνη.
          </span>
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
                        {isMoney ? formatCurrency(line.expected) : line.expected}
                        {!isMoney && line.unitPrice ? ` · ${formatCurrency(line.unitPrice)}/τεμ.` : ''}
                      </span>
                    </div>

                    {/* Prefilled with what the night declared, so the
                        operator changes only what differs - which is how the
                        Owner described it: «αν δε βρει 1000 θα βρει 995». A
                        blank field would make every line a chore and an
                        untouched one ambiguous. */}
                    <div className="w-28">
                      <NumericField
                        value={line.found ?? line.expected}
                        onChange={(next) => onChangeFound(line.key, next)}
                        decimals={isMoney ? 2 : 0}
                        min={0}
                        disabled={disabled}
                        aria-label={`Βρήκα — ${line.label}`}
                      />
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
