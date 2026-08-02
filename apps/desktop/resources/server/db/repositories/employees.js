import { randomUUID } from 'node:crypto';
import { NOT_WORKING, PRACTICE_WEEKDAYS } from '@haeppi/shared';
function emptyWorkTimes() {
    return { 1: NOT_WORKING, 2: NOT_WORKING, 3: NOT_WORKING, 4: NOT_WORKING, 5: NOT_WORKING };
}
function toWorkTimes(rows) {
    const result = emptyWorkTimes();
    for (const row of rows) {
        result[row.weekday] = {
            isWorking: row.is_working === 1,
            startMin: row.start_min,
            endMin: row.end_min,
            breakMin: row.break_min,
        };
    }
    return result;
}
function toEmployee(row, workTimes, skillIds) {
    return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        staffType: row.staff_type,
        isPcm: row.is_pcm === 1,
        employment: row.employment,
        targetHoursPerWeek: row.target_hours_week,
        canHomeoffice: row.can_homeoffice === 1,
        color: row.color,
        entryDate: row.entry_date,
        exitDate: row.exit_date,
        isActive: row.is_active === 1,
        sortOrder: row.sort_order,
        notes: row.notes,
        workTimes,
        skillIds,
        version: row.version,
    };
}
/**
 * Laedt alle Mitarbeiter samt Arbeitszeiten und Qualifikationen.
 *
 * Bewusst drei Abfragen statt eines Joins mit Zeilenvervielfachung: die
 * Praxis hat ein knappes Dutzend Personen, und der Code bleibt lesbar.
 */
export function listEmployees(db, options = {}) {
    const rows = db
        .prepare(`SELECT * FROM employees
        ${options.includeInactive ? '' : 'WHERE is_active = 1'}
        ORDER BY staff_type, sort_order, last_name, first_name`)
        .all();
    if (rows.length === 0)
        return [];
    const workTimeRows = db.prepare(`SELECT * FROM employee_worktimes`).all();
    const skillRows = db.prepare(`SELECT employee_id, skill_id FROM employee_skills`).all();
    const workTimesByEmployee = new Map();
    for (const row of workTimeRows) {
        const list = workTimesByEmployee.get(row.employee_id) ?? [];
        list.push(row);
        workTimesByEmployee.set(row.employee_id, list);
    }
    const skillsByEmployee = new Map();
    for (const row of skillRows) {
        const list = skillsByEmployee.get(row.employee_id) ?? [];
        list.push(row.skill_id);
        skillsByEmployee.set(row.employee_id, list);
    }
    return rows.map((row) => toEmployee(row, toWorkTimes(workTimesByEmployee.get(row.id) ?? []), skillsByEmployee.get(row.id) ?? []));
}
export function getEmployee(db, id) {
    const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
    if (!row)
        return null;
    const workTimes = db
        .prepare(`SELECT * FROM employee_worktimes WHERE employee_id = ?`)
        .all(id);
    const skills = db
        .prepare(`SELECT skill_id FROM employee_skills WHERE employee_id = ?`)
        .all(id);
    return toEmployee(row, toWorkTimes(workTimes), skills.map((entry) => entry.skill_id));
}
export function replaceWorkTimes(db, employeeId, workTimes) {
    db.prepare(`DELETE FROM employee_worktimes WHERE employee_id = ?`).run(employeeId);
    const insert = db.prepare(`INSERT INTO employee_worktimes
       (employee_id, weekday, is_working, start_min, end_min, break_min)
     VALUES (?, ?, ?, ?, ?, ?)`);
    for (const weekday of PRACTICE_WEEKDAYS) {
        const day = workTimes[weekday];
        insert.run(employeeId, weekday, day.isWorking ? 1 : 0, day.startMin, day.endMin, day.breakMin);
    }
}
export function replaceSkills(db, employeeId, skillIds) {
    db.prepare(`DELETE FROM employee_skills WHERE employee_id = ?`).run(employeeId);
    const insert = db.prepare(`INSERT OR IGNORE INTO employee_skills (employee_id, skill_id) VALUES (?, ?)`);
    for (const skillId of new Set(skillIds))
        insert.run(employeeId, skillId);
}
export function createEmployee(db, input) {
    const id = randomUUID();
    const write = db.transaction(() => {
        db.prepare(`INSERT INTO employees
         (id, first_name, last_name, staff_type, is_pcm, employment, target_hours_week,
          can_homeoffice, color, entry_date, exit_date, is_active, sort_order, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.firstName, input.lastName, input.staffType, input.isPcm ? 1 : 0, input.employment, input.targetHoursPerWeek, input.canHomeoffice ? 1 : 0, input.color, input.entryDate, input.exitDate, input.isActive ? 1 : 0, input.sortOrder, input.notes);
        replaceWorkTimes(db, id, input.workTimes);
        replaceSkills(db, id, input.skillIds);
    });
    write();
    const created = getEmployee(db, id);
    if (!created)
        throw new Error('Mitarbeiter konnte nicht angelegt werden.');
    return created;
}
export function updateEmployee(db, id, input) {
    const write = db.transaction(() => {
        const result = db
            .prepare(`UPDATE employees
            SET first_name = ?, last_name = ?, staff_type = ?, is_pcm = ?, employment = ?,
                target_hours_week = ?, can_homeoffice = ?, color = ?, entry_date = ?,
                exit_date = ?, is_active = ?, sort_order = ?, notes = ?,
                version = version + 1, updated_at = datetime('now')
          WHERE id = ?`)
            .run(input.firstName, input.lastName, input.staffType, input.isPcm ? 1 : 0, input.employment, input.targetHoursPerWeek, input.canHomeoffice ? 1 : 0, input.color, input.entryDate, input.exitDate, input.isActive ? 1 : 0, input.sortOrder, input.notes, id);
        if (result.changes === 0)
            throw new Error('NOT_FOUND');
        replaceWorkTimes(db, id, input.workTimes);
        replaceSkills(db, id, input.skillIds);
    });
    write();
    const updated = getEmployee(db, id);
    if (!updated)
        throw new Error('NOT_FOUND');
    return updated;
}
/**
 * Setzt den Mitarbeiter inaktiv statt ihn zu loeschen.
 *
 * Ein echtes DELETE wuerde per Kaskade die gesamte Vergangenheit
 * mitnehmen - Dienstplaene, Urlaubskonten, Krankmeldungen. Wer die Praxis
 * verlaesst, verschwindet aus der Planung, nicht aus der Historie.
 */
export function deactivateEmployee(db, id) {
    return (db
        .prepare(`UPDATE employees
            SET is_active = 0, version = version + 1, updated_at = datetime('now')
          WHERE id = ?`)
        .run(id).changes > 0);
}
//# sourceMappingURL=employees.js.map