import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { SessionUser } from '@haeppi/shared';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from '../config.js';
import type { Db } from '../db/index.js';
import { resolveSession } from './sessions.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
    db: Db;
  }
}

/** Legt die angemeldete Person an den Request, ohne den Zugriff zu erzwingen. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) {
    const user = resolveSession(req.db, token);
    if (user) req.user = user;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Diese Aktion ist der Praxisleitung vorbehalten.' });
    return;
  }
  next();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-Submit-Cookie gegen CSRF.
 *
 * Das Session-Cookie ist HttpOnly und `SameSite=Lax`, was fremde
 * Formular-POSTs bereits abwehrt. Das CSRF-Token ist die zweite Schranke:
 * Es steht in einem lesbaren Cookie, und der Client muss es zusaetzlich im
 * Header mitschicken - was eine fremde Seite nicht kann.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    res.status(403).json({ error: 'Sicherheitsprüfung fehlgeschlagen. Bitte neu anmelden.' });
    return;
  }
  next();
}

/** Erlaubt den Zugriff nur auf die eigenen Daten - oder der Praxisleitung auf alle. */
export function requireSelfOrAdmin(getEmployeeId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Nicht angemeldet.' });
      return;
    }
    if (req.user.role === 'admin' || req.user.employeeId === getEmployeeId(req)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Kein Zugriff auf fremde Daten.' });
  };
}
