import React from 'react';
import { formatCurrency } from '../../lib/formatters.ts';
import { getCustomerCreditLimit } from '../../services/customerCreditService.ts';
import { Customer, CreditScoreTier, CreditTierConfig } from '../../types/index.ts';
import { DebtFigure } from './CreditFigureCells.tsx';

/**
 * Η γραμμή κάτω από έναν πελάτη στην πίστωση της βάρδιας: ο πελάτης, το όριό
 * του, η οφειλή του και το υπόλοιπο του ορίου.
 *
 * Ίδιος κανόνας με το τεφτέρι: χρώμα παίρνουν ΜΟΝΟ τα νούμερα οφειλής (η
 * τρέχουσα και το νέο σύνολο που προκύπτει από το ποσό της γραμμής), ως
 * ποσοστό του ορίου. Το όριο και το υπόλοιπο ορίου είναι απλά νούμερα.
 *
 * Το όριο είναι αυτό που ισχύει στην πραγματικότητα για τον πελάτη (δικό του
 * όριο αν έχει, αλλιώς της κατηγορίας του), το ίδιο που ελέγχει η πίστωση.
 * Πριν, το σήμα Score έγραφε πάντα το όριο της κατηγορίας, ακόμα κι όταν ο
 * πελάτης είχε δικό του.
 */

interface Props {
  customer: Customer;
  /** Η οφειλή ΤΩΡΑ: βάση + οι γραμμές της βάρδιας από πάνω. */
  liveDebt: number;
  /** Η οφειλή όπως είναι στη βάση, για να εξηγείται η διαφορά όταν υπάρχει. */
  savedDebt: number;
  tierConfigs: Record<CreditScoreTier, CreditTierConfig>;
  amount: number;
  isGranted: boolean;
}

export const CreditStatusPanel: React.FC<Props> = ({
  customer, liveDebt, savedDebt, tierConfigs, amount, isGranted,
}) => {
  const { limit, isUnlimited } = getCustomerCreditLimit(customer, tierConfigs);
  const remaining = isUnlimited ? null : Math.max(0, limit - liveDebt);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 text-xs">
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
        {/* Ουδέτερο: ο τύπος πελάτη (A, B, C) είχε φανάρι - πράσινο, κεχριμπάρι,
            κόκκινο - και μπερδευόταν με το χρώμα της οφειλής δίπλα του. */}
        <span className="px-2 py-0.5 rounded-full text-micro font-black border bg-slate-100 text-slate-700 border-slate-300">
          Score: {customer.tier}
        </span>

        <span className="text-micro text-slate-600 font-semibold">
          Όριο:{' '}
          <strong className="font-mono text-slate-800">
            {isUnlimited ? 'Απεριόριστο' : formatCurrency(limit)}
          </strong>
        </span>

        <span className="text-micro text-slate-600 font-semibold">
          Τρέχουσα Οφειλή:{' '}
          <DebtFigure debt={liveDebt} limit={limit} isUnlimited={isUnlimited} />
          {Math.abs(liveDebt - savedDebt) > 0.005 && (
            /* Από πού προκύπτει, όταν διαφέρει από τη βάση: αλλιώς
               δύο γραμμές της ίδιας οθόνης δείχνουν δύο νούμερα
               για τον ίδιο πελάτη και κανένα δεν εξηγεί το άλλο. */
            <span className="text-micro text-slate-500 font-medium">
              {' '}(στη βάση {formatCurrency(savedDebt)}, με τις γραμμές αυτής της βάρδιας)
            </span>
          )}
        </span>

        {remaining !== null && (
          <span className="text-micro text-slate-600 font-semibold">
            Υπόλοιπο Ορίου:{' '}
            <strong className="font-mono text-slate-800">{formatCurrency(remaining)}</strong>
          </span>
        )}
      </div>

      {/* Τι γίνεται η οφειλή αν περάσει αυτή η γραμμή */}
      {amount > 0 && (
        <div className="text-micro font-mono font-bold text-slate-600">
          {isGranted ? (
            <span>
              Νέο Σύνολο Οφειλής:{' '}
              <DebtFigure debt={liveDebt + amount} limit={limit} isUnlimited={isUnlimited} />
            </span>
          ) : (
            <span>
              Νέο Υπόλοιπο μετά την Είσπραξη:{' '}
              <DebtFigure debt={Math.max(0, liveDebt - amount)} limit={limit} isUnlimited={isUnlimited} />
            </span>
          )}
        </div>
      )}
    </div>
  );
};
