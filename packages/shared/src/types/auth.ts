import type { Id } from './common.js';

/**
 * Berechtigungsrolle - bewusst getrennt von der Personalkategorie
 * (`StaffType`). Eine Aerztin ist fachlich Aerztin, im System aber
 * standardmaessig eine gewoehnliche Nutzerin ohne Planungsrechte.
 */
export type UserRole = 'admin' | 'employee';

export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  admin: 'Praxisleitung',
  employee: 'Mitarbeiter/in',
};

/** Was der Client ueber die angemeldete Person wissen darf. */
export interface SessionUser {
  readonly userId: Id;
  readonly username: string;
  readonly role: UserRole;
  /** `null` bei einem reinen Verwaltungskonto ohne Personalakte. */
  readonly employeeId: Id | null;
  readonly displayName: string;
  readonly mustChangePassword: boolean;
}

export function isAdmin(user: Pick<SessionUser, 'role'> | null): boolean {
  return user?.role === 'admin';
}

/** Ob die Person die Daten dieses Mitarbeiters im Klartext sehen darf. */
export function canSeeAbsenceDetails(user: SessionUser | null, employeeId: Id): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.employeeId === employeeId;
}
