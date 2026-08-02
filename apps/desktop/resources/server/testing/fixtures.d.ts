import type { Db } from '../db/index.js';
/** Frische, migrierte und geseedete Datenbank im Arbeitsspeicher. */
export declare function createTestDb(): Db;
export interface TestUser {
    readonly id: string;
    readonly username: string;
    readonly password: string;
    readonly employeeId?: string;
}
export declare function createUser(db: Db, username: string, password: string, role: 'admin' | 'employee', employeeId?: string): Promise<TestUser>;
export interface CreateEmployeeOptions {
    readonly firstName?: string;
    readonly lastName?: string;
    readonly staffType?: 'doctor' | 'mfa' | 'trainee';
    readonly isPcm?: boolean;
    readonly canHomeoffice?: boolean;
    readonly notes?: string;
}
export declare function createEmployee(db: Db, options?: CreateEmployeeOptions): string;
/** Liest einen Cookie-Wert aus den `set-cookie`-Kopfzeilen einer Antwort. */
export declare function readCookie(setCookie: string[] | undefined, name: string): string | null;
//# sourceMappingURL=fixtures.d.ts.map