/**
 * Legt ein Beispielteam in der **Entwicklungs**-Datenbank an, damit sich die
 * Oberflaeche mit realistischen Daten ausprobieren laesst. Nie gegen die
 * Praxisdatenbank laufen lassen - der Pfad ist fest auf `dev/` gesetzt.
 *
 * Aufruf: npx tsx apps/server/scripts/seed-dev-team.ts
 */
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { WeeklyWorkTimes } from '@haeppi/shared';
import { mkdirSync } from 'node:fs';
import { openDatabase } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { isSeeded, seedDatabase } from '../src/db/seed.js';
import { createEmployee } from '../src/db/repositories/employees.js';
import { replaceMatrixForEmployee } from '../src/db/repositories/matrix.js';

const base = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
const dir = path.join(base, 'HAEPPI-Flow', 'dev');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'haeppi.db');
const db = openDatabase(file);

// Auch auf einer ganz frischen Datei lauffaehig: Schema und Praxis-Vorlage
// entstehen sonst erst beim ersten Serverstart.
runMigrations(db);
if (!isSeeded(db)) seedDatabase(db);

const existing = db.prepare('SELECT COUNT(*) AS n FROM employees').get() as { n: number };
if (existing.n > 0) {
  console.log(`Es gibt schon ${existing.n} Personen - nichts angelegt.`);
  process.exit(0);
}

const day = (from: number, to: number, location: 'practice' | 'home' = 'practice') => ({
  isWorking: true,
  startMin: from * 60,
  endMin: to * 60,
  breakMin: 60,
  location,
});
const off = {
  isWorking: false,
  startMin: 0,
  endMin: 0,
  breakMin: 0,
  location: 'practice' as const,
};

const full: WeeklyWorkTimes = {
  1: day(8, 18),
  2: day(8, 18),
  3: day(8, 16),
  4: day(8, 18),
  5: day(8, 16),
};

const team = [
  { first: 'Florian', last: 'Rasche', type: 'doctor', color: '#2563eb', hours: 40, work: full },
  {
    first: 'Lisa',
    last: 'Will',
    type: 'doctor',
    color: '#7c3aed',
    hours: 30,
    work: { ...full, 3: off },
  },
  { first: 'Heidi', last: 'Ganz', type: 'pcm', color: '#8b5cf6', hours: 38.5, work: full },
  {
    first: 'Sonja',
    last: 'Christ',
    type: 'mfa',
    color: '#f59e0b',
    hours: 38.5,
    work: { ...full, 3: day(8, 16, 'home') },
    home: true,
  },
  { first: 'Claudia', last: 'Fischer', type: 'mfa', color: '#ef4444', hours: 38.5, work: full },
  {
    first: 'Nicole',
    last: 'Schlötter',
    type: 'mfa',
    color: '#10b981',
    hours: 38.5,
    work: full,
    verah: true,
  },
  { first: 'Ledia', last: 'Balliaj', type: 'mfa', color: '#06b6d4', hours: 38.5, work: full },
  {
    first: 'Ludmila',
    last: 'Hieb',
    type: 'trainee',
    color: '#ec4899',
    hours: 38.5,
    work: full,
    school: [1, 2],
  },
  {
    first: 'Darian',
    last: 'Azubi',
    type: 'trainee',
    color: '#84cc16',
    hours: 38.5,
    work: full,
    school: [3, 5],
  },
] as const;

let order = 1;
for (const person of team) {
  const employee = createEmployee(db, {
    firstName: person.first,
    lastName: person.last,
    staffType: person.type,
    employment: person.hours >= 38 ? 'fulltime' : 'parttime',
    targetHoursPerWeek: person.hours,
    canHomeoffice: 'home' in person && person.home === true,
    color: person.color,
    entryDate: null,
    exitDate: null,
    isActive: true,
    sortOrder: order++,
    notes: '',
    workTimes: person.work,
    skillIds:
      person.type === 'mfa' || person.type === 'trainee'
        ? [
            'skl-blutentnahme',
            'skl-rezeption',
            ...('verah' in person && person.verah ? ['skl-verah'] : []),
          ]
        : [],
  });

  if ('school' in person) {
    for (const weekday of person.school) {
      db.prepare(
        `INSERT INTO recurring_absences (id, employee_id, weekday, type, valid_from, note)
         VALUES (?, ?, ?, 'school', '2026-09-01', 'Berufsschule')`,
      ).run(randomUUID(), employee.id, weekday);
    }
    // Auszubildende: Labor nur mit Betreuung, Telefon gesperrt.
    replaceMatrixForEmployee(db, employee.id, [
      {
        workAreaId: 'wa-labor',
        clearance: 'supervised',
        preference: 'neutral',
        minPerWeek: null,
        maxPerWeek: null,
        exemptRotation: false,
      },
      {
        workAreaId: 'wa-telefon',
        clearance: 'blocked',
        preference: 'neutral',
        minPerWeek: null,
        maxPerWeek: null,
        exemptRotation: false,
      },
    ]);
  }

  if (person.first === 'Sonja') {
    replaceMatrixForEmployee(db, employee.id, [
      {
        workAreaId: 'wa-backoffice',
        clearance: 'solo',
        preference: 'preferred',
        minPerWeek: null,
        maxPerWeek: null,
        exemptRotation: false,
      },
    ]);
  }
}

db.prepare(
  `INSERT INTO closures (id, start_date, end_date, description, skeleton_staff, prep_days, prep_staff)
            VALUES (?, '2026-12-24', '2027-01-03', 'Weihnachten', 0, 2, 1)`,
).run(randomUUID());

console.log(`Beispielteam angelegt in ${file}`);
db.close();
