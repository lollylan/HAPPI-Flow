import type { Db } from './index.js';
export declare function migrationsDirectory(): string;
export interface Migration {
    readonly version: number;
    readonly name: string;
    readonly sql: string;
}
export declare function loadMigrations(dir?: string): Migration[];
/**
 * Wendet alle noch offenen Migrationen an.
 *
 * Der Stand steht in `PRAGMA user_version` - dafuer braucht es keine eigene
 * Tabelle, und der Wert ueberlebt jedes Backup der Datei.
 */
export declare function runMigrations(db: Db, dir?: string): string[];
//# sourceMappingURL=migrate.d.ts.map