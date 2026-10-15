// Must come before anything that reads process.env. The API handlers below
// need SUPABASE_SERVICE_ROLE_KEY, and without this the dev server starts
// happily and then fails every one of them with "are not set" - the three
// routes have never worked locally, because on Vercel the variables come from
// the project settings instead and nothing ever pointed at the gap.
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { handleCopilotChat } from './api/_lib/copilotChatHandler.js';
import { handleUsersInvite, handleStaffPasswordReset } from './api/_lib/usersInviteHandler.js';
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
        // An unexpected failure used to leave nothing behind but a 500 in the
        // browser's network tab: the server printed nothing, so diagnosing one
        // meant reproducing it through the UI to read the response body. A
        // deliberate HttpError is the handler answering the caller and is not
        // worth logging; anything else is a bug and should say so here.
        if (!(error instanceof HttpError)) {
          console.error(`[api] ${req.method} ${req.path} failed:`, error);
        }
        res.status(status).json({ error: error.message || 'Internal error' });
      }
    };
  app.post('/api/copilot-chat', wrapHandler(handleCopilotChat));
  app.post('/api/users-invite', wrapHandler(handleUsersInvite));
  app.post('/api/staff-password-reset', wrapHandler(handleStaffPasswordReset));
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
