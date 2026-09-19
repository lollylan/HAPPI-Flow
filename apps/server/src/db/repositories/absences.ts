import { randomUUID } from 'node:crypto';
import type {
  Absence,
  AbsenceStatus,
  AbsenceType,
  Closure,
  ClosureDuty,
  HalfDay,
  Id,
  IsoDate,
  PracticeWeekday,
  RecurringAbsence,
} from '@haeppi/shared';
import type { Db } from '../index.js';

interface AbsenceRow {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  type: AbsenceType;
  status: AbsenceStatus;
  half_day: HalfDay | null;
  note: string;
  created_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

const toAbsence = (row: AbsenceRow): Absence => ({
  id: row.id,
  employeeId: row.employee_id,
  startDate: row.start_date,
  endDate: row.end_date,
  type: row.type,
  status: row.status,
  halfDay: row.half_day,
  note: row.note,
  createdBy: row.created_by,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  createdAt: row.created_at,
});

export function listAbsences(db: Db, from: IsoDate, to: IsoDate): Absence[] {
  return (
    db
      .prepare(
        `SELECT * FROM absences
          WHERE start_date <= ? AND end_date >= ? AND status != 'rejected'
          ORDER BY start_date`,
      )
      .all(to, from) as AbsenceRow[]
  ).map(toAbsence);
}

export function listAbsencesOfEmployee(db: Db, employeeId: Id, year?: number): Absence[] {
  const rows = year
    ? (db
        .prepare(
          `SELECT * FROM absences
            WHERE employee_id = ? AND start_date <= ? AND end_date >= ?
            ORDER BY start_date`,
        )
        .all(employeeId, `${year}-12-31`, `${year}-01-01`) as AbsenceRow[])
    : (db
        .prepare(`SELECT * FROM absences WHERE employee_id = ? ORDER BY start_date`)
        .all(employeeId) as AbsenceRow[]);
  return rows.map(toAbsence);
}

export function getAbsence(db: Db, id: Id): Absence | null {
  const row = db.prepare(`SELECT * FROM absences WHERE id = ?`).get(id) as AbsenceRow | undefined;
  return row ? toAbsence(row) : null;
}

export interface AbsenceInput {
  readonly employeeId: Id;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly type: AbsenceType;
  readonly status: AbsenceStatus;
  readonly halfDay: HalfDay | null;
  readonly note: string;
}

export function createAbsence(db: Db, input: AbsenceInput, createdBy: Id | null): Absence {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO absences
       (id, employee_id, start_date, end_date, type, status, half_day, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.employeeId,
    input.startDate,
    input.endDate,
    input.type,
    input.status,
    input.halfDay,
    input.note,
    createdBy,
  );
  return getAbsence(db, id)!;
}

export function decideAbsence(
  db: Db,
  id: Id,
  status: AbsenceStatus,
  decidedBy: Id,
): Absence | null {
  const result = db
    .prepare(
      `UPDATE absences
          SET status = ?, decided_by = ?, decided_at = datetime('now')
        WHERE id = ?`,
    )
    .run(status, decidedBy, id);
  return result.changes > 0 ? getAbsence(db, id) : null;
}

export function deleteAbsence(db: Db, id: Id): boolean {
  return db.prepare(`DELETE FROM absences WHERE id = ?`).run(id).changes > 0;
}

export function countOpenRequests(db: Db): number {
  return (
    db.prepare(`SELECT COUNT(*) AS n FROM absences WHERE status = 'requested'`).get() as {
      n: number;
    }
  ).n;
}

// --------------------------------------------------- Wiederkehrende Tage --

export function listRecurringAbsences(db: Db, employeeId?: Id): RecurringAbsence[] {
  const rows = employeeId
    ? (db
        .prepare(`SELECT * FROM recurring_absences WHERE employee_id = ?`)
        .all(employeeId) as Record<string, unknown>[])
    : (db.prepare(`SELECT * FROM recurring_absences`).all() as Record<string, unknown>[]);

  return rows.map((row) => ({
    id: row.id as string,
    employeeId: row.employee_id as string,
    weekday: row.weekday as PracticeWeekday,
    type: row.type as AbsenceType,
    validFrom: row.valid_from as string,
    validTo: (row.valid_to as string | null) ?? null,
    note: row.note as string,
  }));
}

export function createRecurringAbsence(
  db: Db,
  input: Omit<RecurringAbsence, 'id'>,
): RecurringAbsence {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO recurring_absences (id, employee_id, weekday, type, valid_from, valid_to, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.employeeId,
    input.weekday,
    input.type,
    input.validFrom,
    input.validTo,
    input.note,
  );
  return { id, ...input };
}

export function deleteRecurringAbsence(db: Db, id: Id): boolean {
  return db.prepare(`DELETE FROM recurring_absences WHERE id = ?`).run(id).changes > 0;
}

// ------------------------------------------------------------ Schliesszeiten --

interface ClosureRow {
  id: string;
  start_date: string;
  end_date: string;
  description: string;
  skeleton_staff: number;
  prep_days: number;
  prep_staff: number;
}

const toClosure = (row: ClosureRow): Closure => ({
  id: row.id,
  startDate: row.start_date,
  endDate: row.end_date,
  description: row.description,
  skeletonStaff: row.skeleton_staff,
  prepDays: row.prep_days,
  prepStaff: row.prep_staff,
});

export function listClosures(db: Db): Closure[] {
  return (db.prepare(`SELECT * FROM closures ORDER BY start_date`).all() as ClosureRow[]).map(
    toClosure,
  );
}

export function getClosure(db: Db, id: Id): Closure | null {
  const row = db.prepare(`SELECT * FROM closures WHERE id = ?`).get(id) as ClosureRow | undefined;
  return row ? toClosure(row) : null;
}

/** Schliesszeiten, die einen Zeitraum beruehren. */
export function listClosuresInRange(db: Db, from: IsoDate, to: IsoDate): Closure[] {
  return (
    db
      .prepare(`SELECT * FROM closures WHERE start_date <= ? AND end_date >= ? ORDER BY start_date`)
      .all(to, from) as ClosureRow[]
  ).map(toClosure);
}

export function createClosure(db: Db, input: Omit<Closure, 'id'>): Closure {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO closures
       (id, start_date, end_date, description, skeleton_staff, prep_days, prep_staff)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.startDate,
    input.endDate,
    input.description,
    input.skeletonStaff,
    input.prepDays,
    input.prepStaff,
  );
  return { id, ...input };
}

