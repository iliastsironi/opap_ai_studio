import React from 'react';

// Accepts both «1.538,71» (Greek) and «1538.71».
export function parseMoney(raw: string): number | null {
  const trimmed = raw.replace(/\s/g, '');
  if (trimmed === '') return 0;
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  if (!/^-?\d*\.?\d*$/.test(normalized) || normalized === '-' || normalized === '.' || normalized === '-.') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function isValidMoney(raw: string, allowNegative = false): boolean {
  const value = parseMoney(raw);
  return value !== null && (allowNegative || value >= 0);
}

export function moneyInputValue(amount: number): string {
  return amount === 0 ? '' : amount.toFixed(2).replace('.', ',');
}

interface MoneyInputProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  allowNegative?: boolean;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({ id, label, value, onChange, allowNegative = false }) => {
  const invalid = !isValidMoney(value, allowNegative);
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid}
      value={value}
      placeholder="0,00"
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-3 py-2 rounded-xl border text-sm text-right font-mono tabular-nums focus:outline-hidden focus:ring-2 ${
        invalid ? 'border-rose-400 bg-rose-50 focus:ring-rose-500' : 'border-slate-300 bg-white focus:ring-indigo-500'
      }`}
    />
  );
};
