import type { SessionUser } from '@haeppi/shared';
import type { Db } from '../db/index.js';
/**
 * Das Session-Token hat 256 Bit Entropie. Deshalb genuegt SHA-256 zum
 * Ablegen - anders als bei Passwoertern gibt es hier nichts zu erraten.
 * Der Klartext steht nur im Cookie des Browsers, nie in der Datenbank.
 */
export declare function createSessionToken(): string;
export declare function hashToken(token: string): string;
export declare function createSession(db: Db, userId: string, userAgent: string, now?: Date): string;
/** Liefert die angemeldete Person oder `null`, wenn das Token ungueltig oder abgelaufen ist. */
export declare function resolveSession(db: Db, token: string, now?: Date): SessionUser | null;
export declare function destroySession(db: Db, token: string): void;
/** Alle Sitzungen einer Person beenden - nach einem Passwortwechsel. */
export declare function destroyAllSessionsOfUser(db: Db, userId: string): void;
export declare function purgeExpiredSessions(db: Db, now?: Date): number;
//# sourceMappingURL=sessions.d.ts.map