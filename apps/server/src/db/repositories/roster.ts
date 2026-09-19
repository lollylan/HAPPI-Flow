import { randomUUID } from 'node:crypto';
import type {
  Assignment,
  AssignmentSource,
  Diagnostic,
  FixedAssignment,
  HistoryCount,
  Id,
  IsoDate,
  PlanKind,
  PlannedAssignment,
  TemplateAssignment,
} from '@haeppi/shared';
import { addDays } from '@haeppi/shared';
import type { Db } from '../index.js';

interface AssignmentRow {
  id: string;
  date: string;
  day_block_id: string;
  work_area_id: string;
  employee_id: string;
  source: AssignmentSource;
  is_locked: number;
  reason: string;
}

const toAssignment = (row: AssignmentRow): Assignment => ({
  id: row.id,
  date: row.date,
  dayBlockId: row.day_block_id,
  workAreaId: row.work_area_id,
  employeeId: row.employee_id,
  source: row.source,
  isLocked: row.is_locked === 1,
  reason: row.reason,
});

/** Zuweisungen eines Zeitraums, optional auf eine Gruppe begrenzt. */
export function listAssignments(db: Db, from: IsoDate, to: IsoDate, plan?: PlanKind): Assignment[] {
  const rows = plan
    ? (db
        .prepare(
          `SELECT a.* FROM assignments a
             JOIN work_areas w ON w.id = a.work_area_id
            WHERE a.date BETWEEN ? AND ? AND w.plan = ?
            ORDER BY a.date, a.work_area_id`,
        )
        .all(from, to, plan) as AssignmentRow[])
    : (db
        .prepare(`SELECT * FROM assignments WHERE date BETWEEN ? AND ? ORDER BY date, work_area_id`)
        .all(from, to) as AssignmentRow[]);
  return rows.map(toAssignment);
}

export function listAssignmentsOfEmployee(
  db: Db,
  employeeId: Id,
  from: IsoDate,
  to: IsoDate,
): Assignment[] {
  return (
    db
      .prepare(
        `SELECT * FROM assignments WHERE employee_id = ? AND date BETWEEN ? AND ? ORDER BY date`,
      )
      .all(employeeId, from, to) as AssignmentRow[]
  ).map(toAssignment);
}

const toFixed = (entry: Assignment): FixedAssignment => ({
  date: entry.date,
  dayBlockId: entry.dayBlockId,
  workAreaId: entry.workAreaId,
  employeeId: entry.employeeId,
});

/** Gesperrte Zuweisungen der Woche - die Fixpunkte jeder Berechnung. */
export function listLockedAssignments(db: Db, from: IsoDate, to: IsoDate): FixedAssignment[] {
  return listAssignments(db, from, to)
    .filter((entry) => entry.isLocked)
    .map(toFixed);
}

/** Ungesperrte Zuweisungen der Woche - die bisherige Loesung bei einer Umplanung. */
export function listUnlockedAssignments(db: Db, from: IsoDate, to: IsoDate): FixedAssignment[] {
  return listAssignments(db, from, to)
    .filter((entry) => !entry.isLocked)
    .map(toFixed);
}

