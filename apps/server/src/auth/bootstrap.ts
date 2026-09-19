import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import type { Db } from '../db/index.js';
import { hashPassword } from './password.js';

/** Ohne I, l, 0, O - damit ein Passwort fehlerfrei abgetippt werden kann. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePassword(length = 16): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export function countUsers(db: Db): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
}

/** Solange es kein einziges Konto gibt, muss die Praxis eingerichtet werden. */
export function needsSetup(db: Db): boolean {
  return countUsers(db) === 0;
}

export interface FirstAdminInput {
  readonly username: string;
  readonly password: string;
  readonly practiceName?: string;
}

/**
 * Legt das erste Verwaltungskonto an.
 *
 * Nur moeglich, solange es ueberhaupt kein Konto gibt - danach ist der Weg
 * zu. Das ist die einzige Stelle, an der ohne Anmeldung ein Konto entsteht.
 */
export async function createFirstAdmin(db: Db, input: FirstAdminInput): Promise<string> {
  if (!needsSetup(db)) {
    throw new Error('ALREADY_SET_UP');
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, must_change_password)
     VALUES (?, ?, ?, 'admin', 0)`,
  ).run(id, input.username, await hashPassword(input.password));
  return id;
}

/** Datei, mit der sich ein ausgesperrter Zugang wiederherstellen laesst. */
export const RECOVERY_MARKER = 'ZUGANG-ZURUECKSETZEN.txt';

/** Umgebungsvariable, die dasselbe ausloest - fuer `start-server.bat reset`. */
export const RECOVERY_ENV = 'HAEPPI_RESET_ACCESS';

/**
 * Alle Dateien im Datenverzeichnis, die als Marker gemeint sind. Windows
 * blendet Endungen aus - aus "ZUGANG-ZURUECKSETZEN.txt" wird beim Anlegen
 * im Explorer schnell "ZUGANG-ZURUECKSETZEN.txt.txt" oder "zugang-zuruecksetzen".
 * Das soll nicht daran scheitern.
 */
export function findRecoveryMarkers(dataDir: string): string[] {
  if (!existsSync(dataDir)) return [];
  const stem = RECOVERY_MARKER.replace(/\.txt$/i, '').toLowerCase();
  return readdirSync(dataDir)
    .filter((name) => name.toLowerCase().startsWith(stem))
    .map((name) => path.join(dataDir, name));
}

export interface RecoveryResult {
  readonly performed: boolean;
  readonly username?: string;
  readonly password?: string;
}

/**
 * Wiederherstellung nach einem vergessenen Passwort.
 *
 * Bewusst ueber eine Datei im Datenverzeichnis und nicht ueber einen Knopf
 * in der Oberflaeche: so braucht es Zugriff auf das Dateisystem des
 * Praxis-Rechners - dieselbe Huerde, die auch das Loeschen der Datenbank
 * haette. Ein Knopf waere fuer jede neugierige Kollegin einen Klick weit weg.
 *
 * Die Marker-Datei wird sofort geloescht, damit der Weg nicht offen bleibt.
 */
export async function handleRecoveryMarker(
  db: Db,
  dataDir: string,
  force = false,
): Promise<RecoveryResult> {
  const markers = findRecoveryMarkers(dataDir);
  if (markers.length === 0 && !force) return { performed: false };

  const password = generatePassword();
  const hash = await hashPassword(password);

  const existing = db
    .prepare(`SELECT id, username FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`)
    .get() as { id: string; username: string } | undefined;

  let username: string;
  if (existing) {
    db.prepare(
      `UPDATE users
          SET password_hash = ?, must_change_password = 1, is_active = 1,
              updated_at = datetime('now')
        WHERE id = ?`,
    ).run(hash, existing.id);
    username = existing.username;
    // Alle offenen Sitzungen beenden - sonst bliebe ein fremder Zugang bestehen.
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(existing.id);
  } else {
    username = 'admin';
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, must_change_password)
       VALUES (?, ?, ?, 'admin', 1)`,
    ).run(randomUUID(), username, hash);
  }

  db.prepare(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, detail)
     VALUES (NULL, 'recovery', 'user', NULL, 'Zugang über Marker-Datei zurückgesetzt')`,
  ).run();

  for (const marker of markers) unlinkSync(marker);
  return { performed: true, username, password };
}

export function printRecoveryNotice(result: RecoveryResult): void {
  if (!result.performed) return;
  const line = '='.repeat(64);
  console.log(`\n${line}`);
  console.log('  ZUGANG WURDE ZURÜCKGESETZT');
  console.log(line);
  console.log(`  Benutzername:  ${result.username}`);
  console.log(`  Passwort:      ${result.password}`);
  console.log('');
  console.log('  Beim Anmelden muss dieses Passwort geändert werden.');
  console.log(`${line}\n`);
}
