import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER_HOST, SERVER_PORT, databaseFile } from './config.js';
import { openDatabase } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { isSeeded, seedDatabase } from './db/seed.js';
import { ensureAdminAccount, printFirstRunNotice } from './auth/bootstrap.js';
import { purgeExpiredSessions } from './auth/sessions.js';
import { createApp } from './api/app.js';

/**
 * Wo die gebaute Oberflaeche liegt - oder `undefined` im Entwicklungsmodus,
 * wo der Vite-Server sie ausliefert.
 */
function clientDirectory(): string | undefined {
  const override = process.env.HAEPPI_CLIENT_DIR;
  if (override) return override;

  const here = path.dirname(fileURLToPath(import.meta.url));
  // Gepackt: resources/client, daneben resources/server.
  const packaged = path.join(here, '..', 'client');
  if (existsSync(path.join(packaged, 'index.html'))) return packaged;

  const built = path.join(here, '..', '..', 'client', 'dist');
  if (existsSync(path.join(built, 'index.html'))) return built;

  return undefined;
}

function localAddresses(port: number): string[] {
  const urls: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return urls;
}

async function main(): Promise<void> {
  const file = databaseFile();
  const db = openDatabase(file);

  const applied = runMigrations(db);
  if (applied.length > 0) {
    console.log(`[db] Migrationen angewendet: ${applied.join(', ')}`);
  }

  if (!isSeeded(db)) {
    seedDatabase(db);
    console.log('[db] Praxis-Vorlage angelegt (Zeitmodell, Bereiche, Qualifikationen).');
  }

  printFirstRunNotice(await ensureAdminAccount(db));
  purgeExpiredSessions(db);

  const app = createApp(db, clientDirectory());
  app.listen(SERVER_PORT, SERVER_HOST, () => {
    console.log(`[server] Datenbank: ${file}`);
    console.log(`[server] Lokal:     http://localhost:${SERVER_PORT}`);
    for (const url of localAddresses(SERVER_PORT)) {
      console.log(`[server] Im Netz:   ${url}`);
    }
  });

  const shutdown = () => {
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('[server] Start fehlgeschlagen:', error);
  process.exit(1);
});