/** Ob fuer die Woche ueberhaupt schon geplant wurde. */
export function hasAssignments(db: Db, from: IsoDate, to: IsoDate): boolean {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM assignments WHERE date BETWEEN ? AND ?`)
    .get(from, to) as { n: number };
  return row.n > 0;
}

/**
 * Ersetzt die Woche fuer alle Gruppen.
 *
 * Gesperrte Zuweisungen bleiben unangetastet - sie sind bereits als
 * Fixpunkte in die Berechnung eingeflossen und wuerden sonst doppelt
 * angelegt.
 */
export function replaceWeek(
  db: Db,
  from: IsoDate,
  to: IsoDate,
  assignments: readonly PlannedAssignment[],
): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM assignments WHERE date BETWEEN ? AND ? AND is_locked = 0`).run(
      from,
      to,
    );

    const insert = db.prepare(
      `INSERT OR IGNORE INTO assignments
         (id, date, day_block_id, work_area_id, employee_id, source, is_locked, reason)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    );
    for (const entry of assignments) {
      // Gesperrte Zuweisungen stehen schon in der Datenbank; der eindeutige
      // Index (date, block, employee) faengt sie hier ab.
      if (entry.source === 'manual') continue;
      insert.run(
        randomUUID(),
        entry.date,
        entry.dayBlockId,
        entry.workAreaId,
        entry.employeeId,
        entry.source,
        entry.reason,
      );
    }
  })();
}

/**
 * Ob die Person im Zeitfenster schon woanders steht - auch in einem anders
 * geschnittenen Block einer anderen Gruppe. Der eindeutige Index faengt
 * nur denselben Block ab.
 */
export function findTimeConflict(
  db: Db,
  employeeId: Id,
  date: IsoDate,
  startMin: number,
  endMin: number,
): Assignment | null {
  const row = db
    .prepare(
      `SELECT a.* FROM assignments a
         JOIN day_blocks b ON b.id = a.day_block_id
        WHERE a.employee_id = ? AND a.date = ? AND b.start_min < ? AND ? < b.end_min
        LIMIT 1`,
    )
    .get(employeeId, date, endMin, startMin) as AssignmentRow | undefined;
  return row ? toAssignment(row) : null;
}

export function createAssignment(
  db: Db,
  input: Omit<Assignment, 'id' | 'source' | 'reason'> & { reason?: string },
): Assignment | null {
  const id = randomUUID();
  try {
    db.prepare(
      `INSERT INTO assignments
         (id, date, day_block_id, work_area_id, employee_id, source, is_locked, reason)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`,
    ).run(
      id,
      input.date,
      input.dayBlockId,
      input.workAreaId,
      input.employeeId,
      input.isLocked ? 1 : 0,
      input.reason ?? 'von Hand gesetzt',
    );
  } catch {
    // Der eindeutige Index verhindert, dass jemand zweimal im selben Block steht.
    return null;
  }
  const row = db.prepare(`SELECT * FROM assignments WHERE id = ?`).get(id) as AssignmentRow;
  return toAssignment(row);
}

export function deleteAssignment(db: Db, id: Id): boolean {
  return db.prepare(`DELETE FROM assignments WHERE id = ?`).run(id).changes > 0;
}

export function setAssignmentLock(db: Db, id: Id, locked: boolean): Assignment | null {
  const result = db
    .prepare(`UPDATE assignments SET is_locked = ? WHERE id = ?`)
    .run(locked ? 1 : 0, id);
  if (result.changes === 0) return null;
  const row = db.prepare(`SELECT * FROM assignments WHERE id = ?`).get(id) as AssignmentRow;
  return toAssignment(row);
}

/**
 * Einsaetze der zurueckliegenden Wochen je (Person, Bereich).
 * Grundlage fuer den Fairness-Ausgleich: wer zuletzt oft im Labor stand,
 * wird diese Woche etwas teurer.
 */
export function historyCounts(db: Db, weekStart: IsoDate, weeks: number): HistoryCount[] {
  const from = addDays(weekStart, -7 * weeks);
  const to = addDays(weekStart, -1);
  const rows = db
    .prepare(
      `SELECT employee_id, work_area_id, COUNT(*) AS n
         FROM assignments
        WHERE date BETWEEN ? AND ?
     GROUP BY employee_id, work_area_id`,
    )
    .all(from, to) as { employee_id: string; work_area_id: string; n: number }[];

  return rows.map((row) => ({
    employeeId: row.employee_id,
    workAreaId: row.work_area_id,
    count: row.n,
  }));
}

// ----------------------------------------------------------- Musterwoche --

interface TemplateRow {
  id: string;
  employee_id: string;
  work_area_id: string;
  day_block_id: string;
}

const toTemplate = (row: TemplateRow): TemplateAssignment => ({
  id: row.id,
  employeeId: row.employee_id,
  workAreaId: row.work_area_id,
  dayBlockId: row.day_block_id,
});

export function listTemplate(db: Db, plan?: PlanKind): TemplateAssignment[] {
  const rows = plan
    ? (db
        .prepare(
          `SELECT t.* FROM template_assignments t
             JOIN work_areas w ON w.id = t.work_area_id
            WHERE w.plan = ?`,
        )
        .all(plan) as TemplateRow[])
    : (db.prepare(`SELECT * FROM template_assignments`).all() as TemplateRow[]);
  return rows.map(toTemplate);
}

/** Ersetzt die gesamte Musterwoche (alle Gruppen). */
export function replaceTemplate(
  db: Db,
  entries: readonly Omit<TemplateAssignment, 'id'>[],
): TemplateAssignment[] {
  db.transaction(() => {
    db.prepare(`DELETE FROM template_assignments`).run();
    const insert = db.prepare(
      `INSERT OR IGNORE INTO template_assignments (id, employee_id, work_area_id, day_block_id)
       VALUES (?, ?, ?, ?)`,
    );
    for (const entry of entries) {
      insert.run(randomUUID(), entry.employeeId, entry.workAreaId, entry.dayBlockId);
    }
  })();
  return listTemplate(db);
}

/**
 * Uebernimmt eine konkrete Woche als Musterwoche: was diese Woche stand,
 * ist ab jetzt der Normalfall. So entsteht die Vorlage aus der Praxis
 * statt am Reissbrett.
 */
export function templateFromWeek(db: Db, from: IsoDate, to: IsoDate): TemplateAssignment[] {
  const week = listAssignments(db, from, to);
  const seen = new Set<string>();
  const entries: Omit<TemplateAssignment, 'id'>[] = [];
  for (const entry of week) {
    const key = `${entry.employeeId}|${entry.dayBlockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      employeeId: entry.employeeId,
      workAreaId: entry.workAreaId,
      dayBlockId: entry.dayBlockId,
    });
  }
  return replaceTemplate(db, entries);
}

