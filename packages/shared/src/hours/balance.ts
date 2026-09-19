import type { PracticeWeekday } from '../types/common.js';
import { PRACTICE_WEEKDAYS } from '../types/common.js';
import type { DayWorkTime, WeeklyWorkTimes } from '../types/worktime.js';

/**
 * Netto-Arbeitszeit eines Tages in Minuten: Anwesenheit minus Pause.
 *
 * Die Mittagspause ist reiner Zeitabzug. Im Innendienstfenster (Mo/Di/Do
 * 13-16 Uhr) wird nur ein Teil als Pause genommen, der Rest ist Bueroarbeit
 * und zaehlt als Arbeitszeit.
 */
export function netMinutesForDay(day: DayWorkTime): number {
  if (!day.isWorking) return 0;
  const gross = Math.max(0, day.endMin - day.startMin);
  return Math.max(0, gross - day.breakMin);
}

export function netHoursForDay(day: DayWorkTime): number {
  return netMinutesForDay(day) / 60;
}

/** Vertragliche Wochenarbeitszeit in Stunden, aus dem Arbeitszeitmodell gerechnet. */
export function contractedHoursPerWeek(workTimes: WeeklyWorkTimes): number {
  return PRACTICE_WEEKDAYS.reduce((sum, day) => sum + netHoursForDay(workTimes[day]), 0);
}

/** Die Wochentage, an denen die Person ueberhaupt arbeitet. */
export function workingWeekdays(workTimes: WeeklyWorkTimes): PracticeWeekday[] {
  return PRACTICE_WEEKDAYS.filter((day) => workTimes[day].isWorking);
}

export interface HoursBalance {
  /** Sollstunden laut Vertrag. */
  readonly target: number;
  /** Tatsaechlich verplante bzw. geleistete Stunden. */
  readonly actual: number;
  /** Positiv = Ueberstunden, negativ = Unterdeckung. */
  readonly difference: number;
}

export function calculateHoursBalance(target: number, actual: number): HoursBalance {
  return { target, actual, difference: actual - target };
}

/**
 * Rundet Stundenwerte auf zwei Nachkommastellen.
 * Verhindert, dass in der Oberflaeche 7.499999999999999 auftaucht.
 */
export function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}
