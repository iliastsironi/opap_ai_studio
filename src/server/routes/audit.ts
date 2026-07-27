import { Router } from 'express';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { getAuditLogs } from '../services/auditService.js';

const router = Router();

// GET /api/v1/audit - List audit logs for current organization
router.get('/', authenticateToken, requirePermission('audit.view'), async (req: AuthenticatedRequest, res) => {
  try {
    const org = req.organization!;
    const limit = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);

    const logs = await getAuditLogs(org.id, limit, offset);
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: 'Σφάλμα ανάκτησης καταγραφών ελέγχου: ' + err.message });
  }
});

export default router;
