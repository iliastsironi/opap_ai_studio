import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../../db/index.js';
import { Permission, Role, User } from '../../types/index.js';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { logAuditEvent } from '../services/auditService.js';

const router = Router();

const inviteUserSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
  employee_code: z.string().optional(),
  role_code: z.string().min(1),
  store_ids: z.array(z.string()).min(1),
});

// GET /api/v1/users - List users in organization
router.get('/', authenticateToken, requirePermission('users.view'), async (req: AuthenticatedRequest, res) => {
  try {
    const org = req.organization!;

    const users = await query<User>(
      `SELECT DISTINCT u.id, u.email, u.first_name, u.last_name, u.phone, u.employee_code, u.status, u.last_login_at, u.created_at
       FROM users u
       JOIN user_organization_roles uor ON uor.user_id = u.id
       WHERE uor.organization_id = $1
       ORDER BY u.created_at DESC`,
      [org.id]
    );

    // Attach roles and store assignments for each user
    const result = [];
    for (const u of users) {
      const userRoles = await query<Role>(
        `SELECT r.* FROM roles r
         JOIN user_organization_roles uor ON uor.role_id = r.id
         WHERE uor.user_id = $1 AND uor.organization_id = $2`,
        [u.id, org.id]
      );

      const assignedStores = await query(
        `SELECT usa.*, s.name as store_name, s.code as store_code
         FROM user_store_assignments usa
         JOIN stores s ON s.id = usa.store_id
         WHERE usa.user_id = $1 AND usa.organization_id = $2`,
        [u.id, org.id]
      );

      result.push({
        ...u,
        roles: userRoles,
        assigned_stores: assignedStores,
      });
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'Σφάλμα ανάκτησης χρηστών: ' + err.message });
  }
});

// POST /api/v1/users/invite - Invite/Create user in organization
router.post('/invite', authenticateToken, requirePermission('users.manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const parse = inviteUserSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Μη έγκυρα στοιχεία πρόσκλησης χρήστη', details: parse.error.format() });
    }

    const org = req.organization!;
    const data = parse.data;

    // Find role
    const role = await queryOne<Role>('SELECT * FROM roles WHERE code = $1', [data.role_code]);
    if (!role) {
      return res.status(400).json({ error: 'Ο επιλεγμένος ρόλος δεν υπάρχει' });
    }

    // Check if user exists
    let user = await queryOne<User>('SELECT * FROM users WHERE email = $1', [data.email.toLowerCase().trim()]);
    let userId = user?.id;

    if (!user) {
      userId = 'usr_' + crypto.randomUUID();
      const defaultPasswordHash = await bcrypt.hash('ShiftLedger2026!', 10);

      await execute(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, phone, employee_code, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          data.email.toLowerCase().trim(),
          defaultPasswordHash,
          data.first_name,
          data.last_name,
          data.phone || null,
          data.employee_code || null,
          'ACTIVE',
        ]
      );
    }

    // Assign Role in Org
    const existingUor = await queryOne(
      'SELECT id FROM user_organization_roles WHERE user_id = $1 AND organization_id = $2 AND role_id = $3',
      [userId, org.id, role.id]
    );

    if (!existingUor) {
      await execute(
        `INSERT INTO user_organization_roles (id, user_id, organization_id, role_id)
         VALUES ($1, $2, $3, $4)`,
        ['uor_' + crypto.randomUUID(), userId, org.id, role.id]
      );
    }

    // Assign Stores
    for (let i = 0; i < data.store_ids.length; i++) {
      const storeId = data.store_ids[i];
      const existingUsa = await queryOne(
        'SELECT id FROM user_store_assignments WHERE user_id = $1 AND organization_id = $2 AND store_id = $3',
        [userId, org.id, storeId]
      );

      if (!existingUsa) {
        await execute(
          `INSERT INTO user_store_assignments (id, user_id, organization_id, store_id, is_primary)
           VALUES ($1, $2, $3, $4, $5)`,
          ['usa_' + crypto.randomUUID(), userId, org.id, storeId, i === 0]
        );
      }
    }

    await logAuditEvent({
      organizationId: org.id,
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'USER_INVITED',
      entityType: 'USER',
      entityId: userId,
      afterState: { email: data.email, role_code: data.role_code, stores: data.store_ids },
    });

    const invitedUser = await queryOne<User>('SELECT id, email, first_name, last_name, status FROM users WHERE id = $1', [
      userId,
    ]);
    return res.status(201).json(invitedUser);
  } catch (err: any) {
    return res.status(500).json({ error: 'Σφάλμα πρόσκλησης χρήστη: ' + err.message });
  }
});

// GET /api/v1/users/roles - List available roles
router.get('/roles', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const roles = await query<Role>('SELECT * FROM roles ORDER BY is_system DESC, name ASC');
    return res.json(roles);
  } catch (err: any) {
    return res.status(500).json({ error: 'Σφάλμα ανάκτησης ρόλων: ' + err.message });
  }
});

// GET /api/v1/users/permissions - List available permissions
router.get('/permissions', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const permissions = await query<Permission>('SELECT * FROM permissions ORDER BY module ASC, code ASC');
    return res.json(permissions);
  } catch (err: any) {
    return res.status(500).json({ error: 'Σφάλμα ανάκτησης δικαιωμάτων: ' + err.message });
  }
});

export default router;
