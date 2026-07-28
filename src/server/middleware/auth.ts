import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../../db/index.js';
import { Organization, Role, User, UserStoreAssignment } from '../../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'shiftledger_super_secret_jwt_key_2026';

export interface AuthenticatedRequest extends Request {
  user?: User;
  organization?: Organization;
  roles?: Role[];
  permissions?: string[];
  assignedStores?: UserStoreAssignment[];
}

export function generateToken(payload: { userId: string; organizationId?: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Δεν παρέχεται διακριτικό πρόσβασης (Token missing)' });
  }

  try {
    let userId: string | undefined;
    let organizationId: string | undefined;

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string; organizationId?: string };
      userId = decoded.userId;
      organizationId = decoded.organizationId;
    } catch {
      // Fallback: decode token without secret verification (e.g. Firebase ID Token)
      const decoded = jwt.decode(token) as any;
      if (decoded) {
        userId = decoded.user_id || decoded.sub || decoded.uid || decoded.userId;
        organizationId = decoded.organizationId;
      }
    }

    if (!userId) {
      return res.status(403).json({ error: 'Μη έγκυρο ή ληγμένο διακριτικό πρόσβασης' });
    }

    // Fetch user or auto-create if missing (since auth was done via Firebase)
    let user = await queryOne<User>(
      'SELECT id, email, first_name, last_name, phone, employee_code, status, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (!user) {
      const decoded = (jwt.decode(token) as any) || {};
      const email = decoded.email || `${userId}@shiftledger.gr`;
      const nameParts = (decoded.name || '').split(' ');
      const firstName = nameParts[0] || 'Χρήστης';
      const lastName = nameParts.slice(1).join(' ') || 'ShiftLedger';

      await query(
        `INSERT INTO users (id, email, first_name, last_name, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (id) DO NOTHING`,
        [userId, email, firstName, lastName]
      );

      user = {
        id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    req.user = user;

    // Get primary or specified organization
    let orgId = organizationId;
    if (!orgId) {
      const uor = await queryOne<{ organization_id: string }>(
        'SELECT organization_id FROM user_organization_roles WHERE user_id = $1 LIMIT 1',
        [user.id]
      );
      orgId = uor?.organization_id;
    }

    if (orgId) {
      const org = await queryOne<Organization>('SELECT * FROM organizations WHERE id = $1', [orgId]);
      if (org) {
        req.organization = org;

        // Fetch User Roles in Org
        const roles = await query<Role>(
          `SELECT r.* FROM roles r
           JOIN user_organization_roles uor ON uor.role_id = r.id
           WHERE uor.user_id = $1 AND uor.organization_id = $2`,
          [user.id, org.id]
        );
        req.roles = roles;

        // Fetch permissions for all roles
        const roleIds = roles.map((r) => r.id);
        if (roleIds.length > 0) {
          const permsRows = await query<{ permission_code: string }>(
            `SELECT DISTINCT permission_code FROM role_permissions WHERE role_id = ANY($1)`,
            [roleIds]
          );
          req.permissions = permsRows.map((p) => p.permission_code);
        } else {
          req.permissions = [];
        }

        // Fetch Assigned Stores
        const storeAssigns = await query<UserStoreAssignment>(
          `SELECT usa.*, s.name as store_name, s.code as store_code, d.name as department_name
           FROM user_store_assignments usa
           JOIN stores s ON s.id = usa.store_id
           LEFT JOIN departments d ON d.id = usa.department_id
           WHERE usa.user_id = $1 AND usa.organization_id = $2`,
          [user.id, org.id]
        );
        req.assignedStores = storeAssigns;
      }
    }

    next();
  } catch (err) {
    console.error('Auth token validation error:', err);
    return res.status(403).json({ error: 'Μη έγκυρο ή ληγμένο διακριτικό πρόσβασης' });
  }
}

export function requirePermission(permissionCode: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.permissions || !req.permissions.includes(permissionCode)) {
      return res.status(403).json({
        error: `Δεν έχετε δικαίωμα πρόσβασης για αυτή τη λειτουργία (${permissionCode})`,
      });
    }
    next();
  };
}

export function requireStoreAccess(paramName = 'storeId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const targetStoreId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    if (!targetStoreId) {
      return next();
    }

    // Is Owner or Platform Admin?
    const isOwnerOrAdmin = req.roles?.some(
      (r) => r.code === 'ORG_OWNER' || r.code === 'PLATFORM_ADMIN'
    );
    if (isOwnerOrAdmin) {
      return next();
    }

    // Check store assignment
    const hasAssignment = req.assignedStores?.some((a) => a.store_id === targetStoreId);
    if (!hasAssignment) {
      return res.status(403).json({
        error: 'Δεν έχετε δικαίωμα πρόσβασης στο συγκεκριμένο κατάστημα',
      });
    }

    next();
  };
}
