const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = 3001;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

const SECRET_FILE_PATH = path.resolve(process.cwd(), 'secret.key');
let ENCRYPTION_KEY;

if (fs.existsSync(SECRET_FILE_PATH)) {
    ENCRYPTION_KEY = Buffer.from(fs.readFileSync(SECRET_FILE_PATH, 'utf8'), 'hex');
} else {
    ENCRYPTION_KEY = crypto.randomBytes(32);
    fs.writeFileSync(SECRET_FILE_PATH, ENCRYPTION_KEY.toString('hex'), 'utf8');
}

const ALGORITHM = 'aes-256-gcm';

function encryptData(text) {
    if (text === '{}') return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `ENCRYPTED::${iv.toString('hex')}::${authTag}::${encrypted}`;
}

function decryptData(encryptedStr) {
    if (!encryptedStr || !encryptedStr.startsWith('ENCRYPTED::')) return encryptedStr;
    try {
        const parts = encryptedStr.split('::');
        const iv = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');
        const encryptedText = parts[3];

        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        throw new Error("Data Decryption Failed");
    }
}

app.use(express.json({ limit: '50mb' }));

const dbPath = path.resolve(process.cwd(), 'happi-flow.db');
let db;
try {
    db = new Database(dbPath);
    db.exec(`CREATE TABLE IF NOT EXISTS state (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    const checkStmt = db.prepare(`SELECT count(*) as count FROM state WHERE id = 'main'`);
    const countRow = checkStmt.get();
    if (countRow.count === 0) {
        db.prepare(`INSERT INTO state (id, data) VALUES ('main', '{}')`).run();
    }
} catch (err) { }

app.get('/api/sync', (req, res) => {
    try {
        const stmt = db.prepare(`SELECT data FROM state WHERE id = 'main'`);
        const row = stmt.get();
        if (row && row.data && row.data !== '{}') {
            const decryptedData = decryptData(row.data);
            if (row.data === decryptedData && row.data !== '{}') {
                db.prepare(`UPDATE state SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'main'`).run(encryptData(row.data));
            }
            res.json(JSON.parse(decryptedData));
        } else {
            res.json(null);
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/sync', (req, res) => {
    try {
        const stateJSON = JSON.stringify(req.body);
        const encryptedData = encryptData(stateJSON);
        db.prepare(`UPDATE state SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'main'`).run(encryptedData);
        res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Serve the statically built React Application
app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start Server and automatically launch browser
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 H Flow is starting...`);
    console.log(`📡 Local server: http://localhost:${PORT}`);
    console.log(`(Opening in your browser immediately...)`);

    setTimeout(() => {
        // Open the browser with Windows default app
        const url = `http://localhost:${PORT}`;
        const startCommand = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
        spawn(startCommand, [url], { shell: true, stdio: 'ignore' });
    }, 1000);
});
