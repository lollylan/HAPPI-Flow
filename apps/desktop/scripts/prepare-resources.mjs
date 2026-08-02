// Legt den gebauten Server neben die Electron-Huelle und die Oberflaeche
// nach resources/.
//
// Der Server kommt bewusst IN die Anwendung (server-dist/) und nicht nach
// extraResources: nur so findet er ueber die normale Node-Aufloesung seine
// Abhaengigkeiten, die electron-builder aus den dependencies dieses Pakets
// einsammelt und fuer Electron neu baut. Die Oberflaeche sind reine
// statische Dateien und liegt daneben in resources/client.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repo = path.dirname(path.dirname(desktop));

function requireBuild(source, label) {
  if (existsSync(source)) return;
  console.error(`Fehlt: ${label} (${source})`);
  console.error('Bitte zuerst im Projektstamm "npm run build" ausfuehren.');
  process.exit(1);
}

const serverDist = path.join(repo, 'apps', 'server', 'dist');
const clientDist = path.join(repo, 'apps', 'client', 'dist');

requireBuild(path.join(serverDist, 'index.js'), 'Server-Build');
requireBuild(path.join(clientDist, 'index.html'), 'Oberflaechen-Build');

const serverTarget = path.join(desktop, 'server-dist');
rmSync(serverTarget, { recursive: true, force: true });
cpSync(serverDist, serverTarget, { recursive: true });

const resources = path.join(desktop, 'resources');
rmSync(resources, { recursive: true, force: true });
mkdirSync(resources, { recursive: true });
cpSync(clientDist, path.join(resources, 'client'), { recursive: true });

console.log('Vorbereitet:');
console.log(`  Server:      ${serverTarget}`);
console.log(`  Oberflaeche: ${path.join(resources, 'client')}`);
