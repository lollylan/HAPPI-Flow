import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "H Flow",
        show: false, // show later when ready to avoid white flicker
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Load the local Express server
    mainWindow.loadURL('http://localhost:3001');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startServer() {
    // Start the Express server
    const serverPath = path.join(__dirname, 'server.js');
    serverProcess = spawn(process.execPath, [serverPath], {
        stdio: 'inherit',
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1'
        }
    });

    // Give the server a small moment to bind the port before opening window
    setTimeout(() => {
        createWindow();
    }, 1000);
}

app.whenReady().then(() => {
    startServer();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // Attempt gracefully killing the server before exit
    if (serverProcess) {
        serverProcess.send?.('shutdown'); // Try graceful shutdown
        serverProcess.kill();
    }
});
