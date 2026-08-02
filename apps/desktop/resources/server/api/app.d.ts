import { type Express } from 'express';
import type { Db } from '../db/index.js';
/**
 * Baut die Express-App ohne sie zu starten.
 *
 * Die Trennung von `listen()` ist der Grund, warum sich die API mit
 * supertest gegen eine In-Memory-Datenbank testen laesst, ohne einen Port
 * zu belegen.
 */
export declare function createApp(db: Db, clientDir?: string): Express;
//# sourceMappingURL=app.d.ts.map