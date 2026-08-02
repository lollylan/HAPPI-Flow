import type { Request } from 'express';
import { type ZodType } from 'zod';
/**
 * Fehler mit HTTP-Status. Express 5 leitet abgelehnte Promises aus
 * async-Handlern selbst an die Fehler-Middleware weiter, deshalb genuegt
 * ein `throw` im Handler.
 */
export declare class HttpError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
export declare const badRequest: (message: string) => HttpError;
export declare const notFound: (message?: string) => HttpError;
export declare const conflict: (message: string) => HttpError;
/**
 * Liest einen Pfadparameter als einzelnen String.
 *
 * Express 5 typisiert `req.params` als `string | string[]`, weil ein
 * Muster denselben Namen mehrfach binden kann. Hier ist immer genau ein
 * Wert gemeint.
 */
export declare function pathParam(req: Request, name: string): string;
/** Validiert den Rumpf und liefert eine lesbare deutsche Fehlermeldung. */
export declare function parseBody<T>(schema: ZodType<T>, body: unknown): T;
/**
 * Optimistische Sperre.
 *
 * Der Client schickt die Version mit, die er geladen hat. Hat inzwischen
 * jemand anders gespeichert, gibt es 409 statt eines stillen Ueberschreibens -
 * genau das passierte in v1, wo zwei offene Browser sich gegenseitig
 * den kompletten Datenbestand ueberbuegelt haben.
 */
export declare function expectedVersion(req: Request): number | null;
export declare function assertVersion(actual: number, expected: number | null, entity: string): void;
//# sourceMappingURL=http.d.ts.map