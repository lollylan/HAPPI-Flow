/**
 * Schreibt einen Protokolleintrag. Bewusst ohne Nutzdaten-Inhalte -
 * protokolliert wird, wer wann was angefasst hat, nicht der Inhalt.
 */
export function writeAudit(db, userId, action, entity, entityId, detail = '') {
    db.prepare(`INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)`).run(userId, action, entity, entityId ?? null, detail);
}
//# sourceMappingURL=audit.js.map