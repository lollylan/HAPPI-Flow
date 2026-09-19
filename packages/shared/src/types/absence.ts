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

/**
 * Grenze zwischen Vormittag und Nachmittag fuer halbe Abwesenheitstage.
 * Ein Block, der vor 13:00 beginnt, zaehlt zum Vormittag; einer, der nach
 * 13:00 endet, zum Nachmittag. Der Innendienst 13-16 ist damit Nachmittag.
 */
export const HALF_DAY_SPLIT_MIN = 13 * 60;

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

/**
 * Praxisschliessung, z. B. Betriebsurlaub zwischen den Jahren.
 *
 * Waehrend der Schliessung hat das Team Urlaub. Eine Notbesetzung bleibt
 * an allen Tagen (`skeletonStaff`, meist 0) und an den letzten
 * `prepDays` Arbeitstagen vor der Wiedereroeffnung (`prepStaff`, meist
 * 1-2), um Post, Rezepte und Befunde aufzuarbeiten.
 */
export interface Closure {
  readonly id: Id;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly description: string;
  /** Notbesetzung an allen Schliesstagen. */
  readonly skeletonStaff: number;
  /** So viele Arbeitstage vor dem Ende sind Vorbereitungstage. */
  readonly prepDays: number;
  /** Besetzung an den Vorbereitungstagen. */
  readonly prepStaff: number;
}

/** Wer an einem Schliesstag als Notbesetzung da ist. */
export interface ClosureDuty {
  readonly id: Id;
  readonly closureId: Id;
  readonly employeeId: Id;
  readonly date: IsoDate;
}
