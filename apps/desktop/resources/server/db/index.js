import Database from 'better-sqlite3';
/**
 * Oeffnet die Datenbank mit den Pragmas, auf die sich der Rest verlaesst.
 *
 * `foreign_keys` ist in SQLite standardmaessig AUS - ohne dieses Pragma
 * waeren saemtliche Fremdschluessel im Schema wirkungslos.
 */
export function openDatabase(file) {
    const db = new Database(file);
    // WAL: gleichzeitige Leser blockieren den Schreiber nicht. Wichtig, weil
    // mehrere Praxis-PCs parallel im Plan blaettern.
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    return db;
}
/** In-Memory-Datenbank fuer Tests. */
export function openTestDatabase() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    return db;
}
//# sourceMappingURL=index.js.map