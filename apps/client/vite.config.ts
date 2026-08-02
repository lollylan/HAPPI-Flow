import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Muss zu SERVER_PORT in apps/server/src/config.ts passen. */
const SERVER_PORT = 4173;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Im Dev direkt gegen die Quellen, damit Aenderungen am Scheduler
      // ohne vorherigen Build sichtbar werden.
      '@haeppi/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    // 0.0.0.0, damit im Dev auch ein zweiter Praxis-PC testen kann.
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    // Der Server liefert genau dieses Verzeichnis statisch aus.
    outDir: 'dist',
    sourcemap: true,
  },
});
