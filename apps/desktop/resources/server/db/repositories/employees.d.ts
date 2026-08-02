import type { Employee, Id, WeeklyWorkTimes } from '@haeppi/shared';
import type { Db } from '../index.js';
export interface ListEmployeesOptions {
    readonly includeInactive?: boolean;
}
/**
 * Laedt alle Mitarbeiter samt Arbeitszeiten und Qualifikationen.
 *
 * Bewusst drei Abfragen statt eines Joins mit Zeilenvervielfachung: die
 * Praxis hat ein knappes Dutzend Personen, und der Code bleibt lesbar.
 */
export declare function listEmployees(db: Db, options?: ListEmployeesOptions): Employee[];
export declare function getEmployee(db: Db, id: Id): Employee | null;
export declare function replaceWorkTimes(db: Db, employeeId: Id, workTimes: WeeklyWorkTimes): void;
export declare function replaceSkills(db: Db, employeeId: Id, skillIds: readonly Id[]): void;
/** Eingabedaten fuer Anlegen und Aendern - ohne id und version. */
export type EmployeeInput = Omit<Employee, 'id' | 'version'>;
export declare function createEmployee(db: Db, input: EmployeeInput): Employee;
export declare function updateEmployee(db: Db, id: Id, input: EmployeeInput): Employee;
/**
 * Setzt den Mitarbeiter inaktiv statt ihn zu loeschen.
 *
 * Ein echtes DELETE wuerde per Kaskade die gesamte Vergangenheit
 * mitnehmen - Dienstplaene, Urlaubskonten, Krankmeldungen. Wer die Praxis
 * verlaesst, verschwindet aus der Planung, nicht aus der Historie.
 */
export declare function deactivateEmployee(db: Db, id: Id): boolean;
//# sourceMappingURL=employees.d.ts.map