import { describe, expect, it } from 'vitest';
import { deploymentPin, renderDeploymentAssetUrl } from '../lib/deploymentAssetUrl.ts';

// This runs inside the build, where a mistake is expensive: a wrong URL breaks
// every asset on the deployed site at once, and only in production, since local
// builds never set these variables. Hence the unit test around the pure part.

describe('deploymentPin', () => {
  it('is inactive unless Vercel explicitly says the feature is on', () => {
    expect(deploymentPin({})).toBeNull();
    expect(deploymentPin({ VERCEL_DEPLOYMENT_ID: 'dpl_abc' })).toBeNull();
    expect(deploymentPin({ VERCEL_SKEW_PROTECTION_ENABLED: '0', VERCEL_DEPLOYMENT_ID: 'dpl_abc' })).toBeNull();
    // Only the exact string '1' counts - 'true' is not what Vercel sets.
    expect(deploymentPin({ VERCEL_SKEW_PROTECTION_ENABLED: 'true', VERCEL_DEPLOYMENT_ID: 'dpl_abc' })).toBeNull();
  });

  it('is active when the flag and the id are both present', () => {
    expect(deploymentPin({ VERCEL_SKEW_PROTECTION_ENABLED: '1', VERCEL_DEPLOYMENT_ID: 'dpl_abc' })).toBe('dpl_abc');
  });

  // System Environment Variables off: the flag is set but the id never arrives.
  // Pinning to an empty id would 404 every asset on the site.
  it('stays inactive when the id is missing or blank', () => {
    expect(deploymentPin({ VERCEL_SKEW_PROTECTION_ENABLED: '1' })).toBeNull();
    expect(deploymentPin({ VERCEL_SKEW_PROTECTION_ENABLED: '1', VERCEL_DEPLOYMENT_ID: '' })).toBeNull();
    expect(deploymentPin({ VERCEL_SKEW_PROTECTION_ENABLED: '1', VERCEL_DEPLOYMENT_ID: '   ' })).toBeNull();
  });
});

describe('renderDeploymentAssetUrl', () => {
  const on = { VERCEL_SKEW_PROTECTION_ENABLED: '1', VERCEL_DEPLOYMENT_ID: 'dpl_9xK' };

  it('leaves the build untouched when Skew Protection is off', () => {
    expect(renderDeploymentAssetUrl('assets/index-CFetWKnc.js', {})).toBeUndefined();
    expect(renderDeploymentAssetUrl('assets/index-D5TPP0yb.css', {})).toBeUndefined();
  });

  it('pins an asset to the deployment that served the page', () => {
    expect(renderDeploymentAssetUrl('assets/index-CFetWKnc.js', on)).toBe('/assets/index-CFetWKnc.js?dpl=dpl_9xK');
  });

  // The whole point: this is the lazily imported chunk that 404s after a
  // redeploy and produced the production error lazyWithRetry now recovers from.
  it('pins a lazily imported chunk', () => {
    expect(renderDeploymentAssetUrl('assets/ShiftClosingWizard-iDCGnjqZ.js', on)).toBe(
      '/assets/ShiftClosingWizard-iDCGnjqZ.js?dpl=dpl_9xK'
    );
  });

  it('appends rather than clobbers an existing query string', () => {
    expect(renderDeploymentAssetUrl('assets/font.woff2?v=2', on)).toBe('/assets/font.woff2?v=2&dpl=dpl_9xK');
  });

  it('honours a non-default base', () => {
    expect(renderDeploymentAssetUrl('assets/index.js', on, '/app/')).toBe('/app/assets/index.js?dpl=dpl_9xK');
  });

  it('returns the filename decoded, as Vite requires', () => {
    expect(renderDeploymentAssetUrl('assets/logo copy.svg', on)).toBe('/assets/logo copy.svg?dpl=dpl_9xK');
  });
});
