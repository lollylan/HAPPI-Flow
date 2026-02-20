import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Enable CORS for all local network requests
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// Initialize Encryption Keys
const SECRET_FILE_PATH = path.resolve(__dirname, 'secret.key');
let ENCRYPTION_KEY;

if (fs.existsSync(SECRET_FILE_PATH)) {
    ENCRYPTION_KEY = Buffer.from(fs.readFileSync(SECRET_FILE_PATH, 'utf8'), 'hex');
} else {
    // Generate a secure 256-bit key and save it for future restarts
    ENCRYPTION_KEY = crypto.randomBytes(32);
    fs.writeFileSync(SECRET_FILE_PATH, ENCRYPTION_KEY.toString('hex'), 'utf8');
    console.log('🔐 Generated new encryption key securely.');
}

const ALGORITHM = 'aes-256-gcm';

function encryptData(text) {
    if (text === '{}') return text; // don't encrypt empty initial state
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `ENCRYPTED::${iv.toString('hex')}::${authTag}::${encrypted}`;
}

function decryptData(encryptedStr) {
    if (!encryptedStr || !encryptedStr.startsWith('ENCRYPTED::')) return encryptedStr; // Plain text fallback

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
        console.error("❌ Decryption error (wrong key or corrupted data):", e.message);
        throw new Error("Data Decryption Failed");
    }
}

// Allow large payloads since we are syncing entire state JSON
app.use(express.json({ limit: '50mb' }));

// Initialize SQLite Database
const dbPath = path.resolve(__dirname, 'happi-flow.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err);
    } else {
        console.log('✅ Connected to SQLite database');

        // Create table to store our state blob
        db.run(`CREATE TABLE IF NOT EXISTS state (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            // Ensure the main row exists
            db.run(`INSERT OR IGNORE INTO state (id, data) VALUES ('main', '{}')`);
            console.log('✅ Database schema ready');
        });
    }
});

// Create Promisified versions of db methods
const dbGet = promisify(db.get).bind(db);
const dbRun = promisify(db.run).bind(db);

// --- ROUTES ---

// Endpoint to fetch the latest state from the database
app.get('/api/sync', async (req, res) => {
    try {
        const row = await dbGet(`SELECT data FROM state WHERE id = 'main'`);
        if (row && row.data && row.data !== '{}') {
            const decryptedData = decryptData(row.data);

            // Automatically encrypt standard plain text if it hasn't been encrypted yet
            if (row.data === decryptedData && row.data !== '{}') {
                console.log("🔐 Migrating plain text to encrypted database row...");
                await dbRun(`UPDATE state SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'main'`, [encryptData(row.data)]);
            }

            res.json(JSON.parse(decryptedData));
        } else {
            res.json(null); // No data yet
        }
    } catch (err) {
        console.error('❌ Error fetching state:', err);
        res.status(500).json({ error: 'Failed to fetch state' });
    }
});

// Endpoint to save state to the database
app.post('/api/sync', async (req, res) => {
    try {
        const stateJSON = JSON.stringify(req.body);
        const encryptedData = encryptData(stateJSON);
        await dbRun(`UPDATE state SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'main'`, [encryptedData]);
        res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('❌ Error saving state:', err);
        res.status(500).json({ error: 'Failed to save state' });
    }
});

// Start Server, listening on 0.0.0.0 for network access
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Backend-Server is running!`);
    console.log(`📡 Local:   http://localhost:${PORT}`);
    console.log(`🌍 Network: http://<YOUR_IP_ADDRESS>:${PORT}\n`);
});
