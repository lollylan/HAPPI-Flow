import type { Absence, AbsenceStatus, AbsenceType, Closure, HalfDay, Id, IsoDate, RecurringAbsence } from '@haeppi/shared';
import type { Db } from '../index.js';
export declare function listAbsences(db: Db, from: IsoDate, to: IsoDate): Absence[];
export declare function listAbsencesOfEmployee(db: Db, employeeId: Id, year?: number): Absence[];
export declare function getAbsence(db: Db, id: Id): Absence | null;
export interface AbsenceInput {
    readonly employeeId: Id;
    readonly startDate: IsoDate;
    readonly endDate: IsoDate;
    readonly type: AbsenceType;
    readonly status: AbsenceStatus;
    readonly halfDay: HalfDay | null;
    readonly note: string;
}
export declare function createAbsence(db: Db, input: AbsenceInput, createdBy: Id | null): Absence;
export declare function decideAbsence(db: Db, id: Id, status: AbsenceStatus, decidedBy: Id): Absence | null;
export declare function deleteAbsence(db: Db, id: Id): boolean;
export declare function countOpenRequests(db: Db): number;
export declare function listRecurringAbsences(db: Db, employeeId?: Id): RecurringAbsence[];
export declare function createRecurringAbsence(db: Db, input: Omit<RecurringAbsence, 'id'>): RecurringAbsence;
export declare function deleteRecurringAbsence(db: Db, id: Id): boolean;
export declare function listClosures(db: Db): Closure[];
export declare function createClosure(db: Db, input: Omit<Closure, 'id'>): Closure;
export declare function deleteClosure(db: Db, id: Id): boolean;
export interface VacationAccountRow {
    readonly employeeId: Id;
    readonly year: number;
    readonly entitlement: number;
    readonly carryover: number;
    readonly carryoverExpires: IsoDate | null;
}
export declare function getVacationAccount(db: Db, employeeId: Id, year: number): VacationAccountRow;
export declare function setVacationAccount(db: Db, input: VacationAccountRow): void;
//# sourceMappingURL=absences.d.ts.map