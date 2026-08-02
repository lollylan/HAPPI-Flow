import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from '../db/index.js';
import { openTestDatabase } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';
import { seedDatabase } from '../db/seed.js';
import { hashPassword } from '../auth/password.js';

/** Migrationen liegen im Quellbaum; im Test wird nicht gebaut. */
function migrationsDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
}

/** Frische, migrierte und geseedete Datenbank im Arbeitsspeicher. */
export function createTestDb(): Db {
  const db = openTestDatabase();
  runMigrations(db, migrationsDir());
  seedDatabase(db);
  return db;
}

export interface TestUser {
  readonly id: string;
  readonly username: string;
  readonly password: string;
  readonly employeeId?: string;
}

export async function createUser(
  db: Db,
  username: string,
  password: string,
  role: 'admin' | 'employee',
  employeeId?: string,
): Promise<TestUser> {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, employee_id) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, username, await hashPassword(password), role, employeeId ?? null);
  return { id, username, password, ...(employeeId ? { employeeId } : {}) };
}

export interface CreateEmployeeOptions {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly staffType?: 'doctor' | 'mfa' | 'trainee';
  readonly isPcm?: boolean;
  readonly canHomeoffice?: boolean;
  readonly notes?: string;
}

export function createEmployee(db: Db, options: CreateEmployeeOptions = {}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO employees
       (id, first_name, last_name, staff_type, is_pcm, employment, target_hours_week,
        can_homeoffice, notes)
     VALUES (?, ?, ?, ?, ?, 'fulltime', 40, ?, ?)`,
  ).run(
    id,
    options.firstName ?? 'Anna',
    options.lastName ?? 'Beispiel',
    options.staffType ?? 'mfa',
    options.isPcm ? 1 : 0,
    options.canHomeoffice ? 1 : 0,
    options.notes ?? '',
  );

  const insert = db.prepare(
    `INSERT INTO employee_worktimes (employee_id, weekday, is_working, start_min, end_min, break_min)
     VALUES (?, ?, 1, 480, 1020, 60)`,
  );
  for (const weekday of [1, 2, 3, 4, 5]) insert.run(id, weekday);

  return id;
}

/** Liest einen Cookie-Wert aus den `set-cookie`-Kopfzeilen einer Antwort. */
export function readCookie(setCookie: string[] | undefined, name: string): string | null {
  for (const entry of setCookie ?? []) {
    const [pair] = entry.split(';');
    const [key, ...rest] = (pair ?? '').split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
