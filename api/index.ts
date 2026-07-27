import express from 'express';
import auditRoutes from '../src/server/routes/audit.js';
import authRoutes from '../src/server/routes/auth.js';
import orgsRoutes from '../src/server/routes/orgs.js';
import shiftsRoutes from '../src/server/routes/shifts.js';
import storesRoutes from '../src/server/routes/stores.js';
import usersRoutes from '../src/server/routes/users.js';
import notificationsRoutes from '../src/server/routes/notifications.js';

const app = express();
app.use(express.json());

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', service: 'ShiftLedger Engine (Vercel)', version: '1.0.0-phase1' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/orgs', orgsRoutes);
app.use('/api/v1/stores', storesRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/shifts', shiftsRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/notifications', notificationsRoutes);

export default app;
