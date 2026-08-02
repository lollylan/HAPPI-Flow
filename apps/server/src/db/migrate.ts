import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './index.js';

const MIGRATION_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

export function migrationsDirectory(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
}

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export function loadMigrations(dir: string = migrationsDirectory()): Migration[] {
  return readdirSync(dir)
    .filter((file) => MIGRATION_PATTERN.test(file))
    .sort()
    .map((file) => {
      const match = MIGRATION_PATTERN.exec(file);
      // Das Pattern hat oben schon gegriffen, der Zweig ist nur fuer den Typ.
      if (!match?.[1]) throw new Error(`Unerwarteter Migrationsname: ${file}`);
      return {
        version: Number(match[1]),
        name: file,
        sql: readFileSync(path.join(dir, file), 'utf8'),
      };
    });
}

/**
 * Wendet alle noch offenen Migrationen an.
 *
 * Der Stand steht in `PRAGMA user_version` - dafuer braucht es keine eigene
 * Tabelle, und der Wert ueberlebt jedes Backup der Datei.
 */
export function runMigrations(db: Db, dir: string = migrationsDirectory()): string[] {
  const current = db.pragma('user_version', { simple: true }) as number;
  const pending = loadMigrations(dir).filter((migration) => migration.version > current);
  const applied: string[] = [];

  for (const migration of pending) {
    if (!Number.isInteger(migration.version)) {
      throw new Error(`Ungueltige Migrationsversion in ${migration.name}`);
    }
    // Jede Migration laeuft fuer sich in einer Transaktion: bricht sie ab,
    // bleibt die Datenbank auf dem vorherigen Stand statt halb migriert.
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      // user_version erlaubt keine Parameterbindung; die Zahl ist oben geprueft.
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
      applied.push(migration.name);
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.name} fehlgeschlagen: ${String(error)}`, {
        cause: error,
      });
    }
  }

  return applied;
}
