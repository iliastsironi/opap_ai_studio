import React, { useState } from 'react';
import { AlertTriangle, Coffee, Minus, Store, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters.ts';
import { MonthlyPnlResult, PnlTotals, PnlWarning, costsOf, monthLabel, totalCosts } from '../../lib/pnlEngine.ts';
import { percentLabel } from './pnlDisplay.tsx';

const round2 = (value: number): number => Math.round(value * 100) / 100;

type NegativeCashWarning = Extract<PnlWarning, { kind: 'NEGATIVE_CASH_IN_HAND' }>;

function warningLines(warnings: PnlWarning[]): string[] {
  const lines: string[] = [];
  const negativeCash: NegativeCashWarning[] = [];
  for (const warning of warnings) {
    if (warning.kind === 'NO_COMMISSIONS') lines.push(`Δεν έχουν καταχωρηθεί προμήθειες για «${warning.storeName}».`);
    else negativeCash.push(warning);
  }
  if (negativeCash.length > 0) {
    const who = negativeCash.length === 1 ? '1 εργαζόμενος έχει' : `${negativeCash.length} εργαζόμενοι έχουν`;
    const names = negativeCash.map((warning) => warning.employeeName).join(', ');
    lines.push(`${who} αρνητικό «Χέρι» (τράπεζα και προκαταβολή ξεπερνούν το σύνολο μισθοδοσίας): ${names}. Ελέγξτε τη «Μισθοδοσία».`);
  }
  return lines;
}

interface DeltaProps {
  value: number;
  previous?: number;
  lowerIsBetter?: boolean;
  onDark?: boolean;
}

const Delta: React.FC<DeltaProps> = ({ value, previous, lowerIsBetter = false, onDark = false }) => {
  if (previous === undefined) return <span className={onDark ? 'text-slate-500' : 'text-slate-300'}>—</span>;
  const diff = round2(value - previous);
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <Minus className="w-3 h-3" />
        {formatCurrency(0)}
      </span>
    );
  }
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const color = good ? (onDark ? 'text-emerald-300' : 'text-emerald-600') : onDark ? 'text-rose-300' : 'text-rose-600';
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-bold whitespace-nowrap ${color}`}>
      <Icon className="w-3 h-3" />
      {formatCurrency(diff, { alwaysShowSign: true })}
    </span>
  );
};

const resultColor = (value: number): string => (value > 0 ? 'text-emerald-700' : value < 0 ? 'text-rose-700' : 'text-slate-500');

const margin = (net: number, revenue: number): number | null => (revenue > 0 ? net / revenue : null);

// Μία κερδοφορία, όπως διαβάζεται: τζίρος, έξοδα, καθαρό, περιθώριο.
interface SideTileProps {
  label: string;
  icon: typeof Store;
  totals: PnlTotals;
  /** Έξοδα πέρα από τα δικά της - του πρακτορείου μόνο. */
  extraCosts?: number;
  net: number;
  previousNet?: number;
  comparedTo: string;
}

const SideTile: React.FC<SideTileProps> = ({ label, icon: Icon, totals, extraCosts = 0, net, previousNet, comparedTo }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
    <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </p>
    <p className={`text-2xl font-black tabular-nums mt-1 ${resultColor(net)}`}>{formatCurrency(net)}</p>
    <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
      τζίρος {formatCurrency(totals.revenue)} · έξοδα {formatCurrency(round2(costsOf(totals) + extraCosts))} · περιθώριο{' '}
      {percentLabel(margin(net, totals.revenue))}
    </p>
    <p className="mt-2 text-xs flex flex-wrap items-center gap-x-2">
      <Delta value={net} previous={previousNet} />
      <span className="text-slate-500">{comparedTo}</span>
    </p>
  </div>
);

interface PnlSummaryProps {
  result: MonthlyPnlResult;
  previous: MonthlyPnlResult;
}

export const PnlSummary: React.FC<PnlSummaryProps> = ({ result, previous }) => {
  const [showInactive, setShowInactive] = useState(false);
  const activeUnits = result.units.filter((unit) => unit.hasActivity);
  const units = showInactive ? result.units : activeUnits;
  const hiddenCount = result.units.length - activeUnits.length;
  const agencyRows = units.filter((unit) => unit.unit === 'STORE');
  const fnbRows = units.filter((unit) => unit.unit === 'FNB');

  // A month with nothing entered is no baseline - every "change" would just repeat this month's figure.
  const hasPrevious = previous.units.some((unit) => unit.hasActivity) || previous.companyExpenses !== 0 || previous.loans !== 0;
  const prior = (value: number | undefined): number | undefined => (hasPrevious ? value : undefined);
  const previousLabel = monthLabel(previous.month);
  const comparedTo = hasPrevious ? `vs ${previousLabel}` : `vs ${previousLabel} · χωρίς καταχωρήσεις`;

  const netMargin = margin(result.netResult, result.storesTotal.revenue);
  const isEmpty = activeUnits.length === 0 && result.companyExpenses === 0 && result.loans === 0;
  const warnings = warningLines(result.warnings);
  const columns = 8;

  return (
    <div className="space-y-5">
      {/* Δύο επιχειρήσεις, δύο κερδοφορίες. Τον Αύγουστο το πρακτορείο έχασε
          16.552 € και ο καφές έβγαλε 3.512 €: το παλιό ενιαίο «τζίρος +
          συνολικά έξοδα» έδειχνε έναν μήνα, όχι δύο δουλειές. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {result.hasFnb ? (
          <>
            <SideTile
              label="Πρακτορείο"
              icon={Store}
              totals={result.agency}
              extraCosts={round2(result.companyExpenses + result.loans)}
              net={result.agencyNet}
              previousNet={prior(previous.agencyNet)}
              comparedTo={comparedTo}
            />
            <SideTile
              label="Καφέ (F&B)"
              icon={Coffee}
              totals={result.fnb}
              net={result.fnbNet}
              previousNet={prior(previous.fnbNet)}
              comparedTo={comparedTo}
            />
          </>
        ) : (
          [
            { label: 'Τζίρος (προμήθειες)', value: result.storesTotal.revenue, previous: prior(previous.storesTotal.revenue), lowerIsBetter: false },
            { label: 'Συνολικά έξοδα', value: totalCosts(result), previous: prior(totalCosts(previous)), lowerIsBetter: true },
          ].map((tile) => (
            <div key={tile.label} className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
              <p className="text-xs font-bold text-slate-500">{tile.label}</p>
              <p className="text-2xl font-black text-slate-900 tabular-nums mt-1">{formatCurrency(tile.value)}</p>
              <p className="mt-2 text-xs flex flex-wrap items-center gap-x-2">
                <Delta value={tile.value} previous={tile.previous} lowerIsBetter={tile.lowerIsBetter} />
                <span className="text-slate-500">{comparedTo}</span>
              </p>
            </div>
          ))
        )}
        <div className="bg-slate-900 rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-300">Καθαρό αποτέλεσμα προ φόρων</p>
          <p className={`text-2xl font-black tabular-nums mt-1 ${result.netResult < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
            {formatCurrency(result.netResult)}
          </p>
          {result.hasFnb && (
            <p className="mt-1.5 text-xs text-slate-400 tabular-nums">
              πρακτορείο {formatCurrency(result.agencyNet)} + καφέ {formatCurrency(result.fnbNet)}
            </p>
          )}
          <p className="mt-2 text-xs flex flex-wrap items-center gap-x-2">
            <Delta value={result.netResult} previous={prior(previous.netResult)} onDark />
            <span className="text-slate-500">{comparedTo}</span>
            <span className="text-slate-500">· Περιθώριο {percentLabel(netMargin)}</span>
          </p>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-extrabold text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Χρειάζονται έλεγχο
          </p>
          <ul className="mt-2 text-sm text-amber-900 space-y-1 list-disc pl-6">
            {warnings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-900 text-white text-xs">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Κατάστημα</th>
                <th className="px-3 py-3 text-right font-bold">Τζίρος</th>
                <th className="px-3 py-3 text-right font-bold">Έξοδα Ημέρας</th>
                <th className="px-3 py-3 text-right font-bold">Πάγια</th>
                <th className="px-3 py-3 text-right font-bold">Μισθοδοσία</th>
                <th className="px-3 py-3 text-right font-bold">Αποτέλεσμα</th>
                <th className="px-3 py-3 text-right font-bold">Περιθώριο</th>
                <th className="px-4 py-3 text-right font-bold whitespace-nowrap">vs {previousLabel}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {result.hasFnb && (
                <tr className="bg-slate-100/70">
                  <td colSpan={columns} className="px-4 py-2 text-xs font-black text-slate-700 tracking-wide uppercase">
                    <span className="inline-flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5" />
                      Πρακτορείο
                    </span>
                  </td>
                </tr>
              )}
              {agencyRows.map((unit) => (
                <tr key={unit.key} className={unit.hasActivity ? 'text-slate-800' : 'text-slate-500'}>
                  <td className="pl-4 py-3 pr-3 font-bold whitespace-nowrap text-slate-900">{unit.label}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(unit.revenue)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(unit.dailyExpenses)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(unit.fixedCosts)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(unit.payroll)}</td>
                  <td className={`px-3 py-3 text-right font-black whitespace-nowrap ${resultColor(unit.result)}`}>{formatCurrency(unit.result)}</td>
                  <td className="px-3 py-3 text-right text-slate-500">{percentLabel(unit.margin)}</td>
                  <td className="px-4 py-3 text-right text-xs">
                    <Delta value={unit.result} previous={prior(previous.units.find((p) => p.key === unit.key)?.result)} />
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-extrabold text-slate-900">
                <td className="px-4 py-3">Σύνολο καταστημάτων</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(result.agency.revenue)}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(result.agency.dailyExpenses)}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(result.agency.fixedCosts)}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(result.agency.payroll)}</td>
                <td className={`px-3 py-3 text-right whitespace-nowrap ${resultColor(result.agency.result)}`}>
                  {formatCurrency(result.agency.result)}
                </td>
                <td />
                <td className="px-4 py-3 text-right text-xs">
                  <Delta value={result.agency.result} previous={prior(previous.agency.result)} />
                </td>
              </tr>
              <tr className="text-slate-800">
                <td className="px-4 py-3">
                  <span className="font-bold">Έξοδα Εταιρίας</span>
                  <span className="block text-xs text-slate-500">
                    πάγια {formatCurrency(result.companyFixed)} · ημέρας {formatCurrency(result.companyDaily)}
                  </span>
                </td>
                <td colSpan={4} />
                <td className="px-3 py-3 text-right font-black text-rose-700 whitespace-nowrap">{formatCurrency(-result.companyExpenses)}</td>
                <td />
                <td className="px-4 py-3 text-right text-xs">
                  <Delta value={-result.companyExpenses} previous={prior(-previous.companyExpenses)} />
                </td>
              </tr>
              <tr className="text-slate-800">
                <td className="px-4 py-3 font-bold">Δάνεια</td>
                <td colSpan={4} />
                <td className="px-3 py-3 text-right font-black text-rose-700 whitespace-nowrap">{formatCurrency(-result.loans)}</td>
                <td />
                <td className="px-4 py-3 text-right text-xs">
                  <Delta value={-result.loans} previous={prior(-previous.loans)} />
                </td>
              </tr>
              {result.hasFnb && (
                <tr className="bg-indigo-50/70 text-slate-900">
                  <td className="px-4 py-3 font-black">Καθαρό πρακτορείου</td>
                  <td colSpan={4} />
                  <td className={`px-3 py-3 text-right font-black whitespace-nowrap ${resultColor(result.agencyNet)}`}>
                    {formatCurrency(result.agencyNet)}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-500">{percentLabel(margin(result.agencyNet, result.agency.revenue))}</td>
                  <td className="px-4 py-3 text-right text-xs">
                    <Delta value={result.agencyNet} previous={prior(previous.agencyNet)} />
                  </td>
                </tr>
              )}

              {result.hasFnb && (
                <>
                  <tr className="bg-slate-100/70">
                    <td colSpan={columns} className="px-4 py-2 text-xs font-black text-slate-700 tracking-wide uppercase">
                      <span className="inline-flex items-center gap-1.5">
                        <Coffee className="w-3.5 h-3.5" />
                        Καφέ (F&B)
                      </span>
                    </td>
                  </tr>
                  {fnbRows.map((unit) => (
                    <tr key={unit.key} className={unit.hasActivity ? 'text-slate-800' : 'text-slate-500'}>
                      <td className="pl-4 py-3 pr-3 font-bold whitespace-nowrap text-slate-900">{unit.label}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(unit.revenue)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(unit.dailyExpenses)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(unit.fixedCosts)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(unit.payroll)}</td>
                      <td className={`px-3 py-3 text-right font-black whitespace-nowrap ${resultColor(unit.result)}`}>
                        {formatCurrency(unit.result)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-500">{percentLabel(unit.margin)}</td>
                      <td className="px-4 py-3 text-right text-xs">
                        <Delta value={unit.result} previous={prior(previous.units.find((p) => p.key === unit.key)?.result)} />
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-indigo-50/70 text-slate-900">
                    <td className="px-4 py-3 font-black">Καθαρό καφέ</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(result.fnb.revenue)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(result.fnb.dailyExpenses)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(result.fnb.fixedCosts)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatCurrency(result.fnb.payroll)}</td>
                    <td className={`px-3 py-3 text-right font-black whitespace-nowrap ${resultColor(result.fnbNet)}`}>
                      {formatCurrency(result.fnbNet)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-500">{percentLabel(margin(result.fnbNet, result.fnb.revenue))}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      <Delta value={result.fnbNet} previous={prior(previous.fnbNet)} />
                    </td>
                  </tr>
                </>
              )}
            </tbody>

            <tfoot>
              <tr className="bg-slate-900 text-white">
                <td className="px-4 py-4 font-black">Καθαρό Αποτέλεσμα προ Φόρων</td>
                <td colSpan={4} />
                <td className={`px-3 py-4 text-right text-base font-black whitespace-nowrap ${result.netResult < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {formatCurrency(result.netResult)}
                </td>
                <td className="px-3 py-4 text-right text-slate-300">{percentLabel(netMargin)}</td>
                <td className="px-4 py-4 text-right text-xs">
                  <Delta value={result.netResult} previous={prior(previous.netResult)} onDark />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Ποιος πληρώνει τι. Χωρίς αυτό, το περιθώριο του καφέ διαβάζεται ως
            καθαρό κέρδος - ενώ δεν σηκώνει ούτε ευρώ ενοίκιο. */}
        {result.hasFnb && (
          <p className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            Τα πάγια (ενοίκιο, ενέργεια, τηλεπικοινωνίες), τα έξοδα εταιρίας και τα δάνεια χρεώνονται εξ ολοκλήρου στο πρακτορείο. Ο καφές
            κρατάει μόνο τις δικές του αγορές και τη δική του μισθοδοσία, άρα το περιθώριό του δεν περιλαμβάνει μερίδα στέγης.
          </p>
        )}

        {hiddenCount > 0 && (
          <div className="px-4 py-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowInactive((value) => !value)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
            >
              {showInactive ? 'Απόκρυψη καταστημάτων χωρίς κινήσεις' : `Εμφάνιση καταστημάτων χωρίς κινήσεις (${hiddenCount})`}
            </button>
          </div>
        )}
      </div>

      {isEmpty && (
        <p className="text-sm text-slate-500 text-center">
          Δεν υπάρχουν καταχωρήσεις για αυτόν τον μήνα. Ξεκινήστε από τα «Καταστήματα» (προμήθειες, πάγια) ή τη «Μισθοδοσία».
        </p>
      )}
    </div>
  );
};
