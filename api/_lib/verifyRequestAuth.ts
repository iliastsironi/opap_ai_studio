import { getSupabaseAdmin } from './supabaseAdmin.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Framework-agnostic (takes the raw header, not a VercelRequest/Express
// Request) so both the Vercel function adapters and the Express routes
// mounted in server.ts (for local dev / Cloud Run) can share it.
export async function verifyAuthHeader(
  authHeader: string | string[] | undefined
): Promise<{ uid: string; email: string | null }> {
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = headerValue?.startsWith('Bearer ') ? headerValue.slice(7) : null;
  if (!token) {
    throw new HttpError(401, 'Missing Authorization header');
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (err: any) {
    // Server misconfiguration (missing env vars) - a 500, not a 401, since
    // it has nothing to do with the caller's token.
    throw new HttpError(500, err.message);
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, 'Invalid or expired token');
  }
  return { uid: data.user.id, email: data.user.email ?? null };
}
