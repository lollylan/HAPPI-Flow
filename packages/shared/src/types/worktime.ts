import type { Minutes, PracticeWeekday } from './common.js';

/** Wo die Person an diesem Tag arbeitet. */
export type WorkLocation = 'practice' | 'home';

export const WORK_LOCATION_LABELS: Readonly<Record<WorkLocation, string>> = {
  practice: 'Praxis',
  home: 'Homeoffice',
};

/**
 * Arbeitszeit einer Person an einem Wochentag.
 *
 * `breakMin` ist die Mittagspause. Sie wird ausschliesslich von der
 * Arbeitszeit abgezogen und **nicht** verplant - wer wann genau Pause
 * macht, regelt das Team selbst. Standard 60 Minuten, pro Person und
 * Tag aenderbar (manchmal 30, manchmal 90).
 *
 * `location` ist der feste Homeoffice-Tag: wer mittwochs von zu Hause
 * arbeitet, ist an dem Tag nur fuer Homeoffice-Bereiche einplanbar.
 */
export interface DayWorkTime {
  readonly isWorking: boolean;
  readonly startMin: Minutes;
  readonly endMin: Minutes;
  readonly breakMin: Minutes;
  readonly location: WorkLocation;
}

export type WeeklyWorkTimes = Readonly<Record<PracticeWeekday, DayWorkTime>>;

export const NOT_WORKING: DayWorkTime = {
  isWorking: false,
  startMin: 0,
  endMin: 0,
  breakMin: 0,
  location: 'practice',
};
