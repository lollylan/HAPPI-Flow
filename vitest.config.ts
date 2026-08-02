import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Tests laufen gegen die Quellen, nicht gegen dist/ - kein Build noetig.
      '@haeppi/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    // Die Zeitzone wird ueber das npm-Skript gesetzt (TZ=Europe/Berlin).
    // Ohne feste Zone waeren die Sommerzeit-Regressionstests wertlos.
  },
});
