import type { Request } from 'express';
import { ZodError, type ZodType } from 'zod';

/**
 * Fehler mit HTTP-Status. Express 5 leitet abgelehnte Promises aus
 * async-Handlern selbst an die Fehler-Middleware weiter, deshalb genuegt
 * ein `throw` im Handler.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message = 'Nicht gefunden.') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

/**
 * Liest einen Pfadparameter als einzelnen String.
 *
 * Express 5 typisiert `req.params` als `string | string[]`, weil ein
 * Muster denselben Namen mehrfach binden kann. Hier ist immer genau ein
 * Wert gemeint.
 */
export function pathParam(req: Request, name: string): string {
  const value = req.params[name as keyof typeof req.params];
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest(`Der Pfadparameter "${name}" fehlt.`);
  }
  return value;
}

/** Validiert den Rumpf und liefert eine lesbare deutsche Fehlermeldung. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const path = first?.path.join('.') ?? '';
      throw badRequest(
        path ? `Feld "${path}": ${first?.message}` : (first?.message ?? 'Ungültige Eingabe.'),
      );
    }
    throw error;
  }
}

/**
 * Optimistische Sperre.
 *
 * Der Client schickt die Version mit, die er geladen hat. Hat inzwischen
 * jemand anders gespeichert, gibt es 409 statt eines stillen Ueberschreibens -
 * genau das passierte in v1, wo zwei offene Browser sich gegenseitig
 * den kompletten Datenbestand ueberbuegelt haben.
 */
export function expectedVersion(req: Request): number | null {
  const header = req.get('if-match');
  if (!header) return null;
  const value = Number(header.replace(/"/g, ''));
  if (!Number.isInteger(value)) throw badRequest('Ungültiger If-Match-Header.');
  return value;
}

export function assertVersion(actual: number, expected: number | null, entity: string): void {
  if (expected === null) return;
  if (actual !== expected) {
    throw conflict(
      `${entity} wurde zwischenzeitlich von jemand anderem geändert. Bitte neu laden.`,
    );
  }
}
