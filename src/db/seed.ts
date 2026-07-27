import bcrypt from 'bcryptjs';
import { execute, query, queryOne } from './index.js';

export async function seedDatabase() {
  // Check if permissions already exist
  const existingPerms = await query('SELECT count(*) as count FROM permissions');
  const count = Number(existingPerms[0]?.count || 0);
  if (count > 0) {
    return; // Already seeded
  }

  console.log('Seeding initial system permissions, default roles, and demo organization...');

  // 1. Seed Permissions
  const permissionsList = [
    { code: 'org.view', module: 'Organization', description: 'Προβολή πληροφοριών οργανισμού' },
    { code: 'org.settings', module: 'Organization', description: 'Διαχείριση ρυθμίσεων οργανισμού' },
    { code: 'store.view', module: 'Store', description: 'Προβολή καταστημάτων' },
    { code: 'store.manage', module: 'Store', description: 'Δημιουργία και διαχείριση καταστημάτων' },
    { code: 'department.manage', module: 'Store', description: 'Διαχείριση τμημάτων καταστήματος' },
    { code: 'users.view', module: 'Users', description: 'Προβολή χρηστών' },
    { code: 'users.manage', module: 'Users', description: 'Διαχείριση χρηστών και προσκλήσεων' },
    { code: 'roles.manage', module: 'Users', description: 'Διαχείριση ρόλων και δικαιωμάτων' },
    { code: 'store_assignment.manage', module: 'Users', description: 'Ανάθεση καταστημάτων σε χρήστες' },
    { code: 'shift.create', module: 'Shifts', description: 'Άνοιγμα και καταχώρηση βάρδιας' },
    { code: 'shift.submit', module: 'Shifts', description: 'Υποβολή βάρδιας για έγκριση' },
    { code: 'shift.approve', module: 'Shifts', description: 'Έγκριση ή απόρριψη βάρδιας' },
    { code: 'shift.reopen', module: 'Shifts', description: 'Επανάννοιγμα βάρδιας' },
    { code: 'expense.create', module: 'Expenses', description: 'Καταχώρηση εξόδου' },
    { code: 'expense.approve', module: 'Expenses', description: 'Έγκριση εξόδων' },
    { code: 'expense.delete', module: 'Expenses', description: 'Διαγραφή εξόδου' },
    { code: 'cash.view', module: 'Cash', description: 'Προβολή ταμείου' },
    { code: 'cash.correct', module: 'Cash', description: 'Διόρθωση υπολοίπου ταμείου' },
    { code: 'payroll.view', module: 'Payroll', description: 'Προβολή στοιχείων μισθοδοσίας' },
    { code: 'payroll.edit', module: 'Payroll', description: 'Επεξεργασία στοιχείων μισθοδοσίας' },
    { code: 'reports.organization.view', module: 'Reports', description: 'Προβολή συγκεντρωτικών αναφορών οργανισμού' },
    { code: 'reports.store.view', module: 'Reports', description: 'Προβολή αναφορών καταστήματος' },
    { code: 'audit.view', module: 'Audit', description: 'Προβολή καταγραφών ελέγχου (Audit Logs)' },
  ];

  for (const p of permissionsList) {
    await execute(
      'INSERT INTO permissions (id, code, module, description) VALUES ($1, $2, $3, $4)',
      ['perm_' + p.code, p.code, p.module, p.description]
    );
  }

  // 2. System Default Roles
  const rolesList = [
    {
      code: 'PLATFORM_ADMIN',
      name: 'Διαχειριστής Πλατφόρμας',
      desc: 'Πλήρης πρόσβαση στην πλατφόρμα ShiftLedger',
      isSystem: true,
      perms: permissionsList.map((p) => p.code),
    },
    {
      code: 'ORG_OWNER',
      name: 'Ιδιοκτήτης Οργανισμού',
      desc: 'Πλήρης πρόσβαση στον οργανισμό, όλα τα καταστήματα και τις αναφορές',
      isSystem: true,
      perms: permissionsList.map((p) => p.code),
    },
    {
      code: 'AREA_MANAGER',
      name: 'Area Manager',
      desc: 'Διαχείριση και έγκριση ανατεθειμένων καταστημάτων',
      isSystem: true,
      perms: [
        'org.view',
        'store.view',
        'users.view',
        'shift.create',
        'shift.submit',
        'shift.approve',
        'shift.reopen',
        'expense.create',
        'expense.approve',
        'cash.view',
        'reports.store.view',
        'audit.view',
      ],
    },
    {
      code: 'STORE_MANAGER',
      name: 'Διευθυντής Καταστήματος',
      desc: 'Διαχείριση καταστήματος, βαρδιών, εξόδων και εγκρίσεων',
      isSystem: true,
      perms: [
        'org.view',
        'store.view',
        'users.view',
        'shift.create',
        'shift.submit',
        'shift.approve',
        'expense.create',
        'expense.approve',
        'cash.view',
        'reports.store.view',
      ],
    },
    {
      code: 'SHIFT_SUPERVISOR',
      name: 'Υπεύθυνος Βάρδιας',
      desc: 'Άνοιγμα, κλείσιμο και έλεγχος ταμείου βάρδιας',
      isSystem: true,
      perms: ['org.view', 'store.view', 'shift.create', 'shift.submit', 'expense.create', 'cash.view'],
    },
    {
      code: 'EMPLOYEE',
      name: 'Υπάλληλος',
      desc: 'Καταχώρηση βάρδιας και καταμέτρηση ταμείου στο ανατεθειμένο κατάστημα',
      isSystem: true,
      perms: ['store.view', 'shift.create', 'shift.submit', 'expense.create'],
    },
    {
      code: 'ACCOUNTANT',
      name: 'Λογιστής',
      desc: 'Πρόσβαση σε οικονομικές αναφορές, έξοδα και εγκεκριμένα δεδομένα',
      isSystem: true,
      perms: ['org.view', 'store.view', 'expense.create', 'cash.view', 'reports.organization.view', 'reports.store.view'],
    },
    {
      code: 'AUDITOR',
      name: 'Ελεγκτής (Read-Only)',
      desc: 'Μόνο ανάγνωση αναφορών και καταγραφών ελέγχου',
      isSystem: true,
      perms: ['org.view', 'store.view', 'cash.view', 'reports.organization.view', 'reports.store.view', 'audit.view'],
    },
  ];

  const roleIdMap: Record<string, string> = {};

  for (const r of rolesList) {
    const roleId = 'role_' + r.code.toLowerCase();
    roleIdMap[r.code] = roleId;

    await execute(
      'INSERT INTO roles (id, organization_id, code, name, description, is_system) VALUES ($1, $2, $3, $4, $5, $6)',
      [roleId, null, r.code, r.name, r.desc, r.isSystem]
    );

    for (const permCode of r.perms) {
      await execute(
        'INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, $2)',
        [roleId, permCode]
      );
    }
  }

  // 3. Demo Organization
  const orgId = 'org_opap_hellas_01';
  await execute(
    `INSERT INTO organizations (id, legal_name, trade_name, vat_number, tax_office, address, phone, email, timezone, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      orgId,
      'ΟΠΑΠ Gaming & Retail Α.Ε.',
      'ShiftLedger OPAP Group Athens',
      '094883920',
      'ΔΟΫ ΦΑΕ ΑΘΗΝΩΝ',
      'Λεωφ. Κηφισίας 108, Αθήνα',
      '+30 210 6800000',
      'contact@shiftledger-opap.gr',
      'Europe/Athens',
      'EUR',
    ]
  );

  // 4. Demo Stores
  const storesData = [
    {
      id: 'store_opap_01',
      code: 'STR-101',
      name: 'Πρακτορείο ΟΠΑΠ - Σύνταγμα',
      type: 'OPAP_AGENCY',
      address: 'Φιλελλήνων 12, Σύνταγμα, Αθήνα',
      phone: '210 3214567',
      hours: '08:00 - 23:30',
    },
    {
      id: 'store_play_02',
      code: 'STR-202',
      name: 'PLAY OPAP Store - Γλυφάδα',
      type: 'PLAY_STORE',
      address: 'Λεωφ. Δημάρχου Αγγέλου Μεταξά 45, Γλυφάδα',
      phone: '210 8945612',
      hours: '10:00 - 03:00',
    },
    {
      id: 'store_fnb_03',
      code: 'STR-303',
      name: 'OPAP & FnB Lounge - Περιστέρι',
      type: 'OPAP_FNB',
      address: 'Παναγή Τσαλδάρη 88, Περιστέρι',
      phone: '210 5789123',
      hours: '07:30 - 00:00',
    },
  ];

  for (const s of storesData) {
    await execute(
      `INSERT INTO stores (id, organization_id, code, name, store_type, address, phone, operating_hours, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [s.id, orgId, s.code, s.name, s.type, s.address, s.phone, s.hours, true]
    );

    // Add default departments per store
    const deptOpapId = `dept_${s.id}_opap`;
    await execute(
      `INSERT INTO departments (id, organization_id, store_id, code, name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [deptOpapId, orgId, s.id, 'OPAP', 'Τμήμα Παιχνιδιών ΟΠΑΠ', true]
    );

    if (s.type === 'PLAY_STORE' || s.type === 'OPAP_FNB') {
      const deptVltId = `dept_${s.id}_vlt`;
      await execute(
        `INSERT INTO departments (id, organization_id, store_id, code, name, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [deptVltId, orgId, s.id, 'PLAY_VLT', 'Τμήμα Τερματικών PLAY VLT', true]
      );
    }

    if (s.type === 'OPAP_FNB') {
      const deptFnbId = `dept_${s.id}_fnb`;
      await execute(
        `INSERT INTO departments (id, organization_id, store_id, code, name, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [deptFnbId, orgId, s.id, 'FNB', 'Τμήμα Καφέ & Αναψυκτηρίου (FnB)', true]
      );
    }
  }

  // 5. Seed Users with default hashed password 'password123'
  const hashedPassword = await bcrypt.hash('password123', 10);

  const usersData = [
    {
      id: 'usr_owner_01',
      email: 'owner@shiftledger.gr',
      firstName: 'Γιώργος',
      lastName: 'Παπαδόπουλος',
      phone: '+30 697 1111111',
      code: 'EMP-001',
      roleCode: 'ORG_OWNER',
      stores: ['store_opap_01', 'store_play_02', 'store_fnb_03'],
    },
    {
      id: 'usr_manager_01',
      email: 'manager@shiftledger.gr',
      firstName: 'Ελένη',
      lastName: 'Βασιλείου',
      phone: '+30 697 2222222',
      code: 'EMP-002',
      roleCode: 'STORE_MANAGER',
      stores: ['store_opap_01', 'store_play_02'],
    },
    {
      id: 'usr_supervisor_01',
      email: 'supervisor@shiftledger.gr',
      firstName: 'Νίκος',
      lastName: 'Αναστασίου',
      phone: '+30 697 3333333',
      code: 'EMP-003',
      roleCode: 'SHIFT_SUPERVISOR',
      stores: ['store_opap_01'],
    },
    {
      id: 'usr_employee_01',
      email: 'employee@shiftledger.gr',
      firstName: 'Μαρία',
      lastName: 'Γεωργίου',
      phone: '+30 697 4444444',
      code: 'EMP-004',
      roleCode: 'EMPLOYEE',
      stores: ['store_opap_01'],
    },
    {
      id: 'usr_accountant_01',
      email: 'accountant@shiftledger.gr',
      firstName: 'Δημήτρης',
      lastName: 'Κωνσταντίνου',
      phone: '+30 697 5555555',
      code: 'EMP-005',
      roleCode: 'ACCOUNTANT',
      stores: ['store_opap_01', 'store_play_02', 'store_fnb_03'],
    },
  ];

  for (const u of usersData) {
    await execute(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, phone, employee_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [u.id, u.email, hashedPassword, u.firstName, u.lastName, u.phone, u.code, 'ACTIVE']
    );

    // Assign Role
    const roleId = roleIdMap[u.roleCode];
    if (roleId) {
      await execute(
        `INSERT INTO user_organization_roles (id, user_id, organization_id, role_id)
         VALUES ($1, $2, $3, $4)`,
        [`uor_${u.id}`, u.id, orgId, roleId]
      );
    }

    // Assign Stores
    for (let i = 0; i < u.stores.length; i++) {
      const storeId = u.stores[i];
      await execute(
        `INSERT INTO user_store_assignments (id, user_id, organization_id, store_id, is_primary)
         VALUES ($1, $2, $3, $4, $5)`,
        [`usa_${u.id}_${storeId}`, u.id, orgId, storeId, i === 0]
      );
    }
  }

  // 6. Demo Shifts
  const existingShifts = await query('SELECT count(*) as count FROM shifts');
  if (Number(existingShifts[0]?.count || 0) === 0) {
    const shiftsData = [
      {
        id: 'shift_demo_01',
        orgId,
        storeId: 'store_opap_01',
        registerId: 'REG-01',
        type: 'MORNING',
        status: 'APPROVED',
        openedBy: 'usr_supervisor_01',
        closedBy: 'usr_supervisor_01',
        openedAt: '2026-07-25T08:00:00Z',
        closedAt: '2026-07-25T15:30:00Z',
        openingCash: 200.0,
        opapGross: 1450.0,
        opapPayouts: 350.0,
        opapNet: 1100.0,
        vltsIn: 0.0,
        vltsOut: 0.0,
        vltsNet: 0.0,
        scratchLotto: 120.0,
        fnbSales: 0.0,
        fnbCash: 0.0,
        fnbCard: 0.0,
        cardPayments: 220.0,
        expensesCash: 35.0,
        creditGranted: 0.0,
        creditCollected: 0.0,
        bankDeposits: 500.0,
        countedDenominations: JSON.stringify({
          '100': 3,
          '50': 8,
          '20': 15,
          '10': 15,
          '5': 20,
          '2': 10,
          '1': 10,
          '0.50': 10,
        }),
        countedCash: 1115.0,
        expectedCash: 1115.0,
        discrepancy: 0.0,
        discrepancyPct: 0.0,
        threshold: 10.0,
        unbalanced: false,
        empNotes: 'Βάρδια ολοκληρώθηκε χωρίς καμία απόκλιση.',
        mgrNotes: 'Εγκεκριμένη βάρδια.',
      },
      {
        id: 'shift_demo_02',
        orgId,
        storeId: 'store_play_02',
        registerId: 'REG-02',
        type: 'AFTERNOON',
        status: 'SUBMITTED',
        openedBy: 'usr_employee_01',
        closedBy: 'usr_employee_01',
        openedAt: '2026-07-25T16:00:00Z',
        closedAt: '2026-07-25T23:45:00Z',
        openingCash: 300.0,
        opapGross: 800.0,
        opapPayouts: 200.0,
        opapNet: 600.0,
        vltsIn: 2500.0,
        vltsOut: 1200.0,
        vltsNet: 1300.0,
        scratchLotto: 50.0,
        fnbSales: 180.0,
        fnbCash: 120.0,
        fnbCard: 60.0,
        cardPayments: 400.0,
        expensesCash: 50.0,
        creditGranted: 20.0,
        creditCollected: 0.0,
        bankDeposits: 1500.0,
        countedDenominations: JSON.stringify({
          '100': 4,
          '50': 8,
          '20': 10,
          '10': 10,
          '5': 16,
          '2': 10,
          '1': 14,
        }),
        countedCash: 914.0,
        expectedCash: 929.0, // Expected = 300 + 800 - 200 + 2500 - 1200 + 50 + 120 - 400 - 50 - 20 - 1500 = 929
        discrepancy: -15.0,
        discrepancyPct: -1.61,
        threshold: 10.0,
        unbalanced: true,
        empNotes: 'Έλλειμμα 15.00€ πιθανώς από κέρμα VLT ή μη καταχωρημένη απόδειξη.',
        mgrNotes: null,
      },
      {
        id: 'shift_demo_03',
        orgId,
        storeId: 'store_fnb_03',
        registerId: 'REG-01',
        type: 'NIGHT',
        status: 'CORRECTION_REQUESTED',
        openedBy: 'usr_supervisor_01',
        closedBy: 'usr_supervisor_01',
        openedAt: '2026-07-26T00:00:00Z',
        closedAt: '2026-07-26T08:00:00Z',
        openingCash: 250.0,
        opapGross: 600.0,
        opapPayouts: 100.0,
        opapNet: 500.0,
        vltsIn: 1000.0,
        vltsOut: 400.0,
        vltsNet: 600.0,
        scratchLotto: 80.0,
        fnbSales: 320.0,
        fnbCash: 220.0,
        fnbCard: 100.0,
        cardPayments: 250.0,
        expensesCash: 20.0,
        creditGranted: 0.0,
        creditCollected: 40.0,
        bankDeposits: 800.0,
        countedDenominations: JSON.stringify({
          '100': 5,
          '50': 10,
          '20': 10,
          '10': 10,
          '5': 10,
        }),
        countedCash: 1350.0,
        expectedCash: 1320.0,
        discrepancy: 30.0,
        discrepancyPct: 2.27,
        threshold: 10.0,
        unbalanced: true,
        empNotes: 'Πλεόνασμα 30.00€.',
        mgrNotes: 'Παρακαλώ επανακαταμετρήστε τα πληρωθέντα δελτία ΟΠΑΠ.',
      },
      {
        id: 'shift_demo_04',
        orgId,
        storeId: 'store_opap_01',
        registerId: 'REG-01',
        type: 'MORNING',
        status: 'OPEN',
        openedBy: 'usr_employee_01',
        closedBy: null,
        openedAt: new Date().toISOString(),
        closedAt: null,
        openingCash: 250.0,
        opapGross: 0.0,
        opapPayouts: 0.0,
        opapNet: 0.0,
        vltsIn: 0.0,
        vltsOut: 0.0,
        vltsNet: 0.0,
        scratchLotto: 0.0,
        fnbSales: 0.0,
        fnbCash: 0.0,
        fnbCard: 0.0,
        cardPayments: 0.0,
        expensesCash: 0.0,
        creditGranted: 0.0,
        creditCollected: 0.0,
        bankDeposits: 0.0,
        countedDenominations: JSON.stringify({}),
        countedCash: 0.0,
        expectedCash: 250.0,
        discrepancy: 0.0,
        discrepancyPct: 0.0,
        threshold: 10.0,
        unbalanced: false,
        empNotes: null,
        mgrNotes: null,
      },
    ];

    for (const s of shiftsData) {
      await execute(
        `INSERT INTO shifts (
          id, organization_id, store_id, register_id, shift_type, status,
          opened_by_user_id, closed_by_user_id, opened_at, closed_at,
          opening_cash, opap_gross_sales, opap_payouts, opap_net_sales,
          vlts_cash_in, vlts_cash_out, vlts_net, scratch_lotto_sales,
          fnb_sales, fnb_cash, fnb_card, card_payments, expenses_paid_cash,
          customer_credit_granted, customer_credit_collected, bank_deposits,
          counted_denominations, counted_cash, expected_cash, discrepancy,
          discrepancy_percentage, discrepancy_threshold, is_unbalanced,
          employee_notes, manager_notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18,
          $19, $20, $21, $22, $23,
          $24, $25, $26,
          $27, $28, $29, $30,
          $31, $32, $33,
          $34, $35
        )`,
        [
          s.id, s.orgId, s.storeId, s.registerId, s.type, s.status,
          s.openedBy, s.closedBy, s.openedAt, s.closedAt,
          s.openingCash, s.opapGross, s.opapPayouts, s.opapNet,
          s.vltsIn, s.vltsOut, s.vltsNet, s.scratchLotto,
          s.fnbSales, s.fnbCash, s.fnbCard, s.cardPayments, s.expensesCash,
          s.creditGranted, s.creditCollected, s.bankDeposits,
          s.countedDenominations, s.countedCash, s.expectedCash, s.discrepancy,
          s.discrepancyPct, s.threshold, s.unbalanced,
          s.empNotes, s.mgrNotes
        ]
      );
    }

    // Add demo expense receipt
    await execute(
      `INSERT INTO shift_expenses (
        id, shift_id, organization_id, store_id, category, amount, payment_method, description, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        'exp_demo_01',
        'shift_demo_01',
        orgId,
        'store_opap_01',
        'SUPPLIES',
        35.0,
        'CASH',
        'Αγορά χαρτοταινιών θερμικού εκτυπωτή ΟΠΑΠ',
        'usr_supervisor_01',
      ]
    );

    // Add demo customer credit
    await execute(
      `INSERT INTO customer_credits (
        id, shift_id, organization_id, store_id, customer_name, type, amount, notes, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        'cred_demo_01',
        'shift_demo_02',
        orgId,
        'store_play_02',
        'Γιάννης Κ.',
        'GRANTED',
        20.0,
        'Πίστωση δελτίου ΚΙΝΟ - εξόφληση αύριο',
        'usr_employee_01',
      ]
    );
  }

  // 7. Initial Audit Log

  await execute(
    `INSERT INTO audit_logs (id, organization_id, user_id, user_email, action, entity_type, entity_id, after_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      'audit_init_01',
      orgId,
      'usr_owner_01',
      'owner@shiftledger.gr',
      'ORGANIZATION_INITIALIZED',
      'ORGANIZATION',
      orgId,
      JSON.stringify({ legal_name: 'ΟΠΑΠ Gaming & Retail Α.Ε.', stores_count: 3 }),
    ]
  );

  console.log('Seed completed successfully!');
}
