// Sammelt Server, Oberflaeche und deren Laufzeit-Abhaengigkeiten in
// apps/desktop/resources. electron-builder packt genau diesen Ordner -
// so muss es die Workspace-Verweise nicht selbst aufloesen.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repo = path.dirname(path.dirname(desktop));
const resources = path.join(desktop, 'resources');

function require(source, label) {
  if (!existsSync(source)) {
    console.error(`Fehlt: ${label} (${source})\nBitte zuerst "npm run build" im Projektstamm.`);
    process.exit(1);
  }
}

const serverDist = path.join(repo, 'apps', 'server', 'dist');
const clientDist = path.join(repo, 'apps', 'client', 'dist');
const sharedDist = path.join(repo, 'packages', 'shared', 'dist');

require(serverDist, 'Server-Build');
require(path.join(clientDist, 'index.html'), 'Oberflaechen-Build');
require(sharedDist, 'Shared-Build');

rmSync(resources, { recursive: true, force: true });
mkdirSync(resources, { recursive: true });

cpSync(serverDist, path.join(resources, 'server'), { recursive: true });
cpSync(clientDist, path.join(resources, 'client'), { recursive: true });

// @haeppi/shared wird vom Server per Paketnamen importiert und muss als
// echtes Paket danebenliegen.
const sharedTarget = path.join(resources, 'node_modules', '@haeppi', 'shared');
mkdirSync(sharedTarget, { recursive: true });
cpSync(sharedDist, path.join(sharedTarget, 'dist'), { recursive: true });
writeFileSync(
  path.join(sharedTarget, 'package.json'),
  JSON.stringify(
    { name: '@haeppi/shared', version: '2.0.0', type: 'module', main: './dist/index.js' },
    null,
    2,
  ),
);

// Die Laufzeit-Abhaengigkeiten des Servers. better-sqlite3 enthaelt eine
// native Bibliothek und muss fuer Electron gebaut sein - darum kuemmert
// sich electron-builder beim Packen.
const runtime = [
  'better-sqlite3',
  'bindings',
  'file-uri-to-path',
  'prebuild-install',
  'express',
  'cookie-parser',
  'express-rate-limit',
  'zod',
  '@node-rs/argon2',
];

for (const name of runtime) {
  const source = path.join(repo, 'node_modules', name);
  if (!existsSync(source)) continue;
  cpSync(source, path.join(resources, 'node_modules', name), { recursive: true });
}

writeFileSync(
  path.join(resources, 'node_modules', '.gathered'),
  `erzeugt am ${new Date().toISOString()}\n`,
);

console.log(`Ressourcen vorbereitet: ${resources}`);
