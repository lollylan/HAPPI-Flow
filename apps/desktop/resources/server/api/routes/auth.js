import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { CSRF_COOKIE, IS_PRODUCTION, SESSION_COOKIE, SESSION_TTL_HOURS } from '../../config.js';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../../auth/password.js';
import { createSession, destroyAllSessionsOfUser, destroySession, resolveSession, } from '../../auth/sessions.js';
import { requireAuth } from '../../auth/middleware.js';
import { writeAudit } from '../audit.js';
const loginSchema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(500),
});
const passwordSchema = z.object({
    currentPassword: z.string().min(1).max(500),
    newPassword: z.string().min(1).max(500),
});
/**
 * Bremst Rateraten aus. Bewusst auf die IP bezogen: im Praxisnetz sitzen
 * nur eine Handvoll Rechner, ein Fehlversuchslimit pro Konto waere eine
 * bequeme Moeglichkeit, Kolleginnen auszusperren.
 *
 * Der Zaehler wird pro App-Instanz angelegt, nicht auf Modulebene - sonst
 * teilen sich mehrere Anwendungen im selben Prozess einen Zaehler.
 */
function createLoginLimiter() {
    return rateLimit({
        windowMs: 15 * 60_000,
        limit: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' },
    });
}
function cookieOptions(maxAgeMs) {
    return {
        httpOnly: true,
        sameSite: 'lax',
        // Im Praxisnetz laeuft der Server ueber HTTP. `secure` wuerde das
        // Cookie dort verwerfen und die Anmeldung unmoeglich machen.
        secure: IS_PRODUCTION && process.env.HAEPPI_HTTPS === '1',
        path: '/',
        maxAge: maxAgeMs,
    };
}
export function authRouter() {
    const router = Router();
    const loginLimiter = createLoginLimiter();
    router.post('/login', loginLimiter, async (req, res) => {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Benutzername und Passwort werden benötigt.' });
            return;
        }
        const row = req.db
            .prepare(`SELECT id, password_hash, is_active FROM users WHERE username = ? COLLATE NOCASE`)
            .get(parsed.data.username);
        const ok = row ? await verifyPassword(row.password_hash, parsed.data.password) : false;
        if (!row || !ok || row.is_active !== 1) {
            // Bewusst dieselbe Meldung fuer "Konto gibt es nicht" und "Passwort
            // falsch" - sonst laesst sich herausfinden, wer hier ein Konto hat.
            res.status(401).json({ error: 'Benutzername oder Passwort ist falsch.' });
            return;
        }
        const token = createSession(req.db, row.id, req.get('user-agent') ?? '');
        const csrfToken = randomBytes(24).toString('base64url');
        const maxAge = SESSION_TTL_HOURS * 3_600_000;
        res.cookie(SESSION_COOKIE, token, cookieOptions(maxAge));
        // Muss lesbar sein: der Client schickt den Wert im Header zurueck.
        res.cookie(CSRF_COOKIE, csrfToken, { ...cookieOptions(maxAge), httpOnly: false });
        req.db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(row.id);
        writeAudit(req.db, row.id, 'login', 'user', row.id);
        res.json({ user: resolveSession(req.db, token) });
    });
    router.post('/logout', (req, res) => {
        const token = req.cookies?.[SESSION_COOKIE];
        if (token)
            destroySession(req.db, token);
        res.clearCookie(SESSION_COOKIE, { path: '/' });
        res.clearCookie(CSRF_COOKIE, { path: '/' });
        res.status(204).end();
    });
    router.get('/me', (req, res) => {
        if (!req.user) {
            res.status(401).json({ error: 'Nicht angemeldet.' });
            return;
        }
        res.json({ user: req.user });
    });
    router.post('/password', requireAuth, async (req, res) => {
        const parsed = passwordSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Bitte aktuelles und neues Passwort angeben.' });
            return;
        }
        const user = req.user;
        const row = req.db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(user.userId);
        if (!row || !(await verifyPassword(row.password_hash, parsed.data.currentPassword))) {
            res.status(401).json({ error: 'Das aktuelle Passwort ist falsch.' });
            return;
        }
        const policy = checkPasswordPolicy(parsed.data.newPassword);
        if (!policy.ok) {
            res.status(400).json({ error: policy.message });
            return;
        }
        req.db
            .prepare(`UPDATE users
            SET password_hash = ?, must_change_password = 0, updated_at = datetime('now')
          WHERE id = ?`)
            .run(await hashPassword(parsed.data.newPassword), user.userId);
        // Alle anderen Sitzungen beenden - falls jemand mitgelesen hat.
        destroyAllSessionsOfUser(req.db, user.userId);
        res.clearCookie(SESSION_COOKIE, { path: '/' });
        res.clearCookie(CSRF_COOKIE, { path: '/' });
        writeAudit(req.db, user.userId, 'password-changed', 'user', user.userId);
        res.json({ ok: true, reloginRequired: true });
    });
    return router;
}
//# sourceMappingURL=auth.js.map