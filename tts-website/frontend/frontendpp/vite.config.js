import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import seoPrerender from './vite/plugins/seo-prerender.js';

export default defineConfig({
  plugins: [react(), seoPrerender()],

  // The same JSX runtime the react plugin asks for. Stated here as well because
  // Vitest resolves the transform through its own environment, which does not
  // pick up the plugin's config hook — without this, a component under test is
  // compiled to `React.createElement` and fails on a file that (correctly) never
  // imports React.
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  // Vitest still transforms with esbuild, so it needs that same instruction in
  // esbuild's vocabulary — drop this and 71 component tests fail on "React is
  // not defined". Only under Vitest, though: Vite 8 builds with oxc and ignores
  // an `esbuild` block outright, warning about it on every single startup.
  ...(process.env.VITEST ? { esbuild: { jsx: 'automatic', jsxImportSource: 'react' } } : {}),

  build: {
    // Every tool is a lazy chunk, so there are ~25 of them; the default 500 kB
    // warning only fires on the vendor bundle and just adds noise to the log.
    chunkSizeWarningLimit: 700,
    // Source maps for a static site cost nothing at runtime and make a
    // production stack trace readable.
    sourcemap: true,
    rollupOptions: {
      output: {
        // React and the router are on every page; framer-motion and the icon set
        // are large enough that mixing them into the entry chunk would delay
        // first paint. Splitting them keeps the long-lived code in files whose
        // hash does not change when a tool does.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)/.test(id)) {
            return 'vendor-react';
          }
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)/.test(id)) {
            return 'vendor-motion';
          }
          return undefined;
        },
      },
    },
  },

  server: {
    // Only reached when VITE_API_BASE is set to '' (see src/lib/api.js), which
    // is how you point a dev session at a backend running on localhost:8000
    // without a CORS round-trip. The backend exposes the tool router under
    // /api and the original TTS routes at the root, so both are proxied.
    proxy: {
      '/api': { target: 'https://tts-backend-33xv.onrender.com', changeOrigin: true },
      '/voices': { target: 'https://tts-backend-33xv.onrender.com', changeOrigin: true },
      '/speak': { target: 'https://tts-backend-33xv.onrender.com', changeOrigin: true },
      '/generate': { target: 'https://tts-backend-33xv.onrender.com', changeOrigin: true },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
});
