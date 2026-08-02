import { randomUUID } from 'node:crypto';
function toWorkArea(row, requiredSkillIds, blockIds, blockMinStaff = {}) {
    return {
        id: row.id,
        plan: row.plan,
        name: row.name,
        description: row.description,
        kind: row.kind,
        isCritical: row.is_critical === 1,
        minStaff: row.min_staff,
        maxStaff: row.max_staff,
        requiresHomeoffice: row.requires_homeoffice === 1,
        rotationMinPerWeek: row.rotation_min_per_week,
        icon: row.icon,
        color: row.color,
        sortOrder: row.sort_order,
        isActive: row.is_active === 1,
        requiredSkillIds,
        blockIds,
        blockMinStaff,
    };
}
function groupBy(rows) {
    const map = new Map();
    for (const row of rows) {
        const list = map.get(row.area) ?? [];
        list.push(row.value);
        map.set(row.area, list);
    }
    return map;
}
export function listWorkAreas(db, includeInactive = false) {
    const rows = db
        .prepare(`SELECT * FROM work_areas ${includeInactive ? '' : 'WHERE is_active = 1'}
        ORDER BY plan, sort_order, name`)
        .all();
    const skills = groupBy(db.prepare(`SELECT work_area_id AS area, skill_id AS value FROM work_area_skills`).all());
    const blockRows = db
        .prepare(`SELECT work_area_id, day_block_id, min_staff FROM work_area_blocks`)
        .all();
    const blocks = groupBy(blockRows.map((row) => ({ area: row.work_area_id, value: row.day_block_id })));
    const overrides = new Map();
    for (const row of blockRows) {
        if (row.min_staff === null)
            continue;
        const current = overrides.get(row.work_area_id) ?? {};
        current[row.day_block_id] = row.min_staff;
        overrides.set(row.work_area_id, current);
    }
    return rows.map((row) => toWorkArea(row, skills.get(row.id) ?? [], blocks.get(row.id) ?? [], overrides.get(row.id) ?? {}));
}
export function getWorkArea(db, id) {
    const row = db.prepare(`SELECT * FROM work_areas WHERE id = ?`).get(id);
    if (!row)
        return null;
    const skills = db
        .prepare(`SELECT skill_id FROM work_area_skills WHERE work_area_id = ?`)
        .all(id);
    const blocks = db
        .prepare(`SELECT day_block_id, min_staff FROM work_area_blocks WHERE work_area_id = ?`)
        .all(id);
    const overrides = {};
    for (const entry of blocks) {
        if (entry.min_staff !== null)
            overrides[entry.day_block_id] = entry.min_staff;
    }
    return toWorkArea(row, skills.map((entry) => entry.skill_id), blocks.map((entry) => entry.day_block_id), overrides);
}
function replaceRelations(db, id, input) {
    db.prepare(`DELETE FROM work_area_skills WHERE work_area_id = ?`).run(id);
    const insertSkill = db.prepare(`INSERT OR IGNORE INTO work_area_skills (work_area_id, skill_id) VALUES (?, ?)`);
    for (const skillId of new Set(input.requiredSkillIds))
        insertSkill.run(id, skillId);
    db.prepare(`DELETE FROM work_area_blocks WHERE work_area_id = ?`).run(id);
    const insertBlock = db.prepare(`INSERT OR IGNORE INTO work_area_blocks (work_area_id, day_block_id, min_staff)
     VALUES (?, ?, ?)`);
    for (const blockId of new Set(input.blockIds)) {
        insertBlock.run(id, blockId, input.blockMinStaff[blockId] ?? null);
    }
}
export function createWorkArea(db, input) {
    const id = randomUUID();
    db.transaction(() => {
        db.prepare(`INSERT INTO work_areas
         (id, plan, name, description, kind, is_critical, min_staff, max_staff,
          requires_homeoffice, rotation_min_per_week, icon, color, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.plan, input.name, input.description, input.kind, input.isCritical ? 1 : 0, input.minStaff, input.maxStaff, input.requiresHomeoffice ? 1 : 0, input.rotationMinPerWeek, input.icon, input.color, input.sortOrder, input.isActive ? 1 : 0);
        replaceRelations(db, id, input);
    })();
    const created = getWorkArea(db, id);
    if (!created)
        throw new Error('Arbeitsbereich konnte nicht angelegt werden.');
    return created;
}
export function updateWorkArea(db, id, input) {
    const changed = db.transaction(() => {
        const result = db
            .prepare(`UPDATE work_areas
            SET plan = ?, name = ?, description = ?, kind = ?, is_critical = ?,
                min_staff = ?, max_staff = ?, requires_homeoffice = ?,
                rotation_min_per_week = ?, icon = ?, color = ?, sort_order = ?, is_active = ?
          WHERE id = ?`)
            .run(input.plan, input.name, input.description, input.kind, input.isCritical ? 1 : 0, input.minStaff, input.maxStaff, input.requiresHomeoffice ? 1 : 0, input.rotationMinPerWeek, input.icon, input.color, input.sortOrder, input.isActive ? 1 : 0, id);
        if (result.changes === 0)
            return false;
        replaceRelations(db, id, input);
        return true;
    })();
    return changed ? getWorkArea(db, id) : null;
}
/** Wie oft der Bereich schon verplant ist - Grundlage fuer die Loeschwarnung. */
export function workAreaUsage(db, id) {
    const template = db
        .prepare(`SELECT COUNT(*) AS n FROM template_assignments WHERE work_area_id = ?`)
        .get(id);
    const assignments = db
        .prepare(`SELECT COUNT(*) AS n FROM assignments WHERE work_area_id = ?`)
        .get(id);
    return { templateAssignments: template.n, assignments: assignments.n };
}
export function deleteWorkArea(db, id) {
    return db.prepare(`DELETE FROM work_areas WHERE id = ?`).run(id).changes > 0;
}
//# sourceMappingURL=workAreas.js.map