export function updateClosure(db: Db, id: Id, input: Omit<Closure, 'id'>): Closure | null {
  const result = db
    .prepare(
      `UPDATE closures
          SET start_date = ?, end_date = ?, description = ?, skeleton_staff = ?,
              prep_days = ?, prep_staff = ?
        WHERE id = ?`,
    )
    .run(
      input.startDate,
      input.endDate,
      input.description,
      input.skeletonStaff,
      input.prepDays,
      input.prepStaff,
      id,
    );
  return result.changes > 0 ? getClosure(db, id) : null;
}

export function deleteClosure(db: Db, id: Id): boolean {
  return db.prepare(`DELETE FROM closures WHERE id = ?`).run(id).changes > 0;
}

// ------------------------------------------------------------ Notbesetzung --

interface DutyRow {
  id: string;
  closure_id: string;
  employee_id: string;
  date: string;
  kind: 'prep' | 'skeleton';
}

const toDuty = (row: DutyRow): ClosureDuty => ({
  id: row.id,
  closureId: row.closure_id,
  employeeId: row.employee_id,
  date: row.date,
});

export function listClosureDuties(db: Db, closureId: Id): ClosureDuty[] {
  return (
    db
      .prepare(`SELECT * FROM closure_duties WHERE closure_id = ? ORDER BY date, employee_id`)
      .all(closureId) as DutyRow[]
  ).map(toDuty);
}

export function listDutiesInRange(db: Db, from: IsoDate, to: IsoDate): ClosureDuty[] {
  return (
    db
      .prepare(`SELECT * FROM closure_duties WHERE date BETWEEN ? AND ? ORDER BY date, employee_id`)
      .all(from, to) as DutyRow[]
  ).map(toDuty);
}

/** Bisherige Notdienst-Tage je Person - Grundlage der fairen Rotation. */
export function dutyHistory(db: Db, before: IsoDate): { employeeId: Id; days: number }[] {
  return (
    db
      .prepare(
        `SELECT employee_id, COUNT(*) AS n FROM closure_duties
          WHERE date < ? GROUP BY employee_id`,
      )
      .all(before) as { employee_id: string; n: number }[]
  ).map((row) => ({ employeeId: row.employee_id, days: row.n }));
}

export function replaceClosureDuties(
  db: Db,
  closureId: Id,
  duties: readonly { employeeId: Id; date: IsoDate; kind: 'prep' | 'skeleton' }[],
): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM closure_duties WHERE closure_id = ?`).run(closureId);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO closure_duties (id, closure_id, employee_id, date, kind)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const duty of duties) {
      insert.run(randomUUID(), closureId, duty.employeeId, duty.date, duty.kind);
    }
  })();
}

// ------------------------------------------------------------ Urlaubskonto --

export interface VacationAccountRow {
  readonly employeeId: Id;
  readonly year: number;
  readonly entitlement: number;
  readonly carryover: number;
  readonly carryoverExpires: IsoDate | null;
}

export function getVacationAccount(db: Db, employeeId: Id, year: number): VacationAccountRow {
  const row = db
    .prepare(`SELECT * FROM vacation_accounts WHERE employee_id = ? AND year = ?`)
    .get(employeeId, year) as Record<string, unknown> | undefined;

  return {
    employeeId,
    year,
    entitlement: (row?.entitlement as number) ?? 0,
    carryover: (row?.carryover as number) ?? 0,
    carryoverExpires: (row?.carryover_expires as string | null) ?? null,
  };
}

export function setVacationAccount(db: Db, input: VacationAccountRow): void {
  db.prepare(
    `INSERT INTO vacation_accounts (employee_id, year, entitlement, carryover, carryover_expires)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (employee_id, year) DO UPDATE SET
       entitlement = excluded.entitlement,
       carryover = excluded.carryover,
       carryover_expires = excluded.carryover_expires`,
  ).run(input.employeeId, input.year, input.entitlement, input.carryover, input.carryoverExpires);
}
