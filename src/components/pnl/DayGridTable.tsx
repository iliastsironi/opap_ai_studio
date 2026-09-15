import React, { useState } from 'react';
import { formatCurrency } from '../../lib/formatters.ts';
import { PnlDayGrid, weekdayLabel } from '../../lib/pnlEngine.ts';
import { shortDay } from './pnlDisplay.tsx';

interface DayGridTableProps {
  grid: PnlDayGrid;
  emptyText: string;
}

// The workbook's day × supplier grid: one column per supplier/payee, one row per day.
export const DayGridTable: React.FC<DayGridTableProps> = ({ grid, emptyText }) => {
  const [showAllDays, setShowAllDays] = useState(false);

  if (grid.columns.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }

  const rows = showAllDays ? grid.days : grid.days.filter((day) => day.total !== 0);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-bold whitespace-nowrap">Ημ/νια</th>
              {grid.columns.map((column) => (
                <th key={column} className="px-3 py-2 text-right font-bold whitespace-nowrap">
                  {column}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-black whitespace-nowrap">Σύνολο</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((day) => (
              <tr key={day.date} className={day.total === 0 ? 'text-slate-300' : 'text-slate-800'}>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="font-semibold">{shortDay(day.date)}</span>{' '}
                  <span className="text-slate-400">{weekdayLabel(day.date)}</span>
                </td>
                {grid.columns.map((column) => (
                  <td key={column} className="px-3 py-1.5 text-right whitespace-nowrap">
                    {day.cells[column] ? formatCurrency(day.cells[column]) : ''}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-bold whitespace-nowrap">{day.total ? formatCurrency(day.total) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-100 font-black text-slate-900">
            <tr>
              <td className="px-3 py-2">Σύνολο</td>
              {grid.columns.map((column) => (
                <td key={column} className="px-3 py-2 text-right whitespace-nowrap">
                  {formatCurrency(grid.columnTotals[column])}
                </td>
              ))}
              <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(grid.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button
        type="button"
        onClick={() => setShowAllDays((value) => !value)}
        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
      >
        {showAllDays ? 'Μόνο ημέρες με κινήσεις' : 'Όλες οι ημέρες του μήνα'}
      </button>
    </div>
  );
};
