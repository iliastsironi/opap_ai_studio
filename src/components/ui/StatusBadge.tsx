import React from 'react';
import { Badge, BadgeTone, BadgeVariant, BadgeSize } from './Badge.tsx';
import { ShiftStatus, CreditScoreTier } from '../../types/index.ts';

interface StatusConfig {
  tone: BadgeTone;
  label: string;
  dot?: boolean;
  pulse?: boolean;
}

// A total Record, not Partial<> and not a switch with a default: case - TypeScript
// fails to compile this file if ShiftStatus ever grows a value without an entry here.
// That's the actual fix for the bug documented at the old ShiftDetailsModal callsite
// (two independent hand-rolled implementations of this same enum had drifted apart).
export const SHIFT_STATUS_CONFIG: Record<ShiftStatus, StatusConfig> = {
  OPEN: { tone: 'info', label: 'ΑΝΟΙΧΤΗ', dot: true },
  DRAFT_CLOSING: { tone: 'accent', label: 'ΠΡΟΧΕΙΡΟ', dot: true },
  SUBMITTED: { tone: 'warning', label: 'ΕΚΚΡΕΜΕΙ ΕΓΚΡΙΣΗ', dot: true, pulse: true },
  APPROVED: { tone: 'success', label: 'ΕΓΚΕΚΡΙΜΕΝΗ', dot: true },
  CORRECTION_REQUESTED: { tone: 'danger', label: 'ΑΙΤΗΜΑ ΔΙΟΡΘΩΣΗΣ', dot: true },
  REOPENED: { tone: 'accent', label: 'ΕΠΑΝΑΝΟΙΓΜΕΝΗ', dot: true },
};

export interface ShiftStatusBadgeProps {
  status: ShiftStatus | string;
  variant?: BadgeVariant;
  size?: BadgeSize;
}

export const ShiftStatusBadge: React.FC<ShiftStatusBadgeProps> = ({ status, variant, size }) => {
  const cfg = SHIFT_STATUS_CONFIG[status as ShiftStatus];
  if (!cfg) {
    return (
      <Badge tone="neutral" variant={variant} size={size}>
        {status}
      </Badge>
    );
  }
  return (
    <Badge tone={cfg.tone} variant={variant} size={size} dot={cfg.dot} pulse={cfg.pulse}>
      {cfg.label}
    </Badge>
  );
};

export const CREDIT_TIER_CONFIG: Record<CreditScoreTier, StatusConfig> = {
  'A+': { tone: 'accent', label: 'A+' },
  A: { tone: 'success', label: 'A' },
  B: { tone: 'warning', label: 'B' },
  C: { tone: 'danger', label: 'C' },
};

export interface CreditTierBadgeProps {
  tier: CreditScoreTier;
  variant?: BadgeVariant;
  size?: BadgeSize;
}

export const CreditTierBadge: React.FC<CreditTierBadgeProps> = ({ tier, variant, size }) => {
  const cfg = CREDIT_TIER_CONFIG[tier];
  return (
    <Badge tone={cfg.tone} variant={variant} size={size} mono>
      {cfg.label}
    </Badge>
  );
};
