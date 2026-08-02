import { timingSafeEqual } from 'node:crypto';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from '../config.js';
import { resolveSession } from './sessions.js';
/** Legt die angemeldete Person an den Request, ohne den Zugriff zu erzwingen. */
export function attachUser(req, _res, next) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
        const user = resolveSession(req.db, token);
        if (user)
            req.user = user;
    }
    next();
}
export function requireAuth(req, res, next) {
    if (!req.user) {
        res.status(401).json({ error: 'Nicht angemeldet.' });
        return;
    }
    next();
}
export function requireAdmin(req, res, next) {
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
function safeEqual(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length)
        return false;
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
export function requireCsrf(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
        next();
        return;
    }
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.get(CSRF_HEADER);
    if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
        res.status(403).json({ error: 'Sicherheitsprüfung fehlgeschlagen. Bitte neu anmelden.' });
        return;
    }
    next();
}
/** Erlaubt den Zugriff nur auf die eigenen Daten - oder der Praxisleitung auf alle. */
export function requireSelfOrAdmin(getEmployeeId) {
    return (req, res, next) => {
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
//# sourceMappingURL=middleware.js.map