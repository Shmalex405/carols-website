// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Base path:
//  - Local dev / custom-domain build → '/' (default)
//  - GitHub Pages *project* deploy    → '/carols-website' (set via PAGES_BASE in CI)
// When the custom domain (carolsutah.com) is connected, remove PAGES_BASE from the
// deploy workflow so the site serves at the root. All internal links use
// withBase() (src/lib/base.ts), so they follow this automatically.
const base = process.env.PAGES_BASE || '/';

export default defineConfig({
  site: 'https://www.carolsutah.com',
  base,
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
  },
});
