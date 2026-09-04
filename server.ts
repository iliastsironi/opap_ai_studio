import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { handleCopilotChat } from './api/_lib/copilotChatHandler.js';
import { handleUsersInvite } from './api/_lib/usersInviteHandler.js';
import { handleNotifyShiftSummary } from './api/_lib/shiftSummaryEmailHandler.js';
import { HttpError } from './api/_lib/verifyRequestAuth.js';


async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/v1/health', (req, res) => {
    res.json({ status: 'ok', service: 'ShiftLedger Engine', version: '2.0.0-supabase' });
  });

  // Same handlers the Vercel functions (api/copilot-chat.ts, api/users-invite.ts)
  // use, shared under api/_lib/ so Cloud Run/local dev and Vercel behave
  // identically. Mounted at the same paths Vercel's filesystem routing
  // gives those files, so the frontend calls one path regardless of which
  // platform is actually serving it.
  const wrapHandler = (fn: (params: { authHeader: string | string[] | undefined; body: any }) => Promise<{ status: number; body: unknown }>) =>
    async (req: express.Request, res: express.Response) => {
      try {
        const result = await fn({ authHeader: req.headers.authorization, body: req.body });
        res.status(result.status).json(result.body);
      } catch (error: any) {
        const status = error instanceof HttpError ? error.status : 500;
        res.status(status).json({ error: error.message || 'Internal error' });
      }
    };
  app.post('/api/copilot-chat', wrapHandler(handleCopilotChat));
  app.post('/api/users-invite', wrapHandler(handleUsersInvite));
  app.post('/api/notify-shift-summary', wrapHandler(handleNotifyShiftSummary));

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
