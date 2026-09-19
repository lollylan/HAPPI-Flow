import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { CSRF_COOKIE, IS_PRODUCTION, SESSION_COOKIE, SESSION_TTL_HOURS } from '../../config.js';
import { createFirstAdmin, needsSetup } from '../../auth/bootstrap.js';
import { checkPasswordPolicy } from '../../auth/password.js';
import { createSession, resolveSession } from '../../auth/sessions.js';
import { SETTING_KEYS, writeSetting } from '../../db/repositories/settings.js';
import { badRequest, conflict, parseBody } from '../http.js';
import { writeAudit } from '../audit.js';

const setupSchema = z.object({
  practiceName: z.string().trim().min(1, 'Der Praxisname fehlt.').max(120),
  username: z
    .string()
    .trim()
    .min(3, 'Der Benutzername braucht mindestens 3 Zeichen.')
    .max(40)
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      'Erlaubt sind Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich.',
    ),
  password: z.string().min(1).max(500),
});

export function setupRouter(): Router {
  const router = Router();

  // Auch die Einrichtung wird gebremst: sonst liesse sich der Zustand
  // "noch kein Konto" massenhaft abfragen.
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.' },
  });

  router.get('/status', limiter, (req, res) => {
    res.json({ needsSetup: needsSetup(req.db) });
  });

  /**
   * Legt das erste Verwaltungskonto an und meldet direkt an.
   *
   * Ohne Anmeldung erreichbar - aber nur, solange es kein einziges Konto
   * gibt. Danach antwortet die Route mit 409.
   */
  router.post('/', limiter, async (req, res) => {
    if (!needsSetup(req.db)) {
      throw conflict('Die Praxis ist bereits eingerichtet.');
    }

    const input = parseBody(setupSchema, req.body);
    const policy = checkPasswordPolicy(input.password);
    if (!policy.ok) throw badRequest(policy.message ?? 'Das Passwort genügt nicht.');

    const userId = await createFirstAdmin(req.db, input);
    writeSetting(req.db, SETTING_KEYS.practiceName, input.practiceName);
    writeAudit(req.db, userId, 'setup', 'user', userId, input.practiceName);

    // Direkt anmelden - ein zweites Passwortfeld gleich danach waere unnoetig.
    const token = createSession(req.db, userId, req.get('user-agent') ?? '');
    const csrfToken = randomBytes(24).toString('base64url');
    const maxAge = SESSION_TTL_HOURS * 3_600_000;
    const options = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: IS_PRODUCTION && process.env.HAEPPI_HTTPS === '1',
      path: '/',
      maxAge,
    };

    res.cookie(SESSION_COOKIE, token, options);
    res.cookie(CSRF_COOKIE, csrfToken, { ...options, httpOnly: false });

    res.status(201).json({ user: resolveSession(req.db, token) });
  });

  return router;
}
