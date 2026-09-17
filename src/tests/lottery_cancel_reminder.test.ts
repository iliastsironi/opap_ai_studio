import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// The cron endpoint is a public URL. The only thing standing between it and
// anyone able to spam every user in the organization with pop-ups is the
// CRON_SECRET comparison, so that is what these tests pin.

const rpc = vi.fn();
vi.mock('../../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({ rpc }),
}));

const loadHandler = async () => {
  const mod = await import('../../api/_lib/lotteryCancelReminderHandler.ts');
  return mod.handleLotteryCancelReminder;
};

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 0, error: null });
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe('lottery cancel reminder endpoint', () => {
  it('refuses to run when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const handle = await loadHandler();

    await expect(handle({ authHeader: 'Bearer anything' })).rejects.toMatchObject({ status: 500 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a request with no Authorization header', async () => {
    process.env.CRON_SECRET = 's3cret-value-16ch';
    const handle = await loadHandler();

    await expect(handle({ authHeader: undefined })).rejects.toMatchObject({ status: 401 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret, and a right secret without the Bearer prefix', async () => {
    process.env.CRON_SECRET = 's3cret-value-16ch';
    const handle = await loadHandler();

    await expect(handle({ authHeader: 'Bearer wrong' })).rejects.toMatchObject({ status: 401 });
    await expect(handle({ authHeader: 's3cret-value-16ch' })).rejects.toMatchObject({ status: 401 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('runs the sweep for the correct secret', async () => {
    process.env.CRON_SECRET = 's3cret-value-16ch';
    rpc.mockResolvedValue({ data: 2, error: null });
    const handle = await loadHandler();

    const result = await handle({ authHeader: 'Bearer s3cret-value-16ch' });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ editions_notified: 2 });
    expect(rpc).toHaveBeenCalledWith('send_lottery_cancel_reminders', { p_lead_hours: 24 });
  });

  // Vercel documents cron delivery as best-effort and occasionally duplicated,
  // so "nothing was due" is the ordinary outcome, not an error.
  it('reports a quiet day as success', async () => {
    process.env.CRON_SECRET = 's3cret-value-16ch';
    const handle = await loadHandler();

    const result = await handle({ authHeader: 'Bearer s3cret-value-16ch' });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ editions_notified: 0 });
  });

  it('accepts the header when it arrives as an array', async () => {
    process.env.CRON_SECRET = 's3cret-value-16ch';
    const handle = await loadHandler();

    const result = await handle({ authHeader: ['Bearer s3cret-value-16ch'] });

    expect(result.status).toBe(200);
  });
});
