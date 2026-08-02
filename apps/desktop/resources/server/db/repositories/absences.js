import { randomUUID } from 'node:crypto';
const toAbsence = (row) => ({
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
export function listAbsences(db, from, to) {
    return db
        .prepare(`SELECT * FROM absences
          WHERE start_date <= ? AND end_date >= ? AND status != 'rejected'
          ORDER BY start_date`)
        .all(to, from).map(toAbsence);
}
export function listAbsencesOfEmployee(db, employeeId, year) {
    const rows = year
        ? db
            .prepare(`SELECT * FROM absences
            WHERE employee_id = ? AND start_date <= ? AND end_date >= ?
            ORDER BY start_date`)
            .all(employeeId, `${year}-12-31`, `${year}-01-01`)
        : db
            .prepare(`SELECT * FROM absences WHERE employee_id = ? ORDER BY start_date`)
            .all(employeeId);
    return rows.map(toAbsence);
}
export function getAbsence(db, id) {
    const row = db.prepare(`SELECT * FROM absences WHERE id = ?`).get(id);
    return row ? toAbsence(row) : null;
}
export function createAbsence(db, input, createdBy) {
    const id = randomUUID();
    db.prepare(`INSERT INTO absences
       (id, employee_id, start_date, end_date, type, status, half_day, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.employeeId, input.startDate, input.endDate, input.type, input.status, input.halfDay, input.note, createdBy);
    return getAbsence(db, id);
}
export function decideAbsence(db, id, status, decidedBy) {
    const result = db
        .prepare(`UPDATE absences
          SET status = ?, decided_by = ?, decided_at = datetime('now')
        WHERE id = ?`)
        .run(status, decidedBy, id);
    return result.changes > 0 ? getAbsence(db, id) : null;
}
export function deleteAbsence(db, id) {
    return db.prepare(`DELETE FROM absences WHERE id = ?`).run(id).changes > 0;
}
export function countOpenRequests(db) {
    return db.prepare(`SELECT COUNT(*) AS n FROM absences WHERE status = 'requested'`).get().n;
}
// --------------------------------------------------- Wiederkehrende Tage --
export function listRecurringAbsences(db, employeeId) {
    const rows = employeeId
        ? db
            .prepare(`SELECT * FROM recurring_absences WHERE employee_id = ?`)
            .all(employeeId)
        : db.prepare(`SELECT * FROM recurring_absences`).all();
    return rows.map((row) => ({
        id: row.id,
        employeeId: row.employee_id,
        weekday: row.weekday,
        type: row.type,
        validFrom: row.valid_from,
        validTo: row.valid_to ?? null,
        note: row.note,
    }));
}
export function createRecurringAbsence(db, input) {
    const id = randomUUID();
    db.prepare(`INSERT INTO recurring_absences (id, employee_id, weekday, type, valid_from, valid_to, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, input.employeeId, input.weekday, input.type, input.validFrom, input.validTo, input.note);
    return { id, ...input };
}
export function deleteRecurringAbsence(db, id) {
    return db.prepare(`DELETE FROM recurring_absences WHERE id = ?`).run(id).changes > 0;
}
// ------------------------------------------------------------ Schliesszeiten --
export function listClosures(db) {
    return db.prepare(`SELECT * FROM closures ORDER BY start_date`).all().map((row) => ({
        id: row.id,
        startDate: row.start_date,
        endDate: row.end_date,
        description: row.description,
        skeletonStaff: row.skeleton_staff,
    }));
}
export function createClosure(db, input) {
    const id = randomUUID();
    db.prepare(`INSERT INTO closures (id, start_date, end_date, description, skeleton_staff)
     VALUES (?, ?, ?, ?, ?)`).run(id, input.startDate, input.endDate, input.description, input.skeletonStaff);
    return { id, ...input };
}
export function deleteClosure(db, id) {
    return db.prepare(`DELETE FROM closures WHERE id = ?`).run(id).changes > 0;
}
export function getVacationAccount(db, employeeId, year) {
    const row = db
        .prepare(`SELECT * FROM vacation_accounts WHERE employee_id = ? AND year = ?`)
        .get(employeeId, year);
    return {
        employeeId,
        year,
        entitlement: row?.entitlement ?? 0,
        carryover: row?.carryover ?? 0,
        carryoverExpires: row?.carryover_expires ?? null,
    };
}
export function setVacationAccount(db, input) {
    db.prepare(`INSERT INTO vacation_accounts (employee_id, year, entitlement, carryover, carryover_expires)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (employee_id, year) DO UPDATE SET
       entitlement = excluded.entitlement,
       carryover = excluded.carryover,
       carryover_expires = excluded.carryover_expires`).run(input.employeeId, input.year, input.entitlement, input.carryover, input.carryoverExpires);
}
//# sourceMappingURL=absences.js.map