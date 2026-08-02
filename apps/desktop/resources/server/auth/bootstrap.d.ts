import type { Db } from '../db/index.js';
export declare function generatePassword(length?: number): string;
export interface BootstrapResult {
    readonly created: boolean;
    readonly username: string;
    readonly password?: string;
}
/**
 * Legt beim allerersten Start ein Verwaltungskonto an.
 *
 * Das Passwort wird zufaellig erzeugt und einmalig auf der Konsole
 * ausgegeben; beim ersten Anmelden muss es geaendert werden. Die
 * Vorgaengerversion hatte ein fest eingebautes `admin`/`admin`, dessen
 * Hash sogar zweimal im Quelltext stand.
 */
export declare function ensureAdminAccount(db: Db): Promise<BootstrapResult>;
export declare function printFirstRunNotice(result: BootstrapResult): void;
//# sourceMappingURL=bootstrap.d.ts.map