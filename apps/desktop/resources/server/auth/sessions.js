import { createHash, randomBytes } from 'node:crypto';
import { SESSION_TTL_HOURS } from '../config.js';
/**
 * Das Session-Token hat 256 Bit Entropie. Deshalb genuegt SHA-256 zum
 * Ablegen - anders als bei Passwoertern gibt es hier nichts zu erraten.
 * Der Klartext steht nur im Cookie des Browsers, nie in der Datenbank.
 */
export function createSessionToken() {
    return randomBytes(32).toString('base64url');
}
export function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}
function expiryTimestamp(now, hours = SESSION_TTL_HOURS) {
    return new Date(now.getTime() + hours * 3_600_000).toISOString();
}
export function createSession(db, userId, userAgent, now = new Date()) {
    const token = createSessionToken();
    db.prepare(`INSERT INTO sessions (id_hash, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)`).run(hashToken(token), userId, expiryTimestamp(now), userAgent.slice(0, 200));
    return token;
}
/** Liefert die angemeldete Person oder `null`, wenn das Token ungueltig oder abgelaufen ist. */
export function resolveSession(db, token, now = new Date()) {
    const row = db
        .prepare(`SELECT u.id AS user_id, u.username, u.role, u.employee_id, u.must_change_password,
              e.first_name, e.last_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
    LEFT JOIN employees e ON e.id = u.employee_id
        WHERE s.id_hash = ? AND s.expires_at > ? AND u.is_active = 1`)
        .get(hashToken(token), now.toISOString());
    if (!row)
        return null;
    const displayName = row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.username;
    return {
        userId: row.user_id,
        username: row.username,
        role: row.role,
        employeeId: row.employee_id,
        displayName,
        mustChangePassword: row.must_change_password === 1,
    };
}
export function destroySession(db, token) {
    db.prepare(`DELETE FROM sessions WHERE id_hash = ?`).run(hashToken(token));
}
/** Alle Sitzungen einer Person beenden - nach einem Passwortwechsel. */
export function destroyAllSessionsOfUser(db, userId) {
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
}
export function purgeExpiredSessions(db, now = new Date()) {
    return db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(now.toISOString()).changes;
}
//# sourceMappingURL=sessions.js.map