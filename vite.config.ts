import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  // Served from a GitHub Pages project page at /learning_app/, so assets must
  // resolve under that path. See CLAUDE.md "Hosting" note.
  base: '/learning_app/',
  plugins: [react()],
});
