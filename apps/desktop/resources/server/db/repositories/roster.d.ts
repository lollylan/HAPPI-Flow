import type { Assignment, HistoryCount, Id, IsoDate, PlanKind, PlannedAssignment, TemplateAssignment } from '@haeppi/shared';
import type { Db } from '../index.js';
/** Zuweisungen eines Zeitraums, optional auf einen der beiden Plaene begrenzt. */
export declare function listAssignments(db: Db, from: IsoDate, to: IsoDate, plan?: PlanKind): Assignment[];
export declare function listLockedAssignments(db: Db, from: IsoDate, to: IsoDate, plan: PlanKind): Assignment[];
/**
 * Ersetzt die Woche eines Plans.
 *
 * Gesperrte Zuweisungen bleiben unangetastet - sie sind bereits als
 * Fixpunkte in die Berechnung eingeflossen und wuerden sonst doppelt
 * angelegt.
 */
export declare function replaceWeek(db: Db, plan: PlanKind, from: IsoDate, to: IsoDate, assignments: readonly PlannedAssignment[]): void;
export declare function createAssignment(db: Db, input: Omit<Assignment, 'id' | 'source' | 'reason'> & {
    reason?: string;
}): Assignment | null;
export declare function deleteAssignment(db: Db, id: Id): boolean;
export declare function setAssignmentLock(db: Db, id: Id, locked: boolean): Assignment | null;
/**
 * Einsaetze der zurueckliegenden Wochen je (Person, Bereich).
 * Grundlage fuer den Fairness-Ausgleich: wer zuletzt oft im Labor stand,
 * wird diese Woche etwas teurer.
 */
export declare function historyCounts(db: Db, plan: PlanKind, weekStart: IsoDate, weeks: number): HistoryCount[];
export declare function listTemplate(db: Db, plan?: PlanKind): TemplateAssignment[];
/** Ersetzt die Musterwoche eines Plans vollstaendig. */
export declare function replaceTemplate(db: Db, plan: PlanKind, entries: readonly Omit<TemplateAssignment, 'id'>[]): TemplateAssignment[];
//# sourceMappingURL=roster.d.ts.map