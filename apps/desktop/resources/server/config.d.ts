export declare const SERVER_PORT: number;
/** 0.0.0.0, damit die anderen Praxis-PCs den Server im LAN erreichen. */
export declare const SERVER_HOST: string;
export declare const IS_PRODUCTION: boolean;
/**
 * Datenverzeichnis. Unter Windows `%APPDATA%\HAEPPI-Flow`.
 *
 * Bewusst ausserhalb des Projektverzeichnisses: in v1 lagen Datenbank und
 * Schluessel im Repo und wurden sogar mit dem Installer ausgeliefert.
 * Im Entwicklungsmodus wird ein eigener Unterordner benutzt, damit Tests
 * und Experimente niemals die Praxisdaten anfassen.
 */
export declare function dataDirectory(): string;
export declare function databaseFile(): string;
/** Lebensdauer einer Anmeldung. */
export declare const SESSION_TTL_HOURS = 12;
export declare const SESSION_COOKIE = "haeppi_session";
export declare const CSRF_COOKIE = "haeppi_csrf";
export declare const CSRF_HEADER = "x-haeppi-csrf";
//# sourceMappingURL=config.d.ts.map