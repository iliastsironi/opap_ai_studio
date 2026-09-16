import { describe, expect, it, beforeEach, vi } from 'vitest';
import { isChunkLoadError, retryChunkLoad, clearChunkReloadFlag } from '../lib/lazyWithRetry.ts';

// A redeploy renames every hashed chunk, so a tab opened before it throws on
// its next lazy import. That is a stale tab, not a broken app - reload once
// and carry on. But a chunk that is genuinely missing must NOT reload forever.

const memoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
};

beforeEach(() => {
  vi.stubGlobal('sessionStorage', memoryStorage());
});

describe('isChunkLoadError', () => {
  it('recognises how each browser words a failed dynamic import', () => {
    expect(isChunkLoadError(new Error('error loading dynamically imported module: /assets/X-abc.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('ChunkLoadError: Loading chunk 5 failed'))).toBe(true);
  });

  it('does not mistake an ordinary application error for a stale chunk', () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(new Error('Το πεδίο Μπροστά - Αρχικό είναι κλειδωμένο'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('retryChunkLoad', () => {
  it('reloads once on a stale chunk and never settles, so no crash panel flashes', async () => {
    const reload = vi.fn();
    const pending = retryChunkLoad(new Error('error loading dynamically imported module: /assets/A-1.js'), reload);

    expect(reload).toHaveBeenCalledTimes(1);

    const settled = await Promise.race([pending.then(() => 'settled', () => 'rejected'), Promise.resolve('pending')]);
    expect(settled).toBe('pending');
  });

  it('rethrows the second time so a genuinely missing chunk cannot loop', async () => {
    const reload = vi.fn();
    const error = new Error('error loading dynamically imported module: /assets/A-1.js');

    retryChunkLoad(error, reload);
    expect(reload).toHaveBeenCalledTimes(1);

    await expect(retryChunkLoad(error, reload)).rejects.toThrow(error);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads for a real error - that would hide the bug', async () => {
    const reload = vi.fn();
    const error = new Error('undefined is not a function');

    await expect(retryChunkLoad(error, reload)).rejects.toThrow(error);
    expect(reload).not.toHaveBeenCalled();
  });

  it('re-arms after a successful load so a later deploy self-heals too', async () => {
    const reload = vi.fn();
    const error = new Error('error loading dynamically imported module: /assets/A-1.js');

    retryChunkLoad(error, reload);
    clearChunkReloadFlag();
    retryChunkLoad(error, reload);

    expect(reload).toHaveBeenCalledTimes(2);
  });
});
