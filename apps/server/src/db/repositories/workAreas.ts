import { randomUUID } from 'node:crypto';
import type { AreaKind, Id, PlanKind, WorkArea } from '@haeppi/shared';
import type { Db } from '../index.js';

interface WorkAreaRow {
  id: string;
  plan: PlanKind;
  name: string;
  description: string;
  kind: AreaKind;
  is_critical: number;
  min_staff: number;
  max_staff: number | null;
  requires_homeoffice: number;
  rotation_min_per_week: number | null;
  icon: string;
  color: string;
  sort_order: number;
  is_active: number;
}

function toWorkArea(
  row: WorkAreaRow,
  requiredSkillIds: readonly Id[],
  blockIds: readonly Id[],
): WorkArea {
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
  };
}

function groupBy(rows: readonly { area: string; value: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.area) ?? [];
    list.push(row.value);
    map.set(row.area, list);
  }
  return map;
}

export function listWorkAreas(db: Db, includeInactive = false): WorkArea[] {
  const rows = db
    .prepare(
      `SELECT * FROM work_areas ${includeInactive ? '' : 'WHERE is_active = 1'}
        ORDER BY plan, sort_order, name`,
    )
    .all() as WorkAreaRow[];

  const skills = groupBy(
    db.prepare(`SELECT work_area_id AS area, skill_id AS value FROM work_area_skills`).all() as {
      area: string;
      value: string;
    }[],
  );
  const blocks = groupBy(
    db
      .prepare(`SELECT work_area_id AS area, day_block_id AS value FROM work_area_blocks`)
      .all() as { area: string; value: string }[],
  );

  return rows.map((row) => toWorkArea(row, skills.get(row.id) ?? [], blocks.get(row.id) ?? []));
}

export function getWorkArea(db: Db, id: Id): WorkArea | null {
  const row = db.prepare(`SELECT * FROM work_areas WHERE id = ?`).get(id) as
    WorkAreaRow | undefined;
  if (!row) return null;

  const skills = db
    .prepare(`SELECT skill_id FROM work_area_skills WHERE work_area_id = ?`)
    .all(id) as { skill_id: string }[];
  const blocks = db
    .prepare(`SELECT day_block_id FROM work_area_blocks WHERE work_area_id = ?`)
    .all(id) as { day_block_id: string }[];

  return toWorkArea(
    row,
    skills.map((entry) => entry.skill_id),
    blocks.map((entry) => entry.day_block_id),
  );
}

export type WorkAreaInput = Omit<WorkArea, 'id'>;

function replaceRelations(db: Db, id: Id, input: WorkAreaInput): void {
  db.prepare(`DELETE FROM work_area_skills WHERE work_area_id = ?`).run(id);
  const insertSkill = db.prepare(
    `INSERT OR IGNORE INTO work_area_skills (work_area_id, skill_id) VALUES (?, ?)`,
  );
  for (const skillId of new Set(input.requiredSkillIds)) insertSkill.run(id, skillId);

  db.prepare(`DELETE FROM work_area_blocks WHERE work_area_id = ?`).run(id);
  const insertBlock = db.prepare(
    `INSERT OR IGNORE INTO work_area_blocks (work_area_id, day_block_id) VALUES (?, ?)`,
  );
  for (const blockId of new Set(input.blockIds)) insertBlock.run(id, blockId);
}

export function createWorkArea(db: Db, input: WorkAreaInput): WorkArea {
  const id = randomUUID();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO work_areas
         (id, plan, name, description, kind, is_critical, min_staff, max_staff,
          requires_homeoffice, rotation_min_per_week, icon, color, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.plan,
      input.name,
      input.description,
      input.kind,
      input.isCritical ? 1 : 0,
      input.minStaff,
      input.maxStaff,
      input.requiresHomeoffice ? 1 : 0,
      input.rotationMinPerWeek,
      input.icon,
      input.color,
      input.sortOrder,
      input.isActive ? 1 : 0,
    );
    replaceRelations(db, id, input);
  })();

  const created = getWorkArea(db, id);
  if (!created) throw new Error('Arbeitsbereich konnte nicht angelegt werden.');
  return created;
}

export function updateWorkArea(db: Db, id: Id, input: WorkAreaInput): WorkArea | null {
  const changed = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE work_areas
            SET plan = ?, name = ?, description = ?, kind = ?, is_critical = ?,
                min_staff = ?, max_staff = ?, requires_homeoffice = ?,
                rotation_min_per_week = ?, icon = ?, color = ?, sort_order = ?, is_active = ?
          WHERE id = ?`,
      )
      .run(
        input.plan,
        input.name,
        input.description,
        input.kind,
        input.isCritical ? 1 : 0,
        input.minStaff,
        input.maxStaff,
        input.requiresHomeoffice ? 1 : 0,
        input.rotationMinPerWeek,
        input.icon,
        input.color,
        input.sortOrder,
        input.isActive ? 1 : 0,
        id,
      );
    if (result.changes === 0) return false;
    replaceRelations(db, id, input);
    return true;
  })();

  return changed ? getWorkArea(db, id) : null;
}

export interface WorkAreaUsage {
  readonly templateAssignments: number;
  readonly assignments: number;
}

/** Wie oft der Bereich schon verplant ist - Grundlage fuer die Loeschwarnung. */
export function workAreaUsage(db: Db, id: Id): WorkAreaUsage {
  const template = db
    .prepare(`SELECT COUNT(*) AS n FROM template_assignments WHERE work_area_id = ?`)
    .get(id) as { n: number };
  const assignments = db
    .prepare(`SELECT COUNT(*) AS n FROM assignments WHERE work_area_id = ?`)
    .get(id) as { n: number };
  return { templateAssignments: template.n, assignments: assignments.n };
}

export function deleteWorkArea(db: Db, id: Id): boolean {
  return db.prepare(`DELETE FROM work_areas WHERE id = ?`).run(id).changes > 0;
}
