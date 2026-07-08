// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// The public URL the site will live at. Update if the final domain changes.
// For a GitHub Pages *project* site (username.github.io/carols-website) also set
// `base: '/carols-website'`. For a custom domain (carolsutah.com) leave base as '/'.
export default defineConfig({
  site: 'https://www.carolsutah.com',
  base: '/',
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
  },
});
