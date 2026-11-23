import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base` stays absolute so deep links (/set/abc/match) load /assets/* on refresh.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022' },
});
