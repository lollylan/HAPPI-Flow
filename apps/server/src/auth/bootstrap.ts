import { randomInt, randomUUID } from 'node:crypto';
import type { Db } from '../db/index.js';
import { hashPassword } from './password.js';

/** Ohne I, l, 0, O - damit das Startpasswort fehlerfrei abgetippt werden kann. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePassword(length = 16): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export interface BootstrapResult {
  readonly created: boolean;
  readonly username: string;
  readonly password?: string;
}

/**
 * Legt beim allerersten Start ein Verwaltungskonto an.
 *
 * Das Passwort wird zufaellig erzeugt und einmalig auf der Konsole
 * ausgegeben; beim ersten Anmelden muss es geaendert werden. Die
 * Vorgaengerversion hatte ein fest eingebautes `admin`/`admin`, dessen
 * Hash sogar zweimal im Quelltext stand.
 */
export async function ensureAdminAccount(db: Db): Promise<BootstrapResult> {
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number };
  if (existing.n > 0) {
    return { created: false, username: '' };
  }

  const username = 'admin';
  const password = generatePassword();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, must_change_password)
     VALUES (?, ?, ?, 'admin', 1)`,
  ).run(randomUUID(), username, await hashPassword(password));

  return { created: true, username, password };
}

export function printFirstRunNotice(result: BootstrapResult): void {
  if (!result.created || !result.password) return;
  const line = '='.repeat(64);
  console.log(`\n${line}`);
  console.log('  ERSTER START - Zugang für die Praxisleitung wurde angelegt');
  console.log(line);
  console.log(`  Benutzername:  ${result.username}`);
  console.log(`  Passwort:      ${result.password}`);
  console.log('');
  console.log('  Dieses Passwort wird nur dieses eine Mal angezeigt.');
  console.log('  Beim ersten Anmelden muss es geändert werden.');
  console.log(`${line}\n`);
}
