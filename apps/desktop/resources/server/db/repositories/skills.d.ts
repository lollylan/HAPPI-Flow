import type { Id, Skill } from '@haeppi/shared';
import type { Db } from '../index.js';
export declare function listSkills(db: Db): Skill[];
export declare function getSkill(db: Db, id: Id): Skill | null;
export type SkillInput = Omit<Skill, 'id'>;
export declare function createSkill(db: Db, input: SkillInput): Skill;
export declare function updateSkill(db: Db, id: Id, input: SkillInput): Skill | null;
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
export declare function skillUsage(db: Db, id: Id): SkillUsage;
export declare function deleteSkill(db: Db, id: Id): boolean;
//# sourceMappingURL=skills.d.ts.map