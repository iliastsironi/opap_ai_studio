import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../../db/index.js';
import { Organization, Role, User, UserStoreAssignment } from '../../types/index.js';
import { authenticateToken, AuthenticatedRequest, generateToken } from '../middleware/auth.js';
import { logAuditEvent } from '../services/auditService.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const parseRes = loginSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({ error: 'Μη έγκυρο email ή κωδικός πρόσβασης' });
    }

    const { email, password } = parseRes.data;

    const user = await queryOne<User>(
      'SELECT id, email, password_hash, first_name, last_name, phone, employee_code, status FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Εσφαλμένα διαπιστευτήρια ή απενεργοποιημένος λογαριασμός' });
    }

    const isMatch = await bcrypt.compare(password, (user as any).password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Εσφαλμένο email ή κωδικός πρόσβασης' });
    }

    // Update last login timestamp
    await execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Get default organization
    const uor = await queryOne<{ organization_id: string }>(
      'SELECT organization_id FROM user_organization_roles WHERE user_id = $1 LIMIT 1',
      [user.id]
    );

    let organization: Organization | null = null;
    let roles: Role[] = [];
    let permissions: string[] = [];
    let assignedStores: UserStoreAssignment[] = [];

    if (uor?.organization_id) {
      organization = await queryOne<Organization>('SELECT * FROM organizations WHERE id = $1', [
        uor.organization_id,
      ]);

      if (organization) {
        roles = await query<Role>(
          `SELECT r.* FROM roles r
           JOIN user_organization_roles uor ON uor.role_id = r.id
           WHERE uor.user_id = $1 AND uor.organization_id = $2`,
          [user.id, organization.id]
        );

        const roleIds = roles.map((r) => r.id);
        if (roleIds.length > 0) {
          const permsRows = await query<{ permission_code: string }>(
            `SELECT DISTINCT permission_code FROM role_permissions WHERE role_id = ANY($1)`,
            [roleIds]
          );
          permissions = permsRows.map((p) => p.permission_code);
        }

        assignedStores = await query<UserStoreAssignment>(
          `SELECT usa.*, s.name as store_name, s.code as store_code, d.name as department_name
           FROM user_store_assignments usa
           JOIN stores s ON s.id = usa.store_id
           LEFT JOIN departments d ON d.id = usa.department_id
           WHERE usa.user_id = $1 AND usa.organization_id = $2`,
          [user.id, organization.id]
        );
      }
    }

    const token = generateToken({ userId: user.id, organizationId: organization?.id });

    // Audit log
    await logAuditEvent({
      organizationId: organization?.id,
      userId: user.id,
      userEmail: user.email,
      action: 'USER_LOGIN',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const { password_hash, ...userClean } = user as any;

    return res.json({
      token,
      user: userClean,
      organization,
      roles,
      permissions,
      assigned_stores: assignedStores,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Σφάλμα κατά τη σύνδεση: ' + err.message });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  return res.json({
    user: req.user,
    organization: req.organization,
    roles: req.roles || [],
    permissions: req.permissions || [],
    assigned_stores: req.assignedStores || [],
  });
});

export default router;
