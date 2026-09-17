import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { renderDeploymentAssetUrl } from './src/lib/deploymentAssetUrl.ts';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    experimental: {
      // Vercel Skew Protection. No-ops in every build that isn't a
      // Skew-Protection-enabled Vercel deployment, so local and Hobby builds
      // emit byte-identical output. See src/lib/deploymentAssetUrl.ts.
      renderBuiltUrl: (filename: string) => renderDeploymentAssetUrl(filename, process.env),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
