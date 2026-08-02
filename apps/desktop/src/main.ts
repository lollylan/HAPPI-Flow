import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, Menu, app, dialog, shell, utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import { errorPage, waitForServer } from './readiness.js';

const PORT = Number(process.env.HAEPPI_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}`;

const here = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let server: UtilityProcess | null = null;

/**
 * Startet den Server als Utility-Prozess von Electron.
 *
 * `utilityProcess` statt `spawn` mit `ELECTRON_RUN_AS_NODE`: der Prozess
 * gehoert zur Anwendung, wird beim Beenden zuverlaessig mitgenommen und
 * laesst kein verwaistes Node-Fenster zurueck.
 */
function startServer(): void {
  const entry = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'index.js')
    : path.join(here, '..', '..', 'server', 'dist', 'index.js');

  server = utilityProcess.fork(entry, [], {
    // Die Datenbank gehoert nach %APPDATA%, nicht neben die Anwendung.
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HAEPPI_DATA_DIR: app.getPath('userData'),
      HAEPPI_PORT: String(PORT),
    },
    stdio: 'inherit',
  });

  server.on('exit', (code) => {
    if (code !== 0 && mainWindow) {
      void mainWindow.loadURL(errorPage(`Der Dienst wurde mit Code ${code} beendet.`));
    }
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f172a',
    title: 'HÄPPI-Flow',
    webPreferences: {
      // Die Oberflaeche ist eine gewoehnliche Webseite und braucht keinen
      // Node-Zugriff. Ohne Preload gibt es auch keine Bruecke, die man
      // versehentlich zu weit oeffnet.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Externe Links im Standardbrowser oeffnen, nicht im Anwendungsfenster.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE_URL)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const readiness = await waitForServer({ url: `${BASE_URL}/api/health` });

  if (!readiness.ready) {
    await mainWindow.loadURL(
      errorPage(readiness.lastError ?? `keine Antwort nach ${readiness.attempts} Versuchen`),
    );
    return;
  }

  await mainWindow.loadURL(BASE_URL);
}

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Datei',
        submenu: [
          {
            label: 'Drucken …',
            accelerator: 'CmdOrCtrl+P',
            click: () => mainWindow?.webContents.print(),
          },
          { type: 'separator' },
          { role: 'quit', label: 'Beenden' },
        ],
      },
      {
        label: 'Ansicht',
        submenu: [
          { role: 'reload', label: 'Neu laden' },
          { role: 'zoomIn', label: 'Größer' },
          { role: 'zoomOut', label: 'Kleiner' },
          { role: 'resetZoom', label: 'Normalgröße' },
          { type: 'separator' },
          { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
        ],
      },
      {
        label: 'Hilfe',
        submenu: [
          {
            label: 'Zugang im Praxisnetz …',
            click: () => {
              void dialog.showMessageBox({
                type: 'info',
                title: 'Zugang im Praxisnetz',
                message: 'Andere Rechner erreichen HÄPPI-Flow im Browser.',
                detail:
                  `Adresse: http://<IP dieses Rechners>:${PORT}\n\n` +
                  'Die genaue Adresse steht beim Start im Protokoll. Der Rechner muss ' +
                  'eingeschaltet und HÄPPI-Flow geöffnet sein.',
              });
            },
          },
        ],
      },
    ]),
  );
}

// Nur eine Instanz: sonst kaempfen zwei Server um denselben Port und
// dieselbe Datenbankdatei.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(async () => {
    buildMenu();
    startServer();
    await createWindow();
  });

  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    server?.kill();
    server = null;
  });
}
