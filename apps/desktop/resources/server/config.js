import { mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export const SERVER_PORT = Number(process.env.HAEPPI_PORT ?? 4173);
/** 0.0.0.0, damit die anderen Praxis-PCs den Server im LAN erreichen. */
export const SERVER_HOST = process.env.HAEPPI_HOST ?? '0.0.0.0';
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
/**
 * Datenverzeichnis. Unter Windows `%APPDATA%\HAEPPI-Flow`.
 *
 * Bewusst ausserhalb des Projektverzeichnisses: in v1 lagen Datenbank und
 * Schluessel im Repo und wurden sogar mit dem Installer ausgeliefert.
 * Im Entwicklungsmodus wird ein eigener Unterordner benutzt, damit Tests
 * und Experimente niemals die Praxisdaten anfassen.
 */
export function dataDirectory() {
    const override = process.env.HAEPPI_DATA_DIR;
    if (override) {
        mkdirSync(override, { recursive: true });
        return override;
    }
    const base = process.platform === 'win32'
        ? (process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'))
        : path.join(os.homedir(), '.local', 'share');
    const dir = path.join(base, 'HAEPPI-Flow', IS_PRODUCTION ? '' : 'dev');
    mkdirSync(dir, { recursive: true });
    return dir;
}
export function databaseFile() {
    return path.join(dataDirectory(), 'haeppi.db');
}
/** Lebensdauer einer Anmeldung. */
export const SESSION_TTL_HOURS = 12;
export const SESSION_COOKIE = 'haeppi_session';
export const CSRF_COOKIE = 'haeppi_csrf';
export const CSRF_HEADER = 'x-haeppi-csrf';
//# sourceMappingURL=config.js.map