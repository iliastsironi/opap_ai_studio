// Vercel Skew Protection for a Vite SPA.
//
// A redeploy renames every hashed chunk, so a tab opened before it asks for
// assets/<Name>-<oldhash>.js and gets a 404 - see lazyWithRetry.ts, which
// recovers from that by reloading once. Skew Protection prevents it instead:
// Vercel keeps serving a deployment's own assets when the request carries that
// deployment's id.
//
// Vercel does this automatically for Next/SvelteKit/Qwik/Astro/Nuxt. This app
// is a plain Vite SPA, so we attach the id ourselves at build time via
// experimental.renderBuiltUrl - the browser issues dynamic import() requests on
// its own, so there is no fetch() of ours to add a header to and the id has to
// be baked into the emitted URL.
//
// Inert unless Vercel says the feature is on: VERCEL_SKEW_PROTECTION_ENABLED is
// '1' only on Pro/Enterprise projects with the dashboard switch enabled AND
// "Enable access to System Environment Variables" turned on. Anywhere else
// (local builds, Hobby plans) this returns undefined and Vite emits exactly the
// URLs it always has.

export interface SkewProtectionEnv {
  VERCEL_SKEW_PROTECTION_ENABLED?: string;
  VERCEL_DEPLOYMENT_ID?: string;
}

/**
 * The `?dpl=` value to pin asset requests to this deployment, or null when
 * Skew Protection is not active for this build.
 */
export function deploymentPin(env: SkewProtectionEnv): string | null {
  if (env.VERCEL_SKEW_PROTECTION_ENABLED !== '1') return null;
  const id = env.VERCEL_DEPLOYMENT_ID?.trim();
  // Enabled but no id means System Environment Variables are off. Pinning to
  // an empty id would 404 every asset, so emit ordinary URLs instead.
  return id ? id : null;
}

/**
 * Built-asset URL for Vite's experimental.renderBuiltUrl.
 *
 * Returns undefined to mean "use Vite's default", which is what every build
 * without Skew Protection gets.
 */
export function renderDeploymentAssetUrl(
  filename: string,
  env: SkewProtectionEnv,
  base = '/'
): string | undefined {
  const pin = deploymentPin(env);
  if (!pin) return undefined;

  // filename arrives decoded and must be returned decoded - Vite encodes it.
  const separator = filename.includes('?') ? '&' : '?';
  return `${base}${filename}${separator}dpl=${pin}`;
}
