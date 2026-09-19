// tsc kopiert keine .sql-Dateien. Ohne diesen Schritt findet der gebaute
// Server seine Migrationen nicht.
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const from = path.join(root, 'src', 'db', 'migrations');
const to = path.join(root, 'dist', 'db', 'migrations');

if (!existsSync(from)) {
  console.error(`Migrationsverzeichnis fehlt: ${from}`);
  process.exit(1);
}

cpSync(from, to, { recursive: true });
console.log(`Migrationen kopiert nach ${to}`);
