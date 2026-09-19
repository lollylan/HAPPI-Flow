import type { IsoDate } from './common.js';
import type { GermanState, HolidayOptions } from '../time/holidays.js';
import { DEFAULT_HOLIDAY_OPTIONS, DEFAULT_STATE } from '../time/holidays.js';

/**
 * Feiertagseinstellungen der Praxis.
 *
 * Das Bundesland ist auswaehlbar, weil sich die gesetzlichen Feiertage in
 * Deutschland je Land deutlich unterscheiden - zwischen neun (z. B. Berlin
 * ohne Zusatztage) und dreizehn Feiertagen. Einzelne Tage haengen zusaetzlich
 * an der Gemeinde und sind deshalb separat schaltbar.
 */
export interface HolidaySettings {
  readonly state: GermanState;
  readonly options: HolidayOptions;
  /**
   * Zusaetzliche freie Tage, die kein gesetzlicher Feiertag sind:
   * Heiligabend, Silvester, Betriebsausflug, Fortbildungstag der Praxis.
   * Sie werden wie Feiertage behandelt - kein Dienstplan, kein Urlaubsabzug.
   */
  readonly additionalClosedDates: readonly IsoDate[];
}

export const DEFAULT_HOLIDAY_SETTINGS: HolidaySettings = {
  // Wuerzburg: Bayern, katholisch gepraegte Gemeinde - Mariae Himmelfahrt gilt.
  state: DEFAULT_STATE,
  options: DEFAULT_HOLIDAY_OPTIONS,
  additionalClosedDates: [],
};
