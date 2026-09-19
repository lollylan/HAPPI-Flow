import type { Db } from '../db/index.js';

/**
 * Schreibt einen Protokolleintrag. Bewusst ohne Nutzdaten-Inhalte -
 * protokolliert wird, wer wann was angefasst hat, nicht der Inhalt.
 */
export function writeAudit(
  db: Db,
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  detail = '',
): void {
  db.prepare(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, action, entity, entityId ?? null, detail);
}
