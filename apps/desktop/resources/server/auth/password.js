import { hash, verify } from '@node-rs/argon2';
/**
 * `@node-rs/argon2` exportiert `Algorithm` als ambient const enum. Mit
 * `verbatimModuleSyntax` laesst sich das nicht importieren, deshalb hier
 * der Zahlenwert: 0 = Argon2d, 1 = Argon2i, 2 = Argon2id.
 */
const ARGON2ID = 2;
/**
 * Parameter nach OWASP-Empfehlung fuer argon2id: 19 MiB Speicher,
 * zwei Durchlaeufe, ein Thread.
 *
 * In der Vorgaengerversion wurde im Browser ein einfacher, ungesalzener
 * SHA-256 gebildet und der Hash an alle Clients ausgeliefert. Hashing
 * gehoert auf den Server, und ein Passwort-Hash verlaesst ihn nie.
 */
const OPTIONS = {
    algorithm: ARGON2ID,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
};
export const MIN_PASSWORD_LENGTH = 10;
export async function hashPassword(plain) {
    return hash(plain, OPTIONS);
}
export async function verifyPassword(storedHash, plain) {
    try {
        return await verify(storedHash, plain, OPTIONS);
    }
    catch {
        // Beschaedigter oder fremdformatiger Hash gilt als "passt nicht",
        // nicht als Serverfehler.
        return false;
    }
}
/**
 * Mindestanforderung an ein Passwort. Bewusst nur Laenge statt
 * Zeichenklassen-Zwang - Laenge schuetzt messbar besser als die Pflicht,
 * ein Sonderzeichen anzuhaengen.
 */
export function checkPasswordPolicy(plain) {
    if (plain.length < MIN_PASSWORD_LENGTH) {
        return {
            ok: false,
            message: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`,
        };
    }
    if (/^\d+$/.test(plain)) {
        return { ok: false, message: 'Das Passwort darf nicht nur aus Ziffern bestehen.' };
    }
    return { ok: true };
}
//# sourceMappingURL=password.js.map