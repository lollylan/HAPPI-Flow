import { randomUUID } from 'node:crypto';
import type { AreaKind, AreaLocation, Id, PlanKind, WorkArea } from '@haeppi/shared';
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
  location: AreaLocation;
  rotation_min_per_week: number | null;
  follow_up_area_id: string | null;
  icon: string;
  color: string;
  sort_order: number;
  is_active: number;
}

function toWorkArea(
  row: WorkAreaRow,
  requiredSkillIds: readonly Id[],
  blockIds: readonly Id[],
  blockMinStaff: Readonly<Record<Id, number>> = {},
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
    location: row.location,
    rotationMinPerWeek: row.rotation_min_per_week,
    followUpAreaId: row.follow_up_area_id,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
    requiredSkillIds,
    blockIds,
    blockMinStaff,
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

const PLAN_ORDER = `CASE plan WHEN 'doctor' THEN 0 WHEN 'pcm' THEN 1 ELSE 2 END`;

export function listWorkAreas(db: Db, includeInactive = false): WorkArea[] {
  const rows = db
    .prepare(
      `SELECT * FROM work_areas ${includeInactive ? '' : 'WHERE is_active = 1'}
        ORDER BY ${PLAN_ORDER}, sort_order, name`,
    )
    .all() as WorkAreaRow[];

  const skills = groupBy(
    db.prepare(`SELECT work_area_id AS area, skill_id AS value FROM work_area_skills`).all() as {
      area: string;
      value: string;
    }[],
  );
  const blockRows = db
    .prepare(`SELECT work_area_id, day_block_id, min_staff FROM work_area_blocks`)
    .all() as { work_area_id: string; day_block_id: string; min_staff: number | null }[];

  const blocks = groupBy(
    blockRows.map((row) => ({ area: row.work_area_id, value: row.day_block_id })),
  );
  const overrides = new Map<string, Record<string, number>>();
  for (const row of blockRows) {
    if (row.min_staff === null) continue;
    const current = overrides.get(row.work_area_id) ?? {};
    current[row.day_block_id] = row.min_staff;
    overrides.set(row.work_area_id, current);
  }

  return rows.map((row) =>
    toWorkArea(
      row,
      skills.get(row.id) ?? [],
      blocks.get(row.id) ?? [],
      overrides.get(row.id) ?? {},
    ),
  );
}

export function getWorkArea(db: Db, id: Id): WorkArea | null {
  const row = db.prepare(`SELECT * FROM work_areas WHERE id = ?`).get(id) as
    WorkAreaRow | undefined;
  if (!row) return null;

  const skills = db
    .prepare(`SELECT skill_id FROM work_area_skills WHERE work_area_id = ?`)
    .all(id) as { skill_id: string }[];
  const blocks = db
    .prepare(`SELECT day_block_id, min_staff FROM work_area_blocks WHERE work_area_id = ?`)
    .all(id) as { day_block_id: string; min_staff: number | null }[];

  const overrides: Record<string, number> = {};
  for (const entry of blocks) {
    if (entry.min_staff !== null) overrides[entry.day_block_id] = entry.min_staff;
  }

  return toWorkArea(
    row,
    skills.map((entry) => entry.skill_id),
    blocks.map((entry) => entry.day_block_id),
    overrides,
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
    `INSERT OR IGNORE INTO work_area_blocks (work_area_id, day_block_id, min_staff)
     VALUES (?, ?, ?)`,
  );
  for (const blockId of new Set(input.blockIds)) {
    insertBlock.run(id, blockId, input.blockMinStaff[blockId] ?? null);
  }
}

export function createWorkArea(db: Db, input: WorkAreaInput): WorkArea {
  const id = randomUUID();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO work_areas
         (id, plan, name, description, kind, is_critical, min_staff, max_staff, location,
          rotation_min_per_week, follow_up_area_id, icon, color, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.plan,
      input.name,
      input.description,
      input.kind,
      input.isCritical ? 1 : 0,
      input.minStaff,
      input.maxStaff,
      input.location,
      input.rotationMinPerWeek,
      input.followUpAreaId,
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
                min_staff = ?, max_staff = ?, location = ?, rotation_min_per_week = ?,
                follow_up_area_id = ?, icon = ?, color = ?, sort_order = ?, is_active = ?
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
        input.location,
        input.rotationMinPerWeek,
        // Ein Bereich kann nicht seine eigene Folgeaufgabe sein.
        input.followUpAreaId === id ? null : input.followUpAreaId,
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
