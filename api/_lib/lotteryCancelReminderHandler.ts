import { getSupabaseAdmin } from './supabaseAdmin.js';
import { HttpError } from './verifyRequestAuth.js';

// Invoked by Vercel Cron, not by a signed-in user, so verifyAuthHeader() is the
// wrong check here - there is no Supabase session to verify. Vercel sends the
// project's CRON_SECRET as `Authorization: Bearer <secret>`; we compare against
// our own copy of the variable.
//
// Fails closed: with CRON_SECRET unset the endpoint rejects everything rather
// than running unauthenticated. That means forgetting the variable makes the
// reminder silently not fire, which is the safe direction - the alternative is
// a public endpoint anyone can hammer to spam every user in the organization.

const LEAD_HOURS = 24;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleLotteryCancelReminder(params: {
  authHeader: string | string[] | undefined;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new HttpError(500, 'CRON_SECRET is not configured');
  }

  const headerValue = Array.isArray(params.authHeader) ? params.authHeader[0] : params.authHeader;
  const expected = `Bearer ${secret}`;
  if (!headerValue || !timingSafeEqual(headerValue, expected)) {
    throw new HttpError(401, 'Unauthorized');
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('send_lottery_cancel_reminders', { p_lead_hours: LEAD_HOURS });
  if (error) throw error;

  // 0 is the normal result on most days - nothing was due.
  return { status: 200, body: { editions_notified: data ?? 0 } };
}
