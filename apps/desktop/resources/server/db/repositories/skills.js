import { randomUUID } from 'node:crypto';
const toSkill = (row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    isActive: row.is_active === 1,
});
export function listSkills(db) {
    return db.prepare(`SELECT * FROM skills ORDER BY category, name`).all().map(toSkill);
}
export function getSkill(db, id) {
    const row = db.prepare(`SELECT * FROM skills WHERE id = ?`).get(id);
    return row ? toSkill(row) : null;
}
export function createSkill(db, input) {
    const id = randomUUID();
    db.prepare(`INSERT INTO skills (id, name, category, description, is_active) VALUES (?, ?, ?, ?, ?)`).run(id, input.name, input.category, input.description, input.isActive ? 1 : 0);
    return { id, ...input };
}
export function updateSkill(db, id, input) {
    const result = db
        .prepare(`UPDATE skills SET name = ?, category = ?, description = ?, is_active = ? WHERE id = ?`)
        .run(input.name, input.category, input.description, input.isActive ? 1 : 0, id);
    return result.changes > 0 ? { id, ...input } : null;
}
/**
 * Wo die Qualifikation ueberall haengt.
 *
 * Wird sie geloescht, verlieren Bereiche ihre Pflichtqualifikation - eine
 * VERAH-Sperre auf den Hausbesuchen waere danach still weg. Deshalb wird
 * vor dem Loeschen gewarnt.
 */
export function skillUsage(db, id) {
    const employees = db
        .prepare(`SELECT COUNT(*) AS n FROM employee_skills WHERE skill_id = ?`)
        .get(id);
    const areas = db
        .prepare(`SELECT COUNT(*) AS n FROM work_area_skills WHERE skill_id = ?`)
        .get(id);
    return { employees: employees.n, workAreas: areas.n };
}
export function deleteSkill(db, id) {
    return db.prepare(`DELETE FROM skills WHERE id = ?`).run(id).changes > 0;
}
//# sourceMappingURL=skills.js.map