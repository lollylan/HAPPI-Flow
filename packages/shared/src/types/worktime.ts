import type { Minutes, PracticeWeekday } from './common.js';

/**
 * Arbeitszeit einer Person an einem Wochentag.
 *
 * `breakMin` ist die Mittagspause. Sie wird ausschliesslich von der
 * Arbeitszeit abgezogen und **nicht** verplant - wer wann genau Pause
 * macht, regelt das Team selbst. Standard 60 Minuten, pro Person und
 * Tag aenderbar (manchmal 30, manchmal 90).
 */
export interface DayWorkTime {
  readonly isWorking: boolean;
  readonly startMin: Minutes;
  readonly endMin: Minutes;
  readonly breakMin: Minutes;
}

export type WeeklyWorkTimes = Readonly<Record<PracticeWeekday, DayWorkTime>>;

export const NOT_WORKING: DayWorkTime = {
  isWorking: false,
  startMin: 0,
  endMin: 0,
  breakMin: 0,
};
