import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleLotteryCancelReminder } from './_lib/lotteryCancelReminderHandler.js';
import { HttpError } from './_lib/verifyRequestAuth.js';

// GET, unlike the other routes here: Vercel Cron issues a plain GET request.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const result = await handleLotteryCancelReminder({ authHeader: req.headers.authorization });
    res.status(result.status).json(result.body);
  } catch (error: any) {
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).json({ error: error.message || 'Internal error' });
  }
}
