import type { Id, IsoDate } from './common.js';
import type { WeeklyWorkTimes } from './worktime.js';

/**
 * Personalkategorie. Bewusst getrennt von der Berechtigungsrolle (`UserRole`):
 * ob jemand Aerztin ist, sagt nichts darueber aus, ob sie den Plan bearbeiten darf.
 */
export type StaffType = 'doctor' | 'mfa' | 'trainee';

export type EmploymentType = 'fulltime' | 'parttime';

export const STAFF_TYPE_LABELS: Readonly<Record<StaffType, string>> = {
  doctor: 'Arzt / Ärztin',
  mfa: 'MFA',
  trainee: 'Auszubildende/r',
};

export interface Employee {
  readonly id: Id;
  readonly firstName: string;
  readonly lastName: string;
  readonly staffType: StaffType;
  /**
   * Primary Care Managerin: haelt eigene Sprechstunde wie eine Aerztin und
   * belegt dabei eines der vier Zimmer. Solange sie Sprechstunde hat, ist sie
   * hart aus dem MFA-Pool gesperrt. Sie bleibt trotzdem eine MFA.
   */
  readonly isPcm: boolean;
  readonly employment: EmploymentType;
  /** Sollstunden laut Vertrag. Das Arbeitszeitmodell kann davon abweichen. */
  readonly targetHoursPerWeek: number;
  /** Harte Voraussetzung fuer Bereiche mit `requiresHomeoffice`. */
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

/** Welcher der beiden Dienstplaene fuer diese Person zustaendig ist. */
export function planForStaffType(staffType: StaffType): 'doctor' | 'mfa' {
  return staffType === 'doctor' ? 'doctor' : 'mfa';
}

export function fullName(employee: Pick<Employee, 'firstName' | 'lastName'>): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

/** Kuerzel fuer enge Plan-Zellen, z. B. "Müller, A." */
export function shortName(employee: Pick<Employee, 'firstName' | 'lastName'>): string {
  const initial = employee.firstName.trim().charAt(0);
  return initial ? `${employee.lastName}, ${initial}.` : employee.lastName;
}
