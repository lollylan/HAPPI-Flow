import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import type { Db } from '../db/index.js';
import { attachUser, requireCsrf } from '../auth/middleware.js';
import { HttpError } from './http.js';
import { authRouter } from './routes/auth.js';
import { setupRouter } from './routes/setup.js';
import { employeesRouter } from './routes/employees.js';
import {
  dayBlocksRouter,
  employeeWriteRouter,
  matrixRouter,
  settingsRouter,
  skillsRouter,
  workAreasRouter,
} from './routes/stammdaten.js';
import { rosterRouter, templateRouter } from './routes/roster.js';
import { absencesRouter, closuresRouter, recurringAbsencesRouter } from './routes/absences.js';

/**
 * Baut die Express-App ohne sie zu starten.
 *
 * Die Trennung von `listen()` ist der Grund, warum sich die API mit
 * supertest gegen eine In-Memory-Datenbank testen laesst, ohne einen Port
 * zu belegen.
 */
export function createApp(db: Db, clientDir?: string): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Die Datenbank haengt am Request, damit Tests eine eigene mitgeben koennen.
  app.use((req, _res, next) => {
    req.db = db;
    next();
  });

  // Kein CORS: Client und API laufen unter derselben Herkunft. Der
  // Dev-Server leitet /api weiter. In v1 stand hier `origin: '*'`, was den
  // gesamten Datenbestand fuer jede Seite im Netz abrufbar machte.

  app.get('/api/health', (_req, res) => {
    // Ohne Anmeldung erreichbar: die Electron-Huelle pollt hier, bis der
    // Server bereit ist - statt blind eine Sekunde zu warten.
    res.json({ status: 'ok', version: 2 });
  });

  app.use(attachUser);

  // Login und Ersteinrichtung sind von der CSRF-Pruefung ausgenommen: vor
  // der ersten Anmeldung gibt es noch kein Token, das man mitschicken
  // koennte. Beide sind trotzdem nicht ungeschuetzt - das Session-Cookie
  // ist `SameSite=Lax`, der Login braucht ein Passwort, und die
  // Einrichtung greift nur, solange es kein einziges Konto gibt.
  const CSRF_EXEMPT = new Set(['/auth/login', '/setup', '/setup/status']);
  app.use('/api', (req, res, next) => {
    if (CSRF_EXEMPT.has(req.path)) {
      next();
      return;
    }
    requireCsrf(req, res, next);
  });

  app.use('/api/setup', setupRouter());
  app.use('/api/auth', authRouter());
  app.use('/api/employees', employeesRouter(), employeeWriteRouter());
  app.use('/api/work-areas', workAreasRouter());
  app.use('/api/skills', skillsRouter());
  app.use('/api/day-blocks', dayBlocksRouter());
  app.use('/api/matrix', matrixRouter());
  app.use('/api/settings', settingsRouter());
  app.use('/api/roster', rosterRouter());
  app.use('/api/templates', templateRouter());
  app.use('/api/absences', absencesRouter());
  app.use('/api/closures', closuresRouter());
  app.use('/api/recurring-absences', recurringAbsencesRouter());

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unbekannter Endpunkt.' });
  });

  // Im Betrieb liefert derselbe Server die Oberflaeche aus. Im
  // Entwicklungsmodus uebernimmt das der Vite-Server, der /api hierher
  // weiterleitet - dann gibt es kein clientDir.
  if (clientDir) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    // Alle uebrigen Pfade an die Oberflaeche: sie hat eigene Routen
    // (/dienstplan, /druck/woche/mfa …), die der Server nicht kennt.
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    // Verstoesse gegen CHECK- oder UNIQUE-Bedingungen sind Eingabefehler,
    // keine Serverfehler - sonst sucht man den Grund im falschen Log.
    if (error instanceof Error && error.message.includes('SQLITE_CONSTRAINT')) {
      console.warn('[api] Constraint verletzt:', error.message);
      res.status(400).json({ error: 'Die Eingabe verletzt eine Regel der Datenbank.' });
      return;
    }
    console.error('[api]', error);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  });

  return app;
}
