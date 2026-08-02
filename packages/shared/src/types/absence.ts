import type { Id, IsoDate, PracticeWeekday } from './common.js';

export type AbsenceType =
  | 'vacation'
  | 'sick'
  | 'training'
  /** Berufsschultag der Auszubildenden. */
  | 'school'
  /** Sonderurlaub, Umzug, Hochzeit. */
  | 'special'
  /** Freizeitausgleich fuer Ueberstunden. */
  | 'timeoff';

export type AbsenceStatus = 'requested' | 'approved' | 'rejected';

export type HalfDay = 'am' | 'pm';

export const ABSENCE_TYPE_LABELS: Readonly<Record<AbsenceType, string>> = {
  vacation: 'Urlaub',
  sick: 'Krank',
  training: 'Fortbildung',
  school: 'Berufsschule',
  special: 'Sonderurlaub',
  timeoff: 'Freizeitausgleich',
};

export const ABSENCE_TYPE_ICONS: Readonly<Record<AbsenceType, string>> = {
  vacation: '🌴',
  sick: '🌡️',
  training: '🎓',
  school: '📚',
  special: '📄',
  timeoff: '⏱️',
};

/** Nur diese Arten verbrauchen Urlaubstage. */
export function consumesVacationDays(type: AbsenceType): boolean {
  return type === 'vacation';
}

/** Volle Sicht - nur fuer Admin und die betroffene Person selbst. */
export interface Absence {
  readonly id: Id;
  readonly employeeId: Id;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly type: AbsenceType;
  readonly status: AbsenceStatus;
  readonly halfDay: HalfDay | null;
  readonly note: string;
  readonly createdBy: Id | null;
  readonly decidedBy: Id | null;
  readonly decidedAt: string | null;
  readonly createdAt: string;
}

/**
 * Was Kolleginnen sehen duerfen: dass jemand fehlt, nicht warum.
 *
 * Der Grund einer Abwesenheit ist eine Gesundheitsangabe. Die API liefert
 * `type`, `note` und `status` fuer fremde Abwesenheiten deshalb gar nicht
 * erst aus - Ausblenden in der Oberflaeche waere kein Schutz.
 */
export interface PublicAbsence {
  readonly id: Id;
  readonly employeeId: Id;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly halfDay: HalfDay | null;
}

/** Wiederkehrende Abwesenheit, vor allem Berufsschultage. */
export interface RecurringAbsence {
  readonly id: Id;
  readonly employeeId: Id;
  readonly weekday: PracticeWeekday;
  readonly type: AbsenceType;
  readonly validFrom: IsoDate;
  readonly validTo: IsoDate | null;
  readonly note: string;
}

/** Praxisschliessung, z. B. Betriebsurlaub zwischen den Jahren. */
export interface Closure {
  readonly id: Id;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly description: string;
  /** Wie viele Personen als Notbesetzung anwesend bleiben. */
  readonly skeletonStaff: number;
}
