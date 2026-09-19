import type { Id, IsoDate } from './common.js';
import type { WeeklyWorkTimes } from './worktime.js';
import type { PlanKind } from './workArea.js';

/**
 * Personalkategorie. Bewusst getrennt von der Berechtigungsrolle (`UserRole`):
 * ob jemand Aerztin ist, sagt nichts darueber aus, ob sie den Plan bearbeiten darf.
 *
 * `pcm` (Primary Care Managerin) ist eine eigene Gruppe mit eigenen
 * Bereichen: sie haelt eigene Sprechstunde und faehrt eigene Hausbesuche,
 * gehoert aber nicht zum MFA-Pool. Ueber die Einsatz-Matrix kann sie
 * trotzdem gezielt fuer einzelne MFA-Bereiche freigegeben werden.
 */
export type StaffType = 'doctor' | 'pcm' | 'mfa' | 'trainee';

export type EmploymentType = 'fulltime' | 'parttime';

export const STAFF_TYPES: readonly StaffType[] = ['doctor', 'pcm', 'mfa', 'trainee'];

export const STAFF_TYPE_LABELS: Readonly<Record<StaffType, string>> = {
  doctor: 'Arzt / Ärztin',
  pcm: 'PCM',
  mfa: 'MFA',
  trainee: 'Auszubildende/r',
};

export interface Employee {
  readonly id: Id;
  readonly firstName: string;
  readonly lastName: string;
  readonly staffType: StaffType;
  readonly employment: EmploymentType;
  /** Sollstunden laut Vertrag. Das Arbeitszeitmodell kann davon abweichen. */
  readonly targetHoursPerWeek: number;
  /** Harte Voraussetzung fuer Bereiche, die im Homeoffice erledigt werden. */
  readonly canHomeoffice: boolean;
  readonly color: string;
  readonly entryDate: IsoDate | null;
  readonly exitDate: IsoDate | null;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly notes: string;
  readonly workTimes: WeeklyWorkTimes;
  readonly skillIds: readonly Id[];
  /** Fuer optimistische Sperre: steigt bei jeder Aenderung. */
  readonly version: number;
}

/** Zu welcher Plan-Gruppe die Person gehoert. */
export function planForStaffType(staffType: StaffType): PlanKind {
  if (staffType === 'doctor') return 'doctor';
  if (staffType === 'pcm') return 'pcm';
  return 'mfa';
}

export function fullName(employee: Pick<Employee, 'firstName' | 'lastName'>): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

/** Kuerzel fuer enge Plan-Zellen, z. B. "Müller, A." */
export function shortName(employee: Pick<Employee, 'firstName' | 'lastName'>): string {
  const initial = employee.firstName.trim().charAt(0);
  return initial ? `${employee.lastName}, ${initial}.` : employee.lastName;
}
