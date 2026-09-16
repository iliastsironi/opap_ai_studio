import { lazy, ComponentType } from 'react';

// Every module in this app is code-split, so the browser fetches
// assets/<Name>-<hash>.js on demand. A redeploy changes those hashes and the
// old files stop being served, which means any tab opened BEFORE the deploy
// throws on its next lazy import:
//
//   TypeError: error loading dynamically imported module: .../ShiftClosingWizard-Bxc5a4pg.js
//
// Nothing is wrong with the app - the tab is just holding a stale index.html.
// A reload fetches the current build and everything works, so do that for the
// user instead of showing them a crash panel they have to interpret.
//
// Guarded by a one-shot sessionStorage flag: if the reload doesn't fix it (a
// genuinely missing or broken chunk), the error is rethrown so ErrorBoundary
// reports it, rather than reloading in a loop.

const RELOAD_FLAG = 'shiftledger_chunk_reload';

// Browsers word this differently (Chrome "error loading dynamically imported
// module", Firefox "error loading dynamically imported module", Safari
// "Importing a module script failed"), so match on the shapes rather than one
// exact string.
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    /dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /ChunkLoadError/i.test(message)
  );
}

function alreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) !== null;
  } catch {
    // Private mode / blocked storage: treat as "already tried" so a broken
    // chunk can never put the tab into a reload loop.
    return true;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    // ignore - alreadyReloaded() fails closed when storage is unavailable
  }
}

// Clears the guard once the app has successfully rendered, so a later deploy
// in the same tab can self-heal too.
export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // ignore
  }
}

export function retryChunkLoad<T>(error: unknown, reload: () => void): Promise<T> {
  if (isChunkLoadError(error) && !alreadyReloaded()) {
    markReloaded();
    reload();
    // Resolve never: the reload replaces this document, and rejecting here
    // would flash the error panel on the way out.
    return new Promise<T>(() => {});
  }
  return Promise.reject(error);
}

export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((error) => retryChunkLoad<{ default: T }>(error, () => window.location.reload()))
  );
}
