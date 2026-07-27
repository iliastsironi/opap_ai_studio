import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../../db/index.js';
import { Organization } from '../../types/index.js';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { logAuditEvent } from '../services/auditService.js';

const router = Router();

const createOrgSchema = z.object({
  legal_name: z.string().min(2),
  trade_name: z.string().min(2),
  vat_number: z.string().min(8),
  tax_office: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  timezone: z.string().default('Europe/Athens'),
  currency: z.string().default('EUR'),
  initial_store_name: z.string().min(2),
  initial_store_code: z.string().min(2),
  initial_store_type: z.enum(['OPAP_AGENCY', 'PLAY_STORE', 'OPAP_FNB', 'GAMING_HALL', 'RETAIL']),
});

// POST /api/v1/orgs - Create new Organization (Onboarding)
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const parse = createOrgSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Μη έγκυρα στοιχεία οργανισμού', details: parse.error.format() });
    }

    const data = parse.data;
    const user = req.user!;

    // Check if VAT number already exists
    const existingOrg = await queryOne('SELECT id FROM organizations WHERE vat_number = $1', [data.vat_number]);
    if (existingOrg) {
      return res.status(400).json({ error: 'Ο ΑΦΜ χρησιμοποιείται ήδη από άλλον οργανισμό' });
    }

    const orgId = 'org_' + crypto.randomUUID();
    await execute(
      `INSERT INTO organizations (id, legal_name, trade_name, vat_number, tax_office, address, phone, email, timezone, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        orgId,
        data.legal_name,
        data.trade_name,
        data.vat_number,
        data.tax_office || null,
        data.address || null,
        data.phone || null,
        data.email || null,
        data.timezone,
        data.currency,
      ]
    );

    // Create Initial Store
    const storeId = 'store_' + crypto.randomUUID();
    await execute(
      `INSERT INTO stores (id, organization_id, code, name, store_type, address, phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        storeId,
        orgId,
        data.initial_store_code,
        data.initial_store_name,
        data.initial_store_type,
        data.address || null,
        data.phone || null,
        true,
      ]
    );

    // Create default OPAP department for store
    const deptId = 'dept_' + crypto.randomUUID();
    await execute(
      `INSERT INTO departments (id, organization_id, store_id, code, name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [deptId, orgId, storeId, 'OPAP', 'Τμήμα Παιχνιδιών ΟΠΑΠ', true]
    );

    // Assign Creator as ORG_OWNER
    const ownerRole = await queryOne<{ id: string }>('SELECT id FROM roles WHERE code = $1 AND is_system = true', [
      'ORG_OWNER',
    ]);
    if (ownerRole) {
      await execute(
        `INSERT INTO user_organization_roles (id, user_id, organization_id, role_id)
         VALUES ($1, $2, $3, $4)`,
        ['uor_' + crypto.randomUUID(), user.id, orgId, ownerRole.id]
      );
    }

    // Assign Creator to Initial Store
    await execute(
      `INSERT INTO user_store_assignments (id, user_id, organization_id, store_id, department_id, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['usa_' + crypto.randomUUID(), user.id, orgId, storeId, deptId, true]
    );

    // Audit Log
    await logAuditEvent({
      organizationId: orgId,
      userId: user.id,
      userEmail: user.email,
      action: 'ORGANIZATION_CREATED',
      entityType: 'ORGANIZATION',
      entityId: orgId,
      afterState: data,
    });

    const newOrg = await queryOne<Organization>('SELECT * FROM organizations WHERE id = $1', [orgId]);
    return res.status(201).json({ organization: newOrg, initialStoreId: storeId });
  } catch (err: any) {
    console.error('Error creating organization:', err);
    return res.status(500).json({ error: 'Σφάλμα κατά δημιουργία οργανισμού: ' + err.message });
  }
});

// GET /api/v1/orgs/current - Get current organization profile
router.get('/current', authenticateToken, async (req: AuthenticatedRequest, res) => {
  if (!req.organization) {
    return res.status(404).json({ error: 'Δεν βρέθηκε ενεργός οργανισμός' });
  }
  return res.json(req.organization);
});

// PUT /api/v1/orgs/current - Update current organization settings
router.put('/current', authenticateToken, requirePermission('org.settings'), async (req: AuthenticatedRequest, res) => {
  try {
    const org = req.organization!;
    const { legal_name, trade_name, tax_office, address, phone, email } = req.body;

    await execute(
      `UPDATE organizations 
       SET legal_name = COALESCE($1, legal_name),
           trade_name = COALESCE($2, trade_name),
           tax_office = COALESCE($3, tax_office),
           address = COALESCE($4, address),
           phone = COALESCE($5, phone),
           email = COALESCE($6, email),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [legal_name, trade_name, tax_office, address, phone, email, org.id]
    );

    await logAuditEvent({
      organizationId: org.id,
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'ORGANIZATION_UPDATED',
      entityType: 'ORGANIZATION',
      entityId: org.id,
      beforeState: org as any,
      afterState: req.body,
    });

    const updated = await queryOne<Organization>('SELECT * FROM organizations WHERE id = $1', [org.id]);
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: 'Σφάλμα ενημέρωσης οργανισμού: ' + err.message });
  }
});

export default router;
