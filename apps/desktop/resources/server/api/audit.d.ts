import type { Db } from '../db/index.js';
/**
 * Schreibt einen Protokolleintrag. Bewusst ohne Nutzdaten-Inhalte -
 * protokolliert wird, wer wann was angefasst hat, nicht der Inhalt.
 */
export declare function writeAudit(db: Db, userId: string | null, action: string, entity: string, entityId?: string | null, detail?: string): void;
//# sourceMappingURL=audit.d.ts.map