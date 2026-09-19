import { DatabaseSync } from 'node:sqlite';

/**
 * Dünner Adapter über das in Node eingebaute SQLite (`node:sqlite`).
 *
 * Warum nicht better-sqlite3: das Paket bindet direkt an die V8-API und
 * muss darum für jede Electron-Version neu kompiliert werden. Fertige
 * Binärdateien für Electron gibt es keine, also bräuchte jeder, der den
 * Installer baut, mehrere Gigabyte Visual-Studio-Build-Tools. Für eine
 * Anwendung, die in der Praxis selbst gebaut wird, ist das die falsche
 * Abhängigkeit.
 *
 * `node:sqlite` liegt Node und Electron bei und passt damit immer zur
 * Laufzeit. Die API ist als "experimentell" gekennzeichnet - deshalb
 * dieser Adapter: ein Wechsel zurück wäre eine Änderung an genau
 * dieser Datei.
 */

export interface RunResult {
  readonly changes: number;
  readonly lastInsertRowid: number | bigint;
}

export interface Statement {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface Db {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  /** Liest oder setzt ein Pragma. `simple` liefert nur den Wert. */
  pragma(statement: string, options?: { simple?: boolean }): unknown;
  /** Führt die Funktion in einer Transaktion aus. */
  transaction<T>(work: () => T): () => T;
  close(): void;
}

function wrap(database: DatabaseSync): Db {
  let depth = 0;

  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        run: (...params) => statement.run(...(params as never[])) as unknown as RunResult,
        get: (...params) => statement.get(...(params as never[])),
        all: (...params) => statement.all(...(params as never[])),
      };
    },

    exec(sql) {
      database.exec(sql);
    },

    pragma(statement, options) {
      // Setzen: "journal_mode = WAL". Lesen: "user_version".
      if (statement.includes('=')) {
        database.exec(`PRAGMA ${statement}`);
        return undefined;
      }
      const row = database.prepare(`PRAGMA ${statement}`).get() as
        Record<string, unknown> | undefined;
      if (!row) return options?.simple ? undefined : [];
      return options?.simple ? Object.values(row)[0] : [row];
    },

    transaction<T>(work: () => T): () => T {
      return () => {
        // Verschachtelte Aufrufe teilen sich die äußere Transaktion -
        // ein zweites BEGIN wäre ein Fehler.
        if (depth > 0) {
          depth += 1;
          try {
            return work();
          } finally {
            depth -= 1;
          }
        }

        depth = 1;
        database.exec('BEGIN');
        try {
          const result = work();
          database.exec('COMMIT');
          return result;
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        } finally {
          depth = 0;
        }
      };
    },

    close() {
      database.close();
    },
  };
}

/**
 * Öffnet die Datenbank mit den Pragmas, auf die sich der Rest verlässt.
 *
 * `foreign_keys` ist in SQLite standardmäßig AUS - ohne dieses Pragma
 * wären sämtliche Fremdschlüssel im Schema wirkungslos.
 */
export function openDatabase(file: string): Db {
  const database = new DatabaseSync(file);
  // WAL: gleichzeitige Leser blockieren den Schreiber nicht. Wichtig, weil
  // mehrere Praxis-PCs parallel im Plan blättern.
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec('PRAGMA synchronous = NORMAL');
  return wrap(database);
}

/** In-Memory-Datenbank für Tests. */
export function openTestDatabase(): Db {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  return wrap(database);
}
