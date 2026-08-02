import { DEFAULT_MATRIX_ENTRY } from '@haeppi/shared';
const toEntry = (row) => ({
    employeeId: row.employee_id,
    workAreaId: row.work_area_id,
    clearance: row.clearance,
    preference: row.preference,
    minPerWeek: row.min_per_week,
    maxPerWeek: row.max_per_week,
    exemptRotation: row.exempt_rotation === 1,
});
/**
 * Liefert nur die tatsaechlich gepflegten Felder.
 *
 * Fehlende Kombinationen gelten als Standard (`solo` / `neutral`) und
 * werden nicht gespeichert - sonst haette jede neue Person sofort
 * Dutzende bedeutungsloser Zeilen.
 */
export function listMatrix(db) {
    return db.prepare(`SELECT * FROM employee_area_matrix`).all().map(toEntry);
}
export function listMatrixForEmployee(db, employeeId) {
    return db
        .prepare(`SELECT * FROM employee_area_matrix WHERE employee_id = ?`)
        .all(employeeId).map(toEntry);
}
function isDefault(entry) {
    return (entry.clearance === DEFAULT_MATRIX_ENTRY.clearance &&
        entry.preference === DEFAULT_MATRIX_ENTRY.preference &&
        entry.minPerWeek === null &&
        entry.maxPerWeek === null &&
        !entry.exemptRotation);
}
/** Ersetzt die Matrixzeile einer Person vollstaendig. */
export function replaceMatrixForEmployee(db, employeeId, entries) {
    db.transaction(() => {
        db.prepare(`DELETE FROM employee_area_matrix WHERE employee_id = ?`).run(employeeId);
        const insert = db.prepare(`INSERT INTO employee_area_matrix
         (employee_id, work_area_id, clearance, preference, min_per_week, max_per_week, exempt_rotation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`);
        for (const entry of entries) {
            // Standardwerte nicht speichern - sie ergeben sich ohnehin.
            if (isDefault(entry))
                continue;
            insert.run(employeeId, entry.workAreaId, entry.clearance, entry.preference, entry.minPerWeek, entry.maxPerWeek, entry.exemptRotation ? 1 : 0);
        }
    })();
    return listMatrixForEmployee(db, employeeId);
}
//# sourceMappingURL=matrix.js.map