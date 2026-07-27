import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getDb } from './src/db/index.js';
import { seedDatabase } from './src/db/seed.js';
import auditRoutes from './src/server/routes/audit.js';
import authRoutes from './src/server/routes/auth.js';
import orgsRoutes from './src/server/routes/orgs.js';
import shiftsRoutes from './src/server/routes/shifts.js';
import storesRoutes from './src/server/routes/stores.js';
import usersRoutes from './src/server/routes/users.js';
import notificationsRoutes from './src/server/routes/notifications.js';


async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize DB and Seed Data
  try {
    await getDb();
    await seedDatabase();
  } catch (err) {
    console.error('Database initialization error:', err);
  }

  // API Routes
  app.get('/api/v1/health', (req, res) => {
    res.json({ status: 'ok', service: 'ShiftLedger Engine', version: '1.0.0-phase1' });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/orgs', orgsRoutes);
  app.use('/api/v1/stores', storesRoutes);
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/shifts', shiftsRoutes);
  app.use('/api/v1/audit', auditRoutes);
  app.use('/api/v1/notifications', notificationsRoutes);


  // Vite Middleware for Dev / Static serving for Prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ShiftLedger server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server boot error:', err);
});
