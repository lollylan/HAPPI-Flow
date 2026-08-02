import type { Id, WorkArea } from '@haeppi/shared';
import type { Db } from '../index.js';
export declare function listWorkAreas(db: Db, includeInactive?: boolean): WorkArea[];
export declare function getWorkArea(db: Db, id: Id): WorkArea | null;
export type WorkAreaInput = Omit<WorkArea, 'id'>;
export declare function createWorkArea(db: Db, input: WorkAreaInput): WorkArea;
export declare function updateWorkArea(db: Db, id: Id, input: WorkAreaInput): WorkArea | null;
export interface WorkAreaUsage {
    readonly templateAssignments: number;
    readonly assignments: number;
}
/** Wie oft der Bereich schon verplant ist - Grundlage fuer die Loeschwarnung. */
export declare function workAreaUsage(db: Db, id: Id): WorkAreaUsage;
export declare function deleteWorkArea(db: Db, id: Id): boolean;
//# sourceMappingURL=workAreas.d.ts.map