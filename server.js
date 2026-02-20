import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

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
        if (row && row.data !== '{}') {
            res.json(JSON.parse(row.data));
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
        await dbRun(`UPDATE state SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'main'`, [stateJSON]);
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
