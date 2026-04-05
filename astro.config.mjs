// @ts-check
import { defineConfig } from 'astro/config';
import path from 'path';
import { fileURLToPath } from 'url';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  output: 'server',
  // CR-1: Re-enabled CSRF protection. Clerk handles its own CSRF, but this protects all custom API routes.
  security: { checkOrigin: true },
  integrations: [react(), clerk()],

  vite: {
    plugins: [tailwindcss()],
    // Reduces flaky "504 (Outdated Optimize Dep)" + failed island hydration when the optimizer cache churns.
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'sonner',
        'html5-qrcode',
        'lucide-react',
        '@clerk/astro/react',
      ],
    },
    // Do not set `ssr.external` to react/react-dom: Vite 6's dev SSR runner then
    // evaluates react/index.js (CJS) without `module` and every React page returns 500.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
  },

  adapter: vercel(),
});