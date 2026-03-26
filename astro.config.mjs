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
    ssr: {
      // React’s main entry is CJS; Vite’s SSR runner is ESM. Externalize so Node loads them in CJS context.
      external: ['react', 'react-dom'],
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
      dedupe: ['react', 'react-dom'],
    },
  },

  adapter: vercel(),
});