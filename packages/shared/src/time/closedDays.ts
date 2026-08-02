import type { IsoDate } from '../types/common.js';
import type { HolidaySettings } from '../types/settings.js';
import { holidayDateSet, holidayName } from './holidays.js';

/**
 * Alle Tage, an denen die Praxis geschlossen ist: gesetzliche Feiertage des
 * gewaehlten Bundeslandes plus die selbst gepflegten Zusatztage.
 *
 * Genau dieses Set erwarten `countVacationDays()` als `excludedDates` und der
 * Scheduler als Sperrtage - damit gilt ueberall dieselbe Definition von
 * "geschlossen", statt sie an drei Stellen leicht unterschiedlich zu bauen.
 */
export function closedDateSet(
  settings: HolidaySettings,
  fromYear: number,
  toYear: number,
): Set<IsoDate> {
  const dates = holidayDateSet(fromYear, toYear, settings.state, settings.options);
  for (const date of settings.additionalClosedDates) {
    dates.add(date);
  }
  return dates;
}

export interface ClosedDayInfo {
  readonly date: IsoDate;
  /** Name des gesetzlichen Feiertags, oder `null` bei einem selbst gepflegten Tag. */
  readonly holiday: string | null;
  readonly isClosed: boolean;
}

/** Auskunft zu einem einzelnen Tag - fuer Tooltips im Dienstplan. */
export function describeClosedDay(date: IsoDate, settings: HolidaySettings): ClosedDayInfo {
  const holiday = holidayName(date, settings.state, settings.options);
  const isAdditional = settings.additionalClosedDates.includes(date);
  return {
    date,
    holiday,
    isClosed: holiday !== null || isAdditional,
  };
}
