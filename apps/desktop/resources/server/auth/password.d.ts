export declare const MIN_PASSWORD_LENGTH = 10;
export declare function hashPassword(plain: string): Promise<string>;
export declare function verifyPassword(storedHash: string, plain: string): Promise<boolean>;
export interface PasswordProblem {
    readonly ok: boolean;
    readonly message?: string;
}
/**
 * Mindestanforderung an ein Passwort. Bewusst nur Laenge statt
 * Zeichenklassen-Zwang - Laenge schuetzt messbar besser als die Pflicht,
 * ein Sonderzeichen anzuhaengen.
 */
export declare function checkPasswordPolicy(plain: string): PasswordProblem;
//# sourceMappingURL=password.d.ts.map