/** Eindeutige ID (UUID v4), durchgaengig als String gefuehrt. */
export type Id = string;

/**
 * Datum im Format YYYY-MM-DD, **immer als Ortsdatum** zu lesen.
 * Erzeugt wird es ausschliesslich ueber `toLocalISODate()`.
 */
export type IsoDate = string;

/** Minuten seit Mitternacht: 0 = 00:00, 480 = 08:00, 1440 = 24:00. */
export type Minutes = number;

/** Wochentag nach ISO 8601: 1 = Montag … 7 = Sonntag. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Die Praxis plant Montag bis Freitag. */
export type PracticeWeekday = 1 | 2 | 3 | 4 | 5;

export const PRACTICE_WEEKDAYS: readonly PracticeWeekday[] = [1, 2, 3, 4, 5];

export const WEEKDAY_SHORT: Readonly<Record<IsoWeekday, string>> = {
  1: 'Mo',
  2: 'Di',
  3: 'Mi',
  4: 'Do',
  5: 'Fr',
  6: 'Sa',
  7: 'So',
};

export const WEEKDAY_LABELS: Readonly<Record<IsoWeekday, string>> = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
  7: 'Sonntag',
};

export function isPracticeWeekday(day: IsoWeekday): day is PracticeWeekday {
  return day <= 5;
}
