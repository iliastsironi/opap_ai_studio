import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../../db/index.js';
import { Department, Store } from '../../types/index.js';
import { authenticateToken, AuthenticatedRequest, requirePermission, requireStoreAccess } from '../middleware/auth.js';
import { logAuditEvent } from '../services/auditService.js';

const router = Router();

const createStoreSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  store_type: z.enum(['OPAP_AGENCY', 'PLAY_STORE', 'OPAP_FNB', 'GAMING_HALL', 'RETAIL']),
  address: z.string().optional(),
  phone: z.string().optional(),
  operating_hours: z.string().optional(),
});

// GET /api/v1/stores - List organization stores accessible to current user
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const org = req.organization;
    if (!org) {
      return res.status(400).json({ error: 'Δεν βρέθηκε οργανισμός' });
    }

    const isOwnerOrAdmin = req.roles?.some(
      (r) => r.code === 'ORG_OWNER' || r.code === 'PLATFORM_ADMIN'
    );

    let stores: Store[] = [];

    if (isOwnerOrAdmin) {
      stores = await query<Store>(
        'SELECT * FROM stores WHERE organization_id = $1 ORDER BY code ASC',
        [org.id]
      );
    } else {
      const assignedStoreIds = (req.assignedStores || []).map((a) => a.store_id);
      if (assignedStoreIds.length === 0) {
        return res.json([]);
      }
      stores = await query<Store>(
        'SELECT * FROM stores WHERE organization_id = $1 AND id = ANY($2) ORDER BY code ASC',
        [org.id, assignedStoreIds]
      );
    }

    return res.json(stores);
  } catch (err: any) {
    return res.status(500).json({ error: 'Σφάλμα ανάκτησης καταστημάτων: ' + err.message });
  }
});

// POST /api/v1/stores - Create new store
router.post('/', authenticateToken, requirePermission('store.manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const parse = createStoreSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Μη έγκυρα στοιχεία καταστήματος', details: parse.error.format() });
    }

    const org = req.organization!;
    const data = parse.data;

    // Check code uniqueness in organization
    const existingCode = await queryOne('SELECT id FROM stores WHERE organization_id = $1 AND code = $2', [
      org.id,
      data.code,
    ]);
    if (existingCode) {
      return res.status(400).json({ error: 'Ο κωδικός καταστήματος χρησιμοποιείται ήδη στον οργανισμό' });
    }

    const storeId = 'store_' + crypto.randomUUID();
    await execute(
      `INSERT INTO stores (id, organization_id, code, name, store_type, address, phone, operating_hours, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        storeId,
        org.id,
        data.code,
        data.name,
        data.store_type,
        data.address || null,
        data.phone || null,
        data.operating_hours || null,
        true,
      ]
    );

    // Create default OPAP Department
    const deptId = 'dept_' + crypto.randomUUID();
    await execute(
      `INSERT INTO departments (id, organization_id, store_id, code, name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [deptId, org.id, storeId, 'OPAP', 'Τμήμα Παιχνιδιών ΟΠΑΠ', true]
    );

    await logAuditEvent({
      organizationId: org.id,
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'STORE_CREATED',
      entityType: 'STORE',
      entityId: storeId,
      afterState: data,
    });

    const newStore = await queryOne<Store>('SELECT * FROM stores WHERE id = $1', [storeId]);
    return res.status(201).json(newStore);
  } catch (err: any) {
    return res.status(500).json({ error: 'Σφάλμα δημιουργίας καταστήματος: ' + err.message });
  }
});

// GET /api/v1/stores/:id/departments - List departments for a store
router.get('/:id/departments', authenticateToken, requireStoreAccess('id'), async (req: AuthenticatedRequest, res) => {
  try {
    const storeId = req.params.id;
    const depts = await query<Department>(
      'SELECT * FROM departments WHERE store_id = $1 AND is_active = true ORDER BY code ASC',
      [storeId]
    );
    return res.json(depts);
  } catch (err: any) {
    return res.status(500).json({ error: 'Σφάλμα ανάκτησης τμημάτων: ' + err.message });
  }
});

// POST /api/v1/stores/:id/departments - Create department for store
router.post(
  '/:id/departments',
  authenticateToken,
  requirePermission('department.manage'),
  requireStoreAccess('id'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const storeId = req.params.id;
      const org = req.organization!;
      const { code, name } = req.body;

      if (!code || !name) {
        return res.status(400).json({ error: 'Απαιτούνται κωδικός και όνομα τμήματος' });
      }

      const deptId = 'dept_' + crypto.randomUUID();
      await execute(
        `INSERT INTO departments (id, organization_id, store_id, code, name, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [deptId, org.id, storeId, code, name, true]
      );

      const dept = await queryOne<Department>('SELECT * FROM departments WHERE id = $1', [deptId]);
      return res.status(201).json(dept);
    } catch (err: any) {
      return res.status(500).json({ error: 'Σφάλμα δημιουργίας τμήματος: ' + err.message });
    }
  }
);

export default router;
