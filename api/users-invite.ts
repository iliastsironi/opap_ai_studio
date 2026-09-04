import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUsersInvite } from './_lib/usersInviteHandler.ts';
import { HttpError } from './_lib/verifyRequestAuth.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const result = await handleUsersInvite({ authHeader: req.headers.authorization, body: req.body });
    res.status(result.status).json(result.body);
  } catch (error: any) {
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).json({ error: error.message || 'Internal error' });
  }
}
