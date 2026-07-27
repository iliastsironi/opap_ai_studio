import { Router } from 'express';
import {
  calculateCountedCash,
  calculateDiscrepancy,
  calculateExpectedCash,
  safeNum,
} from '../../services/financialCalculator.js';
import { query, queryOne, execute } from '../../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// 1. GET /api/v1/shifts - List shifts for organization / stores
router.get('/', authenticateToken, requirePermission('store.view'), async (req: AuthenticatedRequest, res) => {
  try {
    const { store_id, status } = req.query;

    let sql = `
      SELECT s.*, 
             st.name as store_name, st.code as store_code,
             u1.first_name || ' ' || u1.last_name as opened_by_user_name,
             u2.first_name || ' ' || u2.last_name as closed_by_user_name
      FROM shifts s
      JOIN stores st ON s.store_id = st.id
      LEFT JOIN users u1 ON s.opened_by_user_id = u1.id
      LEFT JOIN users u2 ON s.closed_by_user_id = u2.id
      WHERE s.organization_id = $1
    `;
    const params: unknown[] = [req.organization?.id];

    if (store_id && store_id !== 'ALL') {
      params.push(store_id);
      sql += ` AND s.store_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND s.status = $${params.length}`;
    }

    sql += ` ORDER BY s.opened_at DESC LIMIT 100`;

    const shifts = await query(sql, params);

    // Format parsed numeric values & parsed denominations
    const formatted = shifts.map((s: any) => ({
      ...s,
      opening_cash: Number(s.opening_cash),
      opap_gross_sales: Number(s.opap_gross_sales),
      opap_payouts: Number(s.opap_payouts),
      opap_net_sales: Number(s.opap_net_sales),
      vlts_cash_in: Number(s.vlts_cash_in),
      vlts_cash_out: Number(s.vlts_cash_out),
      vlts_net: Number(s.vlts_net),
      scratch_lotto_sales: Number(s.scratch_lotto_sales),
      fnb_sales: Number(s.fnb_sales),
      fnb_cash: Number(s.fnb_cash),
      fnb_card: Number(s.fnb_card),
      card_payments: Number(s.card_payments),
      expenses_paid_cash: Number(s.expenses_paid_cash),
      customer_credit_granted: Number(s.customer_credit_granted),
      customer_credit_collected: Number(s.customer_credit_collected),
      bank_deposits: Number(s.bank_deposits),
      counted_cash: Number(s.counted_cash),
      expected_cash: Number(s.expected_cash),
      discrepancy: Number(s.discrepancy),
      discrepancy_percentage: Number(s.discrepancy_percentage),
      discrepancy_threshold: Number(s.discrepancy_threshold),
      is_unbalanced: Boolean(s.is_unbalanced),
      counted_denominations: typeof s.counted_denominations === 'string' 
        ? JSON.parse(s.counted_denominations) 
        : s.counted_denominations || {},
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error('Failed to list shifts:', err);
    res.status(500).json({ error: 'Αποτυχία ανάκτησης βαρδιών' });
  }
});

// 2. GET /api/v1/shifts/active - Get currently active shift for store & register
router.get('/active', authenticateToken, requirePermission('store.view'), async (req: AuthenticatedRequest, res) => {
  try {
    const { store_id, register_id = 'REG-01' } = req.query;
    if (!store_id) {
      return res.status(400).json({ error: 'Store ID is required' });
    }

    const activeShift = await queryOne<any>(
      `SELECT s.*, 
              st.name as store_name, st.code as store_code,
              u1.first_name || ' ' || u1.last_name as opened_by_user_name
       FROM shifts s
       JOIN stores st ON s.store_id = st.id
       LEFT JOIN users u1 ON s.opened_by_user_id = u1.id
       WHERE s.organization_id = $1 AND s.store_id = $2 AND s.register_id = $3
         AND s.status IN ('OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED')
       ORDER BY s.opened_at DESC LIMIT 1`,
      [req.organization?.id, store_id, register_id]
    );

    if (!activeShift) {
      return res.json(null);
    }

    res.json({
      ...activeShift,
      opening_cash: Number(activeShift.opening_cash),
      opap_gross_sales: Number(activeShift.opap_gross_sales),
      opap_payouts: Number(activeShift.opap_payouts),
      opap_net_sales: Number(activeShift.opap_net_sales),
      vlts_cash_in: Number(activeShift.vlts_cash_in),
      vlts_cash_out: Number(activeShift.vlts_cash_out),
      vlts_net: Number(activeShift.vlts_net),
      scratch_lotto_sales: Number(activeShift.scratch_lotto_sales),
      fnb_sales: Number(activeShift.fnb_sales),
      fnb_cash: Number(activeShift.fnb_cash),
      fnb_card: Number(activeShift.fnb_card),
      card_payments: Number(activeShift.card_payments),
      expenses_paid_cash: Number(activeShift.expenses_paid_cash),
      customer_credit_granted: Number(activeShift.customer_credit_granted),
      customer_credit_collected: Number(activeShift.customer_credit_collected),
      bank_deposits: Number(activeShift.bank_deposits),
      counted_cash: Number(activeShift.counted_cash),
      expected_cash: Number(activeShift.expected_cash),
      discrepancy: Number(activeShift.discrepancy),
      discrepancy_percentage: Number(activeShift.discrepancy_percentage),
      discrepancy_threshold: Number(activeShift.discrepancy_threshold),
      is_unbalanced: Boolean(activeShift.is_unbalanced),
      counted_denominations: typeof activeShift.counted_denominations === 'string'
        ? JSON.parse(activeShift.counted_denominations)
        : activeShift.counted_denominations || {},
    });
  } catch (err: any) {
    console.error('Failed to get active shift:', err);
    res.status(500).json({ error: 'Αποτυχία ελέγχου ενεργής βάρδιας' });
  }
});

// 3. GET /api/v1/shifts/:id - Get full shift details including expenses and credits
router.get('/:id', authenticateToken, requirePermission('store.view'), async (req: AuthenticatedRequest, res) => {
  try {
    const shift = await queryOne<any>(
      `SELECT s.*, 
              st.name as store_name, st.code as store_code,
              u1.first_name || ' ' || u1.last_name as opened_by_user_name,
              u2.first_name || ' ' || u2.last_name as closed_by_user_name
       FROM shifts s
       JOIN stores st ON s.store_id = st.id
       LEFT JOIN users u1 ON s.opened_by_user_id = u1.id
       LEFT JOIN users u2 ON s.closed_by_user_id = u2.id
       WHERE s.id = $1 AND s.organization_id = $2`,
      [req.params.id, req.organization?.id]
    );

    if (!shift) {
      return res.status(404).json({ error: 'Η βάρδια δεν βρέθηκε' });
    }

    const expenses = await query(
      `SELECT * FROM shift_expenses WHERE shift_id = $1 ORDER BY created_at ASC`,
      [shift.id]
    );

    const customerCredits = await query(
      `SELECT * FROM customer_credits WHERE shift_id = $1 ORDER BY created_at ASC`,
      [shift.id]
    );

    res.json({
      ...shift,
      opening_cash: Number(shift.opening_cash),
      opap_gross_sales: Number(shift.opap_gross_sales),
      opap_payouts: Number(shift.opap_payouts),
      opap_net_sales: Number(shift.opap_net_sales),
      vlts_cash_in: Number(shift.vlts_cash_in),
      vlts_cash_out: Number(shift.vlts_cash_out),
      vlts_net: Number(shift.vlts_net),
      scratch_lotto_sales: Number(shift.scratch_lotto_sales),
      fnb_sales: Number(shift.fnb_sales),
      fnb_cash: Number(shift.fnb_cash),
      fnb_card: Number(shift.fnb_card),
      card_payments: Number(shift.card_payments),
      expenses_paid_cash: Number(shift.expenses_paid_cash),
      customer_credit_granted: Number(shift.customer_credit_granted),
      customer_credit_collected: Number(shift.customer_credit_collected),
      bank_deposits: Number(shift.bank_deposits),
      counted_cash: Number(shift.counted_cash),
      expected_cash: Number(shift.expected_cash),
      discrepancy: Number(shift.discrepancy),
      discrepancy_percentage: Number(shift.discrepancy_percentage),
      discrepancy_threshold: Number(shift.discrepancy_threshold),
      is_unbalanced: Boolean(shift.is_unbalanced),
      counted_denominations: typeof shift.counted_denominations === 'string'
        ? JSON.parse(shift.counted_denominations)
        : shift.counted_denominations || {},
      expenses: expenses.map((e: any) => ({ ...e, amount: Number(e.amount) })),
      customer_credits: customerCredits.map((c: any) => ({ ...c, amount: Number(c.amount) })),
    });
  } catch (err: any) {
    console.error('Failed to get shift details:', err);
    res.status(500).json({ error: 'Αποτυχία ανάκτησης λεπτομερειών βάρδιας' });
  }
});

// 4. POST /api/v1/shifts/open - Open a new shift
router.post('/open', authenticateToken, requirePermission('shift.create'), async (req: AuthenticatedRequest, res) => {
  try {
    const {
      store_id,
      department_id,
      register_id = 'REG-01',
      shift_type = 'MORNING',
      opening_cash = 0,
      opening_operational_notes = '',
    } = req.body;

    if (!store_id) {
      return res.status(400).json({ error: 'Το κατάστημα είναι υποχρεωτικό.' });
    }

    // Check duplicate active shift for same store & register
    const existingActive = await queryOne<any>(
      `SELECT id, status FROM shifts 
       WHERE organization_id = $1 AND store_id = $2 AND register_id = $3
         AND status IN ('OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED')`,
      [req.organization?.id, store_id, register_id]
    );

    if (existingActive) {
      return res.status(400).json({
        error: 'Υπάρχει ήδη ανοικτή βάρδια στο συγκεκριμένο κατάστημα/ταμείο. Κλείστε την προηγούμενη βάρδια πρώτα.',
      });
    }

    const shiftId = 'shift_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const openingCashNum = safeNum(opening_cash);

    await execute(
      `INSERT INTO shifts (
        id, organization_id, store_id, department_id, register_id, shift_type, status,
        opened_by_user_id, opened_at, opening_cash, opening_operational_notes,
        expected_cash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10, $11)`,
      [
        shiftId,
        req.organization?.id,
        store_id,
        department_id || null,
        register_id,
        shift_type,
        'OPEN',
        req.user?.id,
        openingCashNum,
        opening_operational_notes,
        openingCashNum,
      ]
    );

    // Audit Log
    await execute(
      `INSERT INTO audit_logs (id, organization_id, user_id, user_email, action, entity_type, entity_id, after_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'audit_' + Date.now(),
        req.organization?.id,
        req.user?.id,
        req.user?.email,
        'SHIFT_OPENED',
        'SHIFT',
        shiftId,
        JSON.stringify({ store_id, register_id, shift_type, opening_cash: openingCashNum }),
      ]
    );

    res.status(201).json({ id: shiftId, message: 'Η βάρδια ανοίχτηκε επιτυχώς' });
  } catch (err: any) {
    console.error('Failed to open shift:', err);
    res.status(500).json({ error: 'Αποτυχία ανοίγματος βάρδιας' });
  }
});

// 5. PUT /api/v1/shifts/:id/draft - Draft autosave for shift closing wizard
router.put('/:id/draft', authenticateToken, requirePermission('shift.create'), async (req: AuthenticatedRequest, res) => {
  try {
    const shift = await queryOne<any>(
      `SELECT * FROM shifts WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.organization?.id]
    );

    if (!shift) {
      return res.status(404).json({ error: 'Η βάρδια δεν βρέθηκε' });
    }

    if (shift.status === 'SUBMITTED' || shift.status === 'APPROVED') {
      return res.status(400).json({
        error: 'Η υποβληθείσα βάρδια είναι αμετάβλητη και δεν μπορεί να τροποποιηθεί.',
      });
    }

    const body = req.body;
    const opapGross = safeNum(body.opap_gross_sales);
    const opapPayouts = safeNum(body.opap_payouts);
    const opapNet = opapGross - opapPayouts;

    const vltsIn = safeNum(body.vlts_cash_in);
    const vltsOut = safeNum(body.vlts_cash_out);
    const vltsNet = vltsIn - vltsOut;

    const scratchLotto = safeNum(body.scratch_lotto_sales);
    const fnbSales = safeNum(body.fnb_sales);
    const fnbCash = safeNum(body.fnb_cash);
    const fnbCard = safeNum(body.fnb_card);
    const cardPayments = safeNum(body.card_payments);
    const expensesCash = safeNum(body.expenses_paid_cash);
    const creditGranted = safeNum(body.customer_credit_granted);
    const creditCollected = safeNum(body.customer_credit_collected);
    const bankDeposits = safeNum(body.bank_deposits);

    const countedDenominations = body.counted_denominations || {};
    const countedCash = calculateCountedCash(countedDenominations);

    const expectedCash = calculateExpectedCash({
      opening_cash: shift.opening_cash,
      opap_gross_sales: opapGross,
      opap_payouts: opapPayouts,
      vlts_cash_in: vltsIn,
      vlts_cash_out: vltsOut,
      scratch_lotto_sales: scratchLotto,
      fnb_cash: fnbCash,
      customer_credit_collected: creditCollected,
      card_payments: cardPayments,
      expenses_paid_cash: expensesCash,
      customer_credit_granted: creditGranted,
      bank_deposits: bankDeposits,
    });

    const disc = calculateDiscrepancy(countedCash, expectedCash, body.discrepancy_threshold || 10.0);

    await execute(
      `UPDATE shifts SET
        status = 'DRAFT_CLOSING',
        opap_gross_sales = $1, opap_payouts = $2, opap_net_sales = $3,
        vlts_cash_in = $4, vlts_cash_out = $5, vlts_net = $6,
        scratch_lotto_sales = $7, fnb_sales = $8, fnb_cash = $9, fnb_card = $10,
        card_payments = $11, expenses_paid_cash = $12, customer_credit_granted = $13,
        customer_credit_collected = $14, bank_deposits = $15,
        counted_denominations = $16, counted_cash = $17, expected_cash = $18,
        discrepancy = $19, discrepancy_percentage = $20, is_unbalanced = $21,
        employee_notes = $22, updated_at = CURRENT_TIMESTAMP
       WHERE id = $23`,
      [
        opapGross, opapPayouts, opapNet,
        vltsIn, vltsOut, vltsNet,
        scratchLotto, fnbSales, fnbCash, fnbCard,
        cardPayments, expensesCash, creditGranted,
        creditCollected, bankDeposits,
        JSON.stringify(countedDenominations), countedCash, expectedCash,
        disc.discrepancy, disc.discrepancyPercentage, disc.isUnbalanced,
        body.employee_notes || null,
        shift.id,
      ]
    );

    res.json({ message: 'Πρόχειρη αποθήκευση βάρδιας επιτυχής' });
  } catch (err: any) {
    console.error('Failed to save draft shift:', err);
    res.status(500).json({ error: 'Αποτυχία αποθήκευσης προχείρου' });
  }
});

// 6. POST /api/v1/shifts/:id/submit - Final submission of shift (becomes immutable for employee)
router.post('/:id/submit', authenticateToken, requirePermission('shift.submit'), async (req: AuthenticatedRequest, res) => {
  try {
    const shift = await queryOne<any>(
      `SELECT * FROM shifts WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.organization?.id]
    );

    if (!shift) {
      return res.status(404).json({ error: 'Η βάρδια δεν βρέθηκε' });
    }

    // Duplicate submission / immutability enforcement check
    if (shift.status === 'SUBMITTED' || shift.status === 'APPROVED') {
      return res.status(400).json({
        error: 'Η βάρδια έχει υποβληθεί ήδη και είναι πλέον αμετάβλητη για τον υπάλληλο.',
      });
    }

    const body = req.body;
    const opapGross = safeNum(body.opap_gross_sales);
    const opapPayouts = safeNum(body.opap_payouts);
    const opapNet = opapGross - opapPayouts;

    const vltsIn = safeNum(body.vlts_cash_in);
    const vltsOut = safeNum(body.vlts_cash_out);
    const vltsNet = vltsIn - vltsOut;

    const scratchLotto = safeNum(body.scratch_lotto_sales);
    const fnbSales = safeNum(body.fnb_sales);
    const fnbCash = safeNum(body.fnb_cash);
    const fnbCard = safeNum(body.fnb_card);
    const cardPayments = safeNum(body.card_payments);
    const expensesCash = safeNum(body.expenses_paid_cash);
    const creditGranted = safeNum(body.customer_credit_granted);
    const creditCollected = safeNum(body.customer_credit_collected);
    const bankDeposits = safeNum(body.bank_deposits);

    const countedDenominations = body.counted_denominations || {};
    const countedCash = calculateCountedCash(countedDenominations);

    const expectedCash = calculateExpectedCash({
      opening_cash: shift.opening_cash,
      opap_gross_sales: opapGross,
      opap_payouts: opapPayouts,
      vlts_cash_in: vltsIn,
      vlts_cash_out: vltsOut,
      scratch_lotto_sales: scratchLotto,
      fnb_cash: fnbCash,
      customer_credit_collected: creditCollected,
      card_payments: cardPayments,
      expenses_paid_cash: expensesCash,
      customer_credit_granted: creditGranted,
      bank_deposits: bankDeposits,
    });

    const threshold = safeNum(body.discrepancy_threshold) || 10.0;
    const disc = calculateDiscrepancy(countedCash, expectedCash, threshold);

    // Save associated expenses array if present
    if (Array.isArray(body.expenses)) {
      // Clear old shift expenses first
      await execute(`DELETE FROM shift_expenses WHERE shift_id = $1`, [shift.id]);
      for (const exp of body.expenses) {
        if (safeNum(exp.amount) > 0) {
          const expId = 'exp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
          await execute(
            `INSERT INTO shift_expenses (
              id, shift_id, organization_id, store_id, category, amount, payment_method, description, receipt_url, created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              expId, shift.id, req.organization?.id, shift.store_id,
              exp.category || 'OTHER', safeNum(exp.amount), exp.payment_method || 'CASH',
              exp.description || 'Έξοδο βάρδιας', exp.receipt_url || null, req.user?.id
            ]
          );
        }
      }
    }

    // Save associated customer credits array if present
    if (Array.isArray(body.customer_credits)) {
      await execute(`DELETE FROM customer_credits WHERE shift_id = $1`, [shift.id]);
      for (const cred of body.customer_credits) {
        if (safeNum(cred.amount) > 0) {
          const credId = 'cred_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
          await execute(
            `INSERT INTO customer_credits (
              id, shift_id, organization_id, store_id, customer_name, type, amount, notes, created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              credId, shift.id, req.organization?.id, shift.store_id,
              cred.customer_name || 'Πελάτης', cred.type || 'GRANTED',
              safeNum(cred.amount), cred.notes || null, req.user?.id
            ]
          );
        }
      }
    }

    // Final Immutable Status Update
    await execute(
      `UPDATE shifts SET
        status = 'SUBMITTED',
        closed_by_user_id = $1,
        closed_at = CURRENT_TIMESTAMP,
        opap_gross_sales = $2, opap_payouts = $3, opap_net_sales = $4,
        vlts_cash_in = $5, vlts_cash_out = $6, vlts_net = $7,
        scratch_lotto_sales = $8, fnb_sales = $9, fnb_cash = $10, fnb_card = $11,
        card_payments = $12, expenses_paid_cash = $13, customer_credit_granted = $14,
        customer_credit_collected = $15, bank_deposits = $16,
        counted_denominations = $17, counted_cash = $18, expected_cash = $19,
        discrepancy = $20, discrepancy_percentage = $21, discrepancy_threshold = $22,
        is_unbalanced = $23, employee_notes = $24, updated_at = CURRENT_TIMESTAMP
       WHERE id = $25`,
      [
        req.user?.id,
        opapGross, opapPayouts, opapNet,
        vltsIn, vltsOut, vltsNet,
        scratchLotto, fnbSales, fnbCash, fnbCard,
        cardPayments, expensesCash, creditGranted,
        creditCollected, bankDeposits,
        JSON.stringify(countedDenominations), countedCash, expectedCash,
        disc.discrepancy, disc.discrepancyPercentage, threshold,
        disc.isUnbalanced, body.employee_notes || null,
        shift.id,
      ]
    );

    // Audit Log
    await execute(
      `INSERT INTO audit_logs (id, organization_id, user_id, user_email, action, entity_type, entity_id, after_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'audit_' + Date.now(),
        req.organization?.id,
        req.user?.id,
        req.user?.email,
        'SHIFT_SUBMITTED',
        'SHIFT',
        shift.id,
        JSON.stringify({
          countedCash,
          expectedCash,
          discrepancy: disc.discrepancy,
          isUnbalanced: disc.isUnbalanced,
        }),
      ]
    );

    res.json({ message: 'Η βάρδια υποβλήθηκε επιτυχώς και κατοχυρώθηκε' });
  } catch (err: any) {
    console.error('Failed to submit shift:', err);
    res.status(500).json({ error: 'Αποτυχία υποβολής βάρδιας' });
  }
});

// 7. POST /api/v1/shifts/:id/approve - Approve shift (Manager/Owner)
router.post('/:id/approve', authenticateToken, requirePermission('shift.approve'), async (req: AuthenticatedRequest, res) => {
  try {
    const shift = await queryOne<any>(
      `SELECT * FROM shifts WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.organization?.id]
    );

    if (!shift) {
      return res.status(404).json({ error: 'Η βάρδια δεν βρέθηκε' });
    }

    const { manager_notes } = req.body;

    await execute(
      `UPDATE shifts SET status = 'APPROVED', manager_notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [manager_notes || null, shift.id]
    );

    await execute(
      `INSERT INTO audit_logs (id, organization_id, user_id, user_email, action, entity_type, entity_id, after_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'audit_' + Date.now(),
        req.organization?.id,
        req.user?.id,
        req.user?.email,
        'SHIFT_APPROVED',
        'SHIFT',
        shift.id,
        JSON.stringify({ manager_notes }),
      ]
    );

    res.json({ message: 'Η βάρδια εγκρίθηκε επιτυχώς' });
  } catch (err: any) {
    console.error('Failed to approve shift:', err);
    res.status(500).json({ error: 'Αποτυχία έγκρισης βάρδιας' });
  }
});

// 8. POST /api/v1/shifts/:id/reopen - Manager requests correction or reopens shift
router.post('/:id/reopen', authenticateToken, requirePermission('shift.reopen'), async (req: AuthenticatedRequest, res) => {
  try {
    const shift = await queryOne<any>(
      `SELECT * FROM shifts WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.organization?.id]
    );

    if (!shift) {
      return res.status(404).json({ error: 'Η βάρδια δεν βρέθηκε' });
    }

    const { manager_notes, action_type = 'CORRECTION' } = req.body;

    if (!manager_notes) {
      return res.status(400).json({ error: 'Απαιτείται αιτιολογία για το επανάννοιγμα/διόρθωση.' });
    }

    const newStatus = action_type === 'REOPEN' ? 'REOPENED' : 'CORRECTION_REQUESTED';

    await execute(
      `UPDATE shifts SET 
        status = $1, manager_notes = $2, reopened_by_user_id = $3, reopened_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [newStatus, manager_notes, req.user?.id, shift.id]
    );

    await execute(
      `INSERT INTO audit_logs (id, organization_id, user_id, user_email, action, entity_type, entity_id, before_state, after_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        'audit_' + Date.now(),
        req.organization?.id,
        req.user?.id,
        req.user?.email,
        'SHIFT_REOPENED',
        'SHIFT',
        shift.id,
        JSON.stringify({ previous_status: shift.status }),
        JSON.stringify({ new_status: newStatus, manager_notes }),
      ]
    );

    res.json({ message: 'Η αίτηση διόρθωσης/επανενεργοποίησης καταχωρήθηκε' });
  } catch (err: any) {
    console.error('Failed to reopen shift:', err);
    res.status(500).json({ error: 'Αποτυχία επανενεργοποίησης βάρδιας' });
  }
});

export default router;
