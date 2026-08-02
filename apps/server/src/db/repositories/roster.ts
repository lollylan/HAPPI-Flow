import { randomUUID } from 'node:crypto';
import type {
  Assignment,
  AssignmentSource,
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

/** Zuweisungen eines Zeitraums, optional auf einen der beiden Plaene begrenzt. */
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

export function listLockedAssignments(
  db: Db,
  from: IsoDate,
  to: IsoDate,
  plan: PlanKind,
): Assignment[] {
  return listAssignments(db, from, to, plan).filter((entry) => entry.isLocked);
}

/**
 * Ersetzt die Woche eines Plans.
 *
 * Gesperrte Zuweisungen bleiben unangetastet - sie sind bereits als
 * Fixpunkte in die Berechnung eingeflossen und wuerden sonst doppelt
 * angelegt.
 */
export function replaceWeek(
  db: Db,
  plan: PlanKind,
  from: IsoDate,
  to: IsoDate,
  assignments: readonly PlannedAssignment[],
): void {
  db.transaction(() => {
    db.prepare(
      `DELETE FROM assignments
        WHERE date BETWEEN ? AND ?
          AND is_locked = 0
          AND work_area_id IN (SELECT id FROM work_areas WHERE plan = ?)`,
    ).run(from, to, plan);

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
export function historyCounts(
  db: Db,
  plan: PlanKind,
  weekStart: IsoDate,
  weeks: number,
): HistoryCount[] {
  const from = addDays(weekStart, -7 * weeks);
  const to = addDays(weekStart, -1);
  const rows = db
    .prepare(
      `SELECT a.employee_id, a.work_area_id, COUNT(*) AS n
         FROM assignments a
         JOIN work_areas w ON w.id = a.work_area_id
        WHERE a.date BETWEEN ? AND ? AND w.plan = ?
     GROUP BY a.employee_id, a.work_area_id`,
    )
    .all(from, to, plan) as { employee_id: string; work_area_id: string; n: number }[];

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

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    workAreaId: row.work_area_id,
    dayBlockId: row.day_block_id,
  }));
}

/** Ersetzt die Musterwoche eines Plans vollstaendig. */
export function replaceTemplate(
  db: Db,
  plan: PlanKind,
  entries: readonly Omit<TemplateAssignment, 'id'>[],
): TemplateAssignment[] {
  db.transaction(() => {
    db.prepare(
      `DELETE FROM template_assignments
        WHERE work_area_id IN (SELECT id FROM work_areas WHERE plan = ?)`,
    ).run(plan);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO template_assignments (id, employee_id, work_area_id, day_block_id)
       VALUES (?, ?, ?, ?)`,
    );
    for (const entry of entries) {
      insert.run(randomUUID(), entry.employeeId, entry.workAreaId, entry.dayBlockId);
    }
  })();
  return listTemplate(db, plan);
}
