/**
 * Prueft die Migration 0002 gegen einen Datenbestand mit Schema 0001.
 * Aufruf: npx tsx apps/server/scripts/migrate-check.ts
 */
import { randomUUID } from 'node:crypto';
import { openTestDatabase } from '../src/db/index.js';
import { loadMigrations, migrationsDirectory, runMigrations } from '../src/db/migrate.js';

const dir = migrationsDirectory();
const db = openTestDatabase();
const [first] = loadMigrations(dir);
db.exec('BEGIN');
db.exec(first!.sql);
db.exec('PRAGMA user_version = 1');
db.exec('COMMIT');

db.exec(
  `INSERT INTO day_blocks (id, weekday, label, kind, start_min, end_min, sort_order) VALUES ('blk-1-vm', 1, 'Vormittag', 'consultation', 480, 780, 1)`,
);
db.exec(
  `INSERT INTO work_areas (id, plan, name, kind, requires_homeoffice) VALUES ('wa-zimmer-1', 'doctor', 'Zimmer 1', 'room', 0)`,
);
db.exec(
  `INSERT INTO work_areas (id, plan, name, kind, requires_homeoffice) VALUES ('wa-ho', 'mfa', 'Homeoffice', 'homeoffice', 1)`,
);
db.exec(
  `INSERT INTO work_area_blocks (work_area_id, day_block_id) VALUES ('wa-zimmer-1', 'blk-1-vm')`,
);
const pcm = randomUUID();
const doc = randomUUID();
db.prepare(
  `INSERT INTO employees (id, first_name, last_name, staff_type, is_pcm, employment) VALUES (?, 'Heidi', 'G', 'mfa', 1, 'fulltime')`,
).run(pcm);
db.prepare(
  `INSERT INTO employees (id, first_name, last_name, staff_type, is_pcm, employment) VALUES (?, 'Flo', 'R', 'doctor', 0, 'fulltime')`,
).run(doc);
db.prepare(
  `INSERT INTO employee_worktimes (employee_id, weekday, start_min, end_min) VALUES (?, 1, 480, 1020)`,
).run(pcm);
db.prepare(
  `INSERT INTO users (id, username, password_hash, role, employee_id) VALUES (?, 'heidi', 'x', 'employee', ?)`,
).run(randomUUID(), pcm);
db.prepare(
  `INSERT INTO assignments (id, date, day_block_id, work_area_id, employee_id, source) VALUES (?, '2026-08-03', 'blk-1-vm', 'wa-zimmer-1', ?, 'auto')`,
).run(randomUUID(), doc);
db.prepare(
  `INSERT INTO template_assignments (id, employee_id, work_area_id, day_block_id) VALUES (?, ?, 'wa-zimmer-1', 'blk-1-vm')`,
).run(randomUUID(), doc);
db.exec(
  `INSERT INTO closures (id, start_date, end_date, skeleton_staff) VALUES ('c1', '2026-12-21', '2026-12-31', 1)`,
);

const applied = runMigrations(db, dir);
console.log('applied', applied);
console.log('version', db.pragma('user_version', { simple: true }));
console.log('foreign_keys', db.pragma('foreign_keys', { simple: true }));
console.log(
  'employees',
  db.prepare(`SELECT first_name, staff_type FROM employees ORDER BY first_name`).all(),
);
console.log(
  'users->employee',
  db
    .prepare(
      `SELECT u.username, e.first_name FROM users u JOIN employees e ON e.id = u.employee_id`,
    )
    .all(),
);
console.log('worktimes', db.prepare(`SELECT weekday, location FROM employee_worktimes`).all());
console.log('blocks', db.prepare(`SELECT id, plan FROM day_blocks ORDER BY plan`).all());
console.log('area blocks', db.prepare(`SELECT * FROM work_area_blocks`).all());
console.log(
  'areas',
  db.prepare(`SELECT id, plan, location, follow_up_area_id FROM work_areas`).all(),
);
console.log(
  'assignments',
  db.prepare(`SELECT day_block_id, work_area_id, source FROM assignments`).all(),
);
console.log('template', db.prepare(`SELECT day_block_id FROM template_assignments`).all());
console.log('closures', db.prepare(`SELECT * FROM closures`).all());
console.log('fk check', db.prepare('PRAGMA foreign_key_check').all());
db.prepare(
  `INSERT INTO employees (id, first_name, last_name, staff_type, employment) VALUES (?, 'Neu', 'P', 'pcm', 'fulltime')`,
).run(randomUUID());
db.prepare(
  `INSERT INTO assignments (id, date, day_block_id, work_area_id, employee_id, source) VALUES (?, '2026-08-04', 'blk-1-vm-doctor', 'wa-zimmer-1', ?, 'kept')`,
).run(randomUUID(), doc);
// Kaskade funktioniert nach dem Umbau weiterhin.
db.prepare(`DELETE FROM employees WHERE id = ?`).run(doc);
console.log('assignments after cascade', db.prepare(`SELECT COUNT(*) AS n FROM assignments`).get());
console.log('OK');