// -------------------------------------------------------- Planungslaeufe --

export interface PlanRun {
  readonly id: Id;
  readonly weekStart: IsoDate;
  readonly mode: string;
  readonly dryRun: boolean;
  readonly at: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly score: number;
}

export function savePlanRun(
  db: Db,
  input: {
    weekStart: IsoDate;
    mode: string;
    dryRun: boolean;
    userId: Id | null;
    diagnostics: readonly Diagnostic[];
    score: number;
  },
): void {
  db.prepare(
    `INSERT INTO plan_runs (id, week_start, mode, dry_run, user_id, diagnostics, score)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.weekStart,
    input.mode,
    input.dryRun ? 1 : 0,
    input.userId,
    JSON.stringify(input.diagnostics),
    input.score,
  );
}

/** Der letzte gespeicherte (nicht probeweise) Lauf einer Woche. */
export function lastPlanRun(db: Db, weekStart: IsoDate): PlanRun | null {
  const row = db
    .prepare(
      `SELECT * FROM plan_runs WHERE week_start = ? AND dry_run = 0
        ORDER BY at DESC, rowid DESC LIMIT 1`,
    )
    .get(weekStart) as
    | {
        id: string;
        week_start: string;
        mode: string;
        dry_run: number;
        at: string;
        diagnostics: string;
        score: number;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    weekStart: row.week_start,
    mode: row.mode,
    dryRun: row.dry_run === 1,
    at: row.at,
    diagnostics: parseDiagnostics(row.diagnostics),
    score: row.score,
  };
}

function parseDiagnostics(text: string): Diagnostic[] {
  try {
    return JSON.parse(text) as Diagnostic[];
  } catch {
    // Ein beschaedigter Eintrag darf die Wochenansicht nicht anhalten.
    return [];
  }
}
