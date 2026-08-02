import { randomUUID } from 'node:crypto';
import type { Id, Skill } from '@haeppi/shared';
import type { Db } from '../index.js';

interface SkillRow {
  id: string;
  name: string;
  category: string;
  description: string;
  is_active: number;
}

const toSkill = (row: SkillRow): Skill => ({
  id: row.id,
  name: row.name,
  category: row.category,
  description: row.description,
  isActive: row.is_active === 1,
});

export function listSkills(db: Db): Skill[] {
  return (db.prepare(`SELECT * FROM skills ORDER BY category, name`).all() as SkillRow[]).map(
    toSkill,
  );
}

export function getSkill(db: Db, id: Id): Skill | null {
  const row = db.prepare(`SELECT * FROM skills WHERE id = ?`).get(id) as SkillRow | undefined;
  return row ? toSkill(row) : null;
}

export type SkillInput = Omit<Skill, 'id'>;

export function createSkill(db: Db, input: SkillInput): Skill {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO skills (id, name, category, description, is_active) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.category, input.description, input.isActive ? 1 : 0);
  return { id, ...input };
}

export function updateSkill(db: Db, id: Id, input: SkillInput): Skill | null {
  const result = db
    .prepare(
      `UPDATE skills SET name = ?, category = ?, description = ?, is_active = ? WHERE id = ?`,
    )
    .run(input.name, input.category, input.description, input.isActive ? 1 : 0, id);
  return result.changes > 0 ? { id, ...input } : null;
}

export interface SkillUsage {
  readonly employees: number;
  readonly workAreas: number;
}

/**
 * Wo die Qualifikation ueberall haengt.
 *
 * Wird sie geloescht, verlieren Bereiche ihre Pflichtqualifikation - eine
 * VERAH-Sperre auf den Hausbesuchen waere danach still weg. Deshalb wird
 * vor dem Loeschen gewarnt.
 */
export function skillUsage(db: Db, id: Id): SkillUsage {
  const employees = db
    .prepare(`SELECT COUNT(*) AS n FROM employee_skills WHERE skill_id = ?`)
    .get(id) as { n: number };
  const areas = db
    .prepare(`SELECT COUNT(*) AS n FROM work_area_skills WHERE skill_id = ?`)
    .get(id) as { n: number };
  return { employees: employees.n, workAreas: areas.n };
}

export function deleteSkill(db: Db, id: Id): boolean {
  return db.prepare(`DELETE FROM skills WHERE id = ?`).run(id).changes > 0;
}
