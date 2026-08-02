import type { IsoDate } from '../types/common.js';
import { isPracticeWeekday } from '../types/common.js';
import type { WeeklyWorkTimes } from '../types/worktime.js';
import { eachDateInRange, isoWeekday } from '../time/dates.js';

export interface DateRange {
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
}

export interface VacationCountOptions {
  /**
   * Halber Urlaubstag. Wirkt nur bei eintaegigen Abwesenheiten -
   * bei einem Zeitraum waere die Angabe mehrdeutig und wird ignoriert.
   */
  readonly halfDay?: 'am' | 'pm' | null;
  /**
   * Daten, die nicht auf den Urlaub angerechnet werden - vor allem
   * gesetzliche Feiertage. Wer an Fronleichnam Urlaub hat, verbraucht
   * dafuer keinen Urlaubstag.
   */
  readonly excludedDates?: ReadonlySet<IsoDate>;
}

/**
 * Zaehlt die Tage im Zeitraum, an denen die Person laut Arbeitszeitmodell
 * ueberhaupt arbeitet.
 *
 * Damit verbrauchen Teilzeitkraefte korrekt weniger Urlaub: wer nur
 * Mo/Di/Do arbeitet, verbraucht in einer Urlaubswoche drei Tage, nicht fuenf.
 */
export function countWorkingDays(
  range: DateRange,
  workTimes: WeeklyWorkTimes,
  excludedDates: ReadonlySet<IsoDate> = new Set(),
): number {
  let count = 0;
  for (const date of eachDateInRange(range.startDate, range.endDate)) {
    if (excludedDates.has(date)) continue;
    const weekday = isoWeekday(date);
    if (!isPracticeWeekday(weekday)) continue; // Wochenende
    if (workTimes[weekday].isWorking) count += 1;
  }
  return count;
}

/**
 * Urlaubstage, die eine Abwesenheit tatsaechlich verbraucht.
 *
 * Diese Funktion existierte in der Vorgaengerversion in vier wortgleichen
 * Kopien (VacationView, EmployeesView, Dashboard zweimal). Sie lebt jetzt
 * genau einmal.
 */
export function countVacationDays(
  range: DateRange,
  workTimes: WeeklyWorkTimes,
  options: VacationCountOptions = {},
): number {
  const days = countWorkingDays(range, workTimes, options.excludedDates ?? new Set());
  const isSingleDay = range.startDate === range.endDate;
  if (isSingleDay && options.halfDay) {
    return days * 0.5;
  }
  return days;
}

export interface VacationAccount {
  /** Jahresanspruch. */
  readonly entitlement: number;
  /** Uebertrag aus dem Vorjahr. */
  readonly carryover: number;
}

export interface VacationBalance {
  readonly entitlement: number;
  readonly carryover: number;
  readonly available: number;
  readonly used: number;
  readonly remaining: number;
}

/**
 * Urlaubskonto. `used` wird immer aus den Abwesenheiten berechnet und
 * nie gespeichert - ein persistierter Zaehler laeuft frueher oder spaeter
 * aus dem Ruder.
 */
export function calculateVacationBalance(
  account: VacationAccount,
  approvedVacations: readonly DateRange[],
  workTimes: WeeklyWorkTimes,
  excludedDates: ReadonlySet<IsoDate> = new Set(),
): VacationBalance {
  const used = approvedVacations.reduce(
    (sum, range) => sum + countVacationDays(range, workTimes, { excludedDates }),
    0,
  );
  const available = account.entitlement + account.carryover;
  return {
    entitlement: account.entitlement,
    carryover: account.carryover,
    available,
    used,
    remaining: available - used,
  };
}
