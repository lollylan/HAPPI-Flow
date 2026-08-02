import Database from 'better-sqlite3';
export type Db = Database.Database;
/**
 * Oeffnet die Datenbank mit den Pragmas, auf die sich der Rest verlaesst.
 *
 * `foreign_keys` ist in SQLite standardmaessig AUS - ohne dieses Pragma
 * waeren saemtliche Fremdschluessel im Schema wirkungslos.
 */
export declare function openDatabase(file: string): Db;
/** In-Memory-Datenbank fuer Tests. */
export declare function openTestDatabase(): Db;
//# sourceMappingURL=index.d.ts.map