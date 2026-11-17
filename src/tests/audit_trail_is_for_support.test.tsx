import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Οι καταγραφές ελέγχου είναι για την υποστήριξη, όχι για τον πελάτη.
 *
 * Ο ιδιοκτήτης: «δεν έχει νόημα να υπάρχουν στους χρήστες και να εμφανίζονται·
 * να υπάρχουν για όλους, αλλά εγώ σαν πάροχος να έχω access».
 *
 * Οι καταγραφές γράφονται για όλους όπως πάντα· αλλάζει ποιος τις βλέπει: η
 * οθόνη τις κρύβει από όλους εκτός από τον ρόλο PLATFORM_ADMIN, και η βάση
 * (0092) τις δίνει μόνο σε αυτόν.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const session = vi.hoisted(() => ({ roles: [] as Array<{ code: string; name: string }> }));

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({
    organization: { id: 'org_1', trade_name: 'Δοκιμή', vat_number: '1' },
    roles: session.roles,
    // Όπως το πραγματικό hasPermission: ο ιδιοκτήτης και ο πάροχος περνούν από παντού.
    hasPermission: () => true,
  }),
}));
vi.mock('../context/TenantContext.tsx', () => ({ useTenant: () => ({ activeStoreId: 'ALL' }) }));
vi.mock('../services/shiftTemplateService.ts', () => ({ getShiftTemplateConfig: async () => ({}) }));

import { Sidebar } from '../components/layout/Sidebar.tsx';
import { PROVIDER_ONLY_TABS, PROVIDER_ROLE, isProvider } from '../lib/provider.ts';

const sidebarAs = (code: string) => {
  session.roles = [{ code, name: code }];
  return renderToStaticMarkup(<Sidebar currentTab="shifts" setCurrentTab={() => {}} isOpen setIsOpen={() => {}} />);
};

describe('το μενού', () => {
  it('ο ιδιοκτήτης του πελάτη ΔΕΝ βλέπει τις Καταγραφές Ελέγχου, ενώ βλέπει τα υπόλοιπα της Διαχείρισης', () => {
    const html = sidebarAs('ORG_OWNER');
    expect(html).not.toContain('Καταγραφές Ελέγχου');
    // Η κρίση είναι για το σωστό μενού: τα διπλανά στοιχεία είναι εκεί.
    expect(html).toContain('Ρυθμίσεις Οργανισμού');
    expect(html).toContain('Πρόγραμμα Βαρδιών');
  });

  it('ούτε ο διευθυντής ούτε ο υπάλληλος τις βλέπουν', () => {
    expect(sidebarAs('STORE_MANAGER')).not.toContain('Καταγραφές Ελέγχου');
    expect(sidebarAs('EMPLOYEE')).not.toContain('Καταγραφές Ελέγχου');
  });

  it('ο πάροχος (PLATFORM_ADMIN) τις βλέπει', () => {
    expect(sidebarAs('PLATFORM_ADMIN')).toContain('Καταγραφές Ελέγχου');
  });
});

describe('ο πάροχος', () => {
  it('είναι μόνο ο ρόλος PLATFORM_ADMIN', () => {
    expect(PROVIDER_ROLE).toBe('PLATFORM_ADMIN');
    expect(isProvider(['PLATFORM_ADMIN'])).toBe(true);
    expect(isProvider(['ORG_OWNER'])).toBe(false);
    expect(isProvider(['ORG_ADMIN', 'STORE_MANAGER'])).toBe(false);
  });

  it('κενή ή άγνωστη λίστα ρόλων σημαίνει ΟΧΙ', () => {
    expect(isProvider([])).toBe(false);
    expect(isProvider(null)).toBe(false);
    expect(isProvider(undefined)).toBe(false);
  });

  it('η καρτέλα audit είναι η μόνη του παρόχου', () => {
    expect(PROVIDER_ONLY_TABS).toEqual(['audit']);
  });
});

describe('η πόρτα του App', () => {
  const app = read('src/App.tsx');

  it('μια καρτέλα του παρόχου δεν ανοίγει σε άλλον, ούτε με το δικαίωμα του ιδιοκτήτη', () => {
    expect(app).toContain('PROVIDER_ONLY_TABS.includes(currentTab)');
    expect(app).toContain('isProvider(roles.map((r) => r.code))');
    // Το δικαίωμα μένει ΚΙ αυτό: και οι δύο όροι πρέπει να ισχύουν.
    expect(app).toMatch(/allowedByPermission\s*&&/);
  });
});

describe('η βάση (0092)', () => {
  const sql = read('supabase/migrations/0092_the_audit_trail_is_for_support.sql');
  const code = sql
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

  it('το SELECT περιορίζεται στον πάροχο μέσα στον οργανισμό του', () => {
    expect(code).toContain('DROP POLICY IF EXISTS audit_logs_select ON audit_logs;');
    expect(code).toMatch(/CREATE POLICY audit_logs_select ON audit_logs FOR SELECT/);
    expect(code).toContain('belongs_to_org(organization_id)');
    expect(code).toContain("auth_role_code(), '') = 'PLATFORM_ADMIN'");
  });

  it('οι καταγραφές εξακολουθούν να γράφονται: το INSERT δεν αγγίζεται, και δεν ανοίγει UPDATE/DELETE', () => {
    expect(code).not.toMatch(/audit_logs_insert/);
    expect(code).not.toMatch(/FOR (UPDATE|DELETE|ALL)/);
    expect(code).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
  });

  it('κανένα άλλο σημείο της εφαρμογής δεν διαβάζει τον πίνακα, άρα δεν χαλάει τίποτα άλλο', () => {
    // Ο μοναδικός αναγνώστης στο client είναι ο viewer· οι υπόλοιπες χρήσεις γράφουν.
    const service = read('src/services/auditLogService.ts');
    expect(service.match(/\.from\(AUDIT_LOGS_TABLE\)/g)).toHaveLength(2); // insert + ο viewer
    expect(read('api/_lib/usersInviteHandler.ts')).not.toMatch(/from\('audit_logs'\)\s*\.select/);
  });
});